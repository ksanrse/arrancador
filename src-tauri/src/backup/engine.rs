use crate::backup::save_locator::locate_game_saves;
use crate::backup::sqoba_manifest::{SqobaGame, SqobaManifest};
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufWriter, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::{FileOptions, ZipWriter};
use zip::{CompressionMethod, ZipArchive};

// --- Backup Archive Manifest ---

const SQOBA_MANIFEST_NAME: &str = "__sqoba_manifest.json";
const SQOBA_README_NAME: &str = "__sqoba_readme.txt";
const LEGACY_MANIFEST_NAME: &str = "__arrancador_manifest.json";
const BACKUP_MANIFEST_NAMES: [&str; 2] = [SQOBA_MANIFEST_NAME, LEGACY_MANIFEST_NAME];
const MANIFEST_VERSION: u32 = 2;
const LUDUSAVI_MAPPING_NAME: &str = "mapping.yaml";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BackupArchiveManifest {
    #[serde(default)]
    pub version: u32,
    pub files: Vec<BackupFileEntry>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BackupFileEntry {
    #[serde(rename = "backup_path", alias = "zip_path")]
    pub backup_path: String,
    pub original_path: String,
    pub size: u64,
    #[serde(default)]
    pub mtime: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct BackupProgress {
    pub stage: &'static str,
    pub current: String,
    pub done: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Copy)]
pub enum BackupMode {
    Directory,
    Zip { level: u8 },
}

#[derive(Debug, Clone, Copy)]
pub struct BackupOptions {
    pub mode: BackupMode,
}

impl BackupOptions {
    pub fn directory() -> Self {
        Self {
            mode: BackupMode::Directory,
        }
    }

    pub fn zip(level: u8) -> Self {
        Self {
            mode: BackupMode::Zip { level },
        }
    }
}

impl Default for BackupOptions {
    fn default() -> Self {
        Self::directory()
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LudusaviMapping {
    pub name: String,
    pub drives: HashMap<String, String>,
    pub backups: Vec<LudusaviBackup>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LudusaviBackup {
    pub name: String,
    pub when: String,
    pub files: HashMap<String, LudusaviFile>,
    pub registry: LudusaviRegistry,
    pub children: Vec<LudusaviBackup>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LudusaviFile {
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LudusaviRegistry {
    pub hash: Option<String>,
}

// --- Engine Implementation ---

pub struct BackupEngine {
    manifest: Option<SqobaManifest>,
}

impl BackupEngine {
    pub fn new() -> Self {
        Self { manifest: None }
    }

    pub fn load_manifest(&mut self) -> Result<(), String> {
        self.manifest = crate::backup::sqoba_manifest::load_manifest_optional()?;
        Ok(())
    }

    pub fn find_game_entry(&self, name: &str) -> Option<SqobaGame> {
        self.find_game_entry_with_key(name).map(|(_, entry)| entry)
    }

    fn find_game_entry_with_key(&self, name: &str) -> Option<(String, SqobaGame)> {
        let manifest = self.manifest.as_ref()?;
        manifest.find_game_entry(name)
    }

    /// Finds save files for a game without backing them up
    pub fn find_game_files(&self, name: &str) -> Result<Option<(Vec<PathBuf>, u64)>, String> {
        let discovery = locate_game_saves(name, self.manifest.as_ref(), None)?;
        let Some(discovery) = discovery else {
            return Ok(None);
        };

        let files = discovery
            .files
            .iter()
            .map(|entry| entry.path.clone())
            .collect();

        Ok(Some((files, discovery.total_size)))
    }

    pub fn backup_game(&self, name: &str, destination: &Path) -> Result<u64, String> {
        self.backup_game_with_threads(name, destination, 4)
    }

    pub fn backup_game_with_threads(
        &self,
        name: &str,
        destination: &Path,
        threads: usize,
    ) -> Result<u64, String> {
        self.backup_game_with_threads_and_progress(name, destination, threads, None)
    }

    pub fn backup_game_with_threads_and_progress(
        &self,
        name: &str,
        destination: &Path,
        threads: usize,
        progress: Option<Arc<dyn Fn(BackupProgress) + Send + Sync>>,
    ) -> Result<u64, String> {
        self.backup_game_with_options_and_progress(
            name,
            destination,
            threads,
            BackupOptions::default(),
            progress,
        )
    }

    pub fn backup_game_with_options(
        &self,
        name: &str,
        destination: &Path,
        options: BackupOptions,
    ) -> Result<u64, String> {
        self.backup_game_with_options_and_progress(name, destination, 4, options, None)
    }

    pub fn backup_game_with_threads_and_options(
        &self,
        name: &str,
        destination: &Path,
        threads: usize,
        options: BackupOptions,
    ) -> Result<u64, String> {
        self.backup_game_with_options_and_progress(name, destination, threads, options, None)
    }

    pub fn backup_game_with_options_and_progress(
        &self,
        name: &str,
        destination: &Path,
        threads: usize,
        options: BackupOptions,
        progress: Option<Arc<dyn Fn(BackupProgress) + Send + Sync>>,
    ) -> Result<u64, String> {
        let matched_name = self.find_game_entry_with_key(name).map(|(key, _)| key);
        let discovery = locate_game_saves(name, self.manifest.as_ref(), None)?;
        let discovery = match discovery {
            Some(discovery) => discovery,
            None => {
                let suggestions = self.suggest_games(name, 5);
                if suggestions.is_empty() {
                    return Err(format!("No save data found for '{}'", name));
                }
                return Err(format!(
                    "No save data found for '{}'. Closest matches: {}",
                    name,
                    suggestions.join(", ")
                ));
            }
        };

        let file_list: Vec<BackupSourceFile> = discovery
            .files
            .iter()
            .map(|entry| BackupSourceFile {
                path: entry.path.clone(),
                backup_path: build_backup_rel_path(&entry.root_label, &entry.relative_path),
            })
            .collect();

        let total_bytes = match options.mode {
            BackupMode::Directory => self.backup_to_directory(
                destination,
                &file_list,
                threads,
                progress,
            )?,
            BackupMode::Zip { level } => {
                self.backup_to_zip(destination, &file_list, level, progress)?
            }
        };

        if let Some(matched_name) = matched_name {
            if matched_name != name {
                println!("Backup matched '{}' to manifest entry '{}'", name, matched_name);
            }
        }

        Ok(total_bytes)
    }

    pub fn restore_backup(&self, backup_path: &Path) -> Result<(), String> {
        self.restore_backup_with_threads(backup_path, 4)
    }

    pub fn restore_backup_with_threads(
        &self,
        backup_path: &Path,
        threads: usize,
    ) -> Result<(), String> {
        self.restore_backup_with_threads_and_progress(backup_path, threads, None)
    }

    pub fn restore_backup_with_threads_and_progress(
        &self,
        backup_path: &Path,
        threads: usize,
        progress: Option<Arc<dyn Fn(BackupProgress) + Send + Sync>>,
    ) -> Result<(), String> {
        if backup_path.is_dir() {
            if let Some(manifest) = read_manifest_from_dir(backup_path)? {
                let items: Vec<(PathBuf, PathBuf)> = manifest
                    .files
                    .into_iter()
                    .map(|entry| {
                        let source_path =
                            backup_path.join(path_from_backup_rel(&entry.backup_path));
                        let target_path = PathBuf::from(&entry.original_path);
                        (source_path, target_path)
                    })
                    .collect();

                let thread_pool = rayon::ThreadPoolBuilder::new()
                    .num_threads(threads.max(1))
                    .build()
                    .map_err(|e| e.to_string())?;

                let total = items.len();
                let counter = AtomicUsize::new(0);
                let progress_ref = progress.clone();

                let results: Vec<Result<(), String>> = thread_pool.install(|| {
                    items
                        .par_iter()
                        .map(|(source, target)| {
                            if let Some(parent) = target.parent() {
                                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                            }
                            if source.exists() {
                                fs::copy(source, target).map_err(|e| e.to_string())?;
                            }
                            let done = counter.fetch_add(1, Ordering::SeqCst) + 1;
                            if let Some(cb) = &progress_ref {
                                if done == total || done % 50 == 0 {
                                    cb(BackupProgress {
                                        stage: "restore",
                                        current: target.to_string_lossy().to_string(),
                                        done,
                                        total,
                                    });
                                }
                            }
                            Ok(())
                        })
                        .collect()
                });

                for r in results {
                    r?;
                }

                return Ok(());
            }

            let mapping_path = backup_path.join(LUDUSAVI_MAPPING_NAME);
            if mapping_path.exists() {
                return self.restore_from_ludusavi_mapping(backup_path, &mapping_path);
            }
        }

        let file = File::open(backup_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

        let manifest = read_manifest_from_zip(&mut archive)?
            .ok_or_else(|| "Backup manifest missing in archive".to_string())?;

        for entry in manifest.files {
            let mut zipped = archive
                .by_name(&entry.backup_path)
                .map_err(|e| format!("Missing file in archive: {}", e))?;

            let target_path = PathBuf::from(&entry.original_path);
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let mut out_file = File::create(&target_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut zipped, &mut out_file).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    fn backup_to_directory(
        &self,
        destination: &Path,
        files: &[BackupSourceFile],
        threads: usize,
        progress: Option<Arc<dyn Fn(BackupProgress) + Send + Sync>>,
    ) -> Result<u64, String> {
        fs::create_dir_all(destination).map_err(|e| e.to_string())?;

        let thread_pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads.max(1))
            .build()
            .map_err(|e| e.to_string())?;

        let total = files.len();
        let counter = AtomicUsize::new(0);
        let progress_ref = progress.clone();

        let results: Vec<Result<BackupFileEntry, String>> = thread_pool.install(|| {
            files
                .par_iter()
                .map(|file| {
                    let size = self.copy_file_to_backup(destination, &file.path, &file.backup_path)?;
                    let done = counter.fetch_add(1, Ordering::SeqCst) + 1;
                    if let Some(cb) = &progress_ref {
                        if done == total || done % 50 == 0 {
                            cb(BackupProgress {
                                stage: "copy",
                                current: file.path.to_string_lossy().to_string(),
                                done,
                                total,
                            });
                        }
                    }
                    Ok(BackupFileEntry {
                        backup_path: file.backup_path.clone(),
                        original_path: file.path.to_string_lossy().to_string(),
                        size,
                        mtime: file_mtime(&file.path),
                    })
                })
                .collect()
        });

        let mut entries: Vec<BackupFileEntry> = Vec::new();
        let mut total_bytes = 0;
        for r in results {
            let entry = r?;
            total_bytes += entry.size;
            entries.push(entry);
        }

        let manifest = build_manifest(&entries);
        self.write_manifest_to_dir(destination, &manifest)?;
        self.write_readme_to_dir(destination)?;

        Ok(total_bytes)
    }

    fn backup_to_zip(
        &self,
        destination: &Path,
        files: &[BackupSourceFile],
        level: u8,
        progress: Option<Arc<dyn Fn(BackupProgress) + Send + Sync>>,
    ) -> Result<u64, String> {
        if destination.exists() && destination.is_dir() {
            return Err("Backup destination must be a file path for archives".to_string());
        }

        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let file = File::create(destination).map_err(|e| e.to_string())?;
        let writer = BufWriter::new(file);
        let mut archive = ZipWriter::new(writer);
        let file_options = zip_data_options(level);
        let total = files.len();

        let mut entries: Vec<BackupFileEntry> = Vec::with_capacity(total);
        let mut total_bytes = 0u64;

        for (index, file) in files.iter().enumerate() {
            let mut source = File::open(&file.path).map_err(|e| e.to_string())?;
            let metadata = source.metadata().map_err(|e| e.to_string())?;
            let size = metadata.len();
            let mtime = metadata.modified().ok().and_then(system_time_to_epoch_seconds);

            archive
                .start_file(&file.backup_path, file_options)
                .map_err(|e| e.to_string())?;
            std::io::copy(&mut source, &mut archive).map_err(|e| e.to_string())?;

            entries.push(BackupFileEntry {
                backup_path: file.backup_path.clone(),
                original_path: file.path.to_string_lossy().to_string(),
                size,
                mtime,
            });
            total_bytes += size;

            let done = index + 1;
            if let Some(cb) = &progress {
                if done == total || done % 50 == 0 {
                    cb(BackupProgress {
                        stage: "copy",
                        current: file.path.to_string_lossy().to_string(),
                        done,
                        total,
                    });
                }
            }
        }

        let manifest = build_manifest(&entries);
        self.write_manifest_to_zip(&mut archive, &manifest)?;
        self.write_readme_to_zip(&mut archive)?;
        archive.finish().map_err(|e| e.to_string())?;

        Ok(total_bytes)
    }

    fn copy_file_to_backup(
        &self,
        backup_root: &Path,
        file_path: &Path,
        backup_rel: &str,
    ) -> Result<u64, String> {
        let target_path = backup_root.join(path_from_backup_rel(backup_rel));
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let bytes = fs::copy(file_path, &target_path).map_err(|e| e.to_string())?;
        Ok(bytes)
    }

    fn write_manifest_to_dir(
        &self,
        backup_root: &Path,
        manifest: &BackupArchiveManifest,
    ) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?;
        let manifest_path = backup_root.join(SQOBA_MANIFEST_NAME);
        fs::write(manifest_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn write_manifest_to_zip<W: Write + Seek>(
        &self,
        archive: &mut ZipWriter<W>,
        manifest: &BackupArchiveManifest,
    ) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?;
        let options = zip_metadata_options();
        archive
            .start_file(SQOBA_MANIFEST_NAME, options)
            .map_err(|e| e.to_string())?;
        archive.write_all(&json).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn write_readme_to_dir(&self, backup_root: &Path) -> Result<(), String> {
        let readme = backup_readme_text();
        let readme_path = backup_root.join(SQOBA_README_NAME);
        fs::write(readme_path, readme.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn write_readme_to_zip<W: Write + Seek>(
        &self,
        archive: &mut ZipWriter<W>,
    ) -> Result<(), String> {
        let readme = backup_readme_text();
        let options = zip_metadata_options();
        archive
            .start_file(SQOBA_README_NAME, options)
            .map_err(|e| e.to_string())?;
        archive.write_all(readme.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn restore_from_ludusavi_mapping(
        &self,
        backup_root: &Path,
        mapping_path: &Path,
    ) -> Result<(), String> {
        let mapping_text = fs::read_to_string(mapping_path).map_err(|e| e.to_string())?;
        let mapping: LudusaviMapping =
            serde_yaml::from_str(&mapping_text).map_err(|e| e.to_string())?;
        let backup = mapping
            .backups
            .last()
            .ok_or("No backup entries in mapping")?;

        let mut inverse: HashMap<String, String> = HashMap::new();
        for (key, prefix) in &mapping.drives {
            inverse.insert(prefix.clone(), key.clone());
        }

        for (original, _) in &backup.files {
            let (drive_key, rel) = split_drive_for_restore(original, &inverse);
            let source_path =
                backup_root.join(path_from_backup_rel(&format!("{}/{}", drive_key, rel)));
            let target_path = PathBuf::from(original.replace('/', "\\"));
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            if source_path.exists() {
                fs::copy(&source_path, &target_path).map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }

    pub fn suggest_games(&self, name: &str, limit: usize) -> Vec<String> {
        self.manifest
            .as_ref()
            .map(|manifest| manifest.suggest_games(name, limit))
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
struct BackupSourceFile {
    path: PathBuf,
    backup_path: String,
}

fn build_manifest(entries: &[BackupFileEntry]) -> BackupArchiveManifest {
    BackupArchiveManifest {
        version: MANIFEST_VERSION,
        files: entries.to_vec(),
    }
}

fn read_manifest_from_dir(backup_root: &Path) -> Result<Option<BackupArchiveManifest>, String> {
    for name in BACKUP_MANIFEST_NAMES {
        let manifest_path = backup_root.join(name);
        if manifest_path.exists() {
            let manifest_text = fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
            let manifest = serde_json::from_str(&manifest_text).map_err(|e| e.to_string())?;
            return Ok(Some(manifest));
        }
    }
    Ok(None)
}

fn read_manifest_from_zip<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<Option<BackupArchiveManifest>, String> {
    for name in BACKUP_MANIFEST_NAMES {
        if let Ok(mut manifest_file) = archive.by_name(name) {
            let mut manifest_buf = String::new();
            manifest_file
                .read_to_string(&mut manifest_buf)
                .map_err(|e| e.to_string())?;
            let manifest = serde_json::from_str(&manifest_buf).map_err(|e| e.to_string())?;
            return Ok(Some(manifest));
        }
    }
    Ok(None)
}

fn backup_readme_text() -> String {
    format!(
        "SQOBA backup format\n\
\n\
This folder contains raw save files plus a manifest.\n\
- {}: list of files and original paths\n\
- files/: backed up files in the same names/structure as saves\n\
\n\
To restore manually:\n\
1) Open {}\n\
2) For each entry, copy files/<path> to original_path\n",
        SQOBA_MANIFEST_NAME, SQOBA_MANIFEST_NAME
    )
}

fn file_mtime(path: &Path) -> Option<i64> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(system_time_to_epoch_seconds)
}

fn system_time_to_epoch_seconds(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs() as i64)
}

fn zip_data_options(level: u8) -> FileOptions<'static, ()> {
    FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(map_deflate_level(level)))
}

fn zip_metadata_options() -> FileOptions<'static, ()> {
    FileOptions::default().compression_method(CompressionMethod::Stored)
}

fn map_deflate_level(level: u8) -> i64 {
    let clamped = level.clamp(1, 100) as i64;
    ((clamped - 1) * 8 / 99) + 1
}

fn path_from_backup_rel(rel: &str) -> PathBuf {
    let mut out = PathBuf::new();
    for part in rel.split('/') {
        if part.is_empty() {
            continue;
        }
        out.push(part);
    }
    out
}

fn split_drive_for_restore(
    original: &str,
    inverse_drives: &HashMap<String, String>,
) -> (String, String) {
    let re = Regex::new(r"^([A-Za-z]):[\\/](.*)$").unwrap();
    if let Some(caps) = re.captures(original) {
        let letter = caps.get(1).unwrap().as_str().to_uppercase();
        let rest = caps.get(2).unwrap().as_str().replace('\\', "/");
        let prefix = format!("{}:", letter);
        if let Some(key) = inverse_drives.get(&prefix) {
            return (key.clone(), rest);
        }
        return (format!("drive-{}", letter), rest);
    }
    ("drive-0".to_string(), original.replace('\\', "/"))
}

fn build_backup_rel_path(root: &str, relative: &Path) -> String {
    let mut rel = relative.to_string_lossy().replace('\\', "/");
    while rel.starts_with('/') {
        rel = rel[1..].to_string();
    }
    if rel.is_empty() {
        rel = "file".to_string();
    }
    format!("files/{}/{}", root, rel)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::sqoba_manifest::{SqobaGame, SqobaManifest};
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn backup_and_restore_roundtrip() {
        let dir = tempdir().expect("tempdir");
        let save_dir = dir.path().join("saves");
        let nested_dir = save_dir.join("sub");
        fs::create_dir_all(&nested_dir).expect("mkdirs");

        let file_a = save_dir.join("save1.txt");
        let file_b = nested_dir.join("save2.bin");

        fs::write(&file_a, b"alpha").expect("write file_a");
        fs::write(&file_b, b"beta").expect("write file_b");

        let mut files = HashMap::new();
        files.insert(
            "root".to_string(),
            vec![
                file_a.to_string_lossy().to_string(),
                save_dir.to_string_lossy().to_string(),
            ],
        );

        let mut games = HashMap::new();
        games.insert(
            "Test Game".to_string(),
            SqobaGame {
                files: Some(files),
                registry: None,
            },
        );

        let engine = BackupEngine {
            manifest: Some(SqobaManifest { games }),
        };

        let backup_path = dir.path().join("backup");
        let total_size = engine
            .backup_game("Test Game", &backup_path)
            .expect("backup");

        assert!(total_size > 0);
        assert!(backup_path.join(SQOBA_MANIFEST_NAME).exists());
        assert!(backup_path.join(SQOBA_README_NAME).exists());

        let manifest_text = fs::read_to_string(backup_path.join(SQOBA_MANIFEST_NAME))
            .expect("read manifest");
        let manifest: BackupArchiveManifest =
            serde_json::from_str(&manifest_text).expect("parse manifest");
        assert!(!manifest.files.is_empty());
        for entry in manifest.files {
            assert!(entry.backup_path.starts_with("files/root-"));
        }

        fs::remove_file(&file_a).expect("remove file_a");
        fs::remove_file(&file_b).expect("remove file_b");

        engine.restore_backup(&backup_path).expect("restore");

        let restored_a = fs::read(&file_a).expect("read restored a");
        let restored_b = fs::read(&file_b).expect("read restored b");

        assert_eq!(restored_a, b"alpha");
        assert_eq!(restored_b, b"beta");
    }

    #[test]
    fn zip_backup_and_restore_roundtrip() {
        let dir = tempdir().expect("tempdir");
        let save_dir = dir.path().join("saves");
        let nested_dir = save_dir.join("sub");
        fs::create_dir_all(&nested_dir).expect("mkdirs");

        let file_a = save_dir.join("save1.txt");
        let file_b = nested_dir.join("save2.bin");

        fs::write(&file_a, b"alpha").expect("write file_a");
        fs::write(&file_b, b"beta").expect("write file_b");

        let mut files = HashMap::new();
        files.insert(
            "root".to_string(),
            vec![
                file_a.to_string_lossy().to_string(),
                save_dir.to_string_lossy().to_string(),
            ],
        );

        let mut games = HashMap::new();
        games.insert(
            "Test Game".to_string(),
            SqobaGame {
                files: Some(files),
                registry: None,
            },
        );

        let engine = BackupEngine {
            manifest: Some(SqobaManifest { games }),
        };

        let backup_path = dir.path().join("backup.sqoba.zip");
        let total_size = engine
            .backup_game_with_threads_and_options(
                "Test Game",
                &backup_path,
                2,
                BackupOptions::zip(60),
            )
            .expect("backup");

        assert!(total_size > 0);
        assert!(backup_path.exists());

        fs::remove_file(&file_a).expect("remove file_a");
        fs::remove_file(&file_b).expect("remove file_b");

        engine.restore_backup(&backup_path).expect("restore");

        let restored_a = fs::read(&file_a).expect("read restored a");
        let restored_b = fs::read(&file_b).expect("read restored b");

        assert_eq!(restored_a, b"alpha");
        assert_eq!(restored_b, b"beta");
    }
}
