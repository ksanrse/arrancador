use serde::{Deserialize, Serialize};
use serde_yaml::Value as YamlValue;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::ZipArchive;
use regex::Regex;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

// --- Manifest Structures ---

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Manifest {
    pub games: HashMap<String, GameManifest>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GameManifest {
    pub files: Option<HashMap<String, Vec<String>>>, // <Tag, Paths>
    pub registry: Option<Vec<String>>,
}

// --- Backup Archive Manifest ---

const BACKUP_MANIFEST_NAME: &str = "__arrancador_manifest.json";
const BACKUP_README_NAME: &str = "__arrancador_readme.txt";
const LUDUSAVI_MAPPING_NAME: &str = "mapping.yaml";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BackupArchiveManifest {
    pub version: u32,
    pub files: Vec<BackupFileEntry>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BackupFileEntry {
    #[serde(rename = "backup_path", alias = "zip_path")]
    pub backup_path: String,
    pub original_path: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct BackupProgress {
    pub stage: &'static str,
    pub current: String,
    pub done: usize,
    pub total: usize,
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
    manifest: Option<Manifest>,
}

impl BackupEngine {
    pub fn new() -> Self {
        Self { manifest: None }
    }

    /// Loads the manifest from cache or downloads it
    pub fn load_manifest(&mut self) -> Result<(), String> {
        let cache_path = dirs::data_local_dir()
            .unwrap_or(PathBuf::from("."))
            .join("arrancador")
            .join("manifest.json");

        // Try load from cache
        if cache_path.exists() {
            if let Ok(file) = File::open(&cache_path) {
                let reader = std::io::BufReader::new(file);
                if let Ok(m) = serde_json::from_reader(reader) {
                    self.manifest = Some(m);
                    return Ok(());
                }
            }
        }

        // Download YAML if missing or failed
        println!("Downloading Ludusavi manifest...");
        let client = reqwest::blocking::Client::new();
        let resp = client
            .get("https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml")
            .header("User-Agent", "Arrancador/0.1.0")
            .send()
            .map_err(|e| e.to_string())?;

        let text = if resp.status().is_success() {
            resp.text().map_err(|e| e.to_string())?
        } else {
            let status = resp.status();
            let body = resp.text().unwrap_or_else(|_| "<no body>".to_string());
            return Err(format!(
                "Failed to download manifest: {} - {}",
                status, body
            ));
        };

        let manifest = match manifest_from_yaml(&text) {
            Ok(m) => m,
            Err(e) => {
                // Fallback to local manifest for dev builds
                let candidates = [
                    PathBuf::from("example")
                        .join("ludusavi-manifest-master")
                        .join("data")
                        .join("manifest.yaml"),
                    PathBuf::from("example")
                        .join("ludusavi-manifest")
                        .join("data")
                        .join("manifest.yaml"),
                ];
                let mut loaded: Option<Manifest> = None;
                for local in candidates {
                    if local.exists() {
                        let local_text =
                            fs::read_to_string(&local).map_err(|e2| e2.to_string())?;
                        let parsed = manifest_from_yaml(&local_text)
                            .map_err(|e2| format!("Failed to parse local manifest: {}", e2))?;
                        loaded = Some(parsed);
                        break;
                    }
                }
                if let Some(m) = loaded {
                    m
                } else {
                    return Err(format!("Failed to parse manifest: {}", e));
                }
            }
        };

        // Save to cache
        if let Some(parent) = cache_path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let mut file = File::create(&cache_path).map_err(|e| e.to_string())?;
        let json = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
        file.write_all(&json).map_err(|e| e.to_string())?;

        self.manifest = Some(manifest);
        Ok(())
    }

    pub fn find_game_entry(&self, name: &str) -> Option<GameManifest> {
        self.find_game_entry_with_key(name).map(|(_, entry)| entry)
    }

    fn find_game_entry_with_key(&self, name: &str) -> Option<(String, GameManifest)> {
        let manifest = self.manifest.as_ref()?;
        if let Some(entry) = manifest.games.get(name) {
            return Some((name.to_string(), entry.clone()));
        }

        let normalized = normalize_name(name);
        let mut best: Option<(String, f32)> = None;

        for (key, entry) in &manifest.games {
            let key_norm = normalize_name(key);
            if key_norm == normalized {
                return Some((key.clone(), entry.clone()));
            }

            let score = similarity_score(&normalized, &key_norm);
            if best.as_ref().map(|b| score > b.1).unwrap_or(true) {
                best = Some((key.clone(), score));
            }
        }

        if let Some((best_key, best_score)) = best {
            if best_score >= 0.6 {
                return manifest
                    .games
                    .get(&best_key)
                    .cloned()
                    .map(|entry| (best_key, entry));
            }
        }

        None
    }

    /// Finds save files for a game without backing them up
    pub fn find_game_files(&self, name: &str) -> Result<Option<(Vec<PathBuf>, u64)>, String> {
        let game_entry = match self.find_game_entry(name) {
            Some(entry) => entry,
            None => return Ok(None),
        };

        let mut files = Vec::new();
        let mut total_size = 0;

        if let Some(files_map) = game_entry.files {
            for (_, paths) in files_map {
                for raw_path in paths {
                    let resolved = self.resolve_path(&raw_path);
                    for path in resolved {
                        if path.is_file() {
                            if let Ok(meta) = fs::metadata(&path) {
                                total_size += meta.len();
                                files.push(path);
                            }
                        } else if path.is_dir() {
                            for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
                                if entry.file_type().is_file() {
                                    total_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
                                    files.push(entry.path().to_path_buf());
                                }
                            }
                        }
                    }
                }
            }
        }

        if files.is_empty() {
            return Ok(None);
        }

        Ok(Some((files, total_size)))
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
        let (matched_name, game_entry) = self
            .find_game_entry_with_key(name)
            .ok_or_else(|| {
                let suggestions = self.suggest_games(name, 5);
                if suggestions.is_empty() {
                    format!("Game '{}' not found in manifest", name)
                } else {
                    format!(
                        "Game '{}' not found in manifest. Closest matches: {}",
                        name,
                        suggestions.join(", ")
                    )
                }
            })?;

        fs::create_dir_all(destination).map_err(|e| e.to_string())?;

        let mut file_list: Vec<(PathBuf, String)> = Vec::new();
        let mut seen: HashSet<PathBuf> = HashSet::new();
        let mut root_index = 0usize;
        // 1. Process Files
        if let Some(files_map) = game_entry.files {
            for (_, paths) in files_map {
                for raw_path in paths {
                    let resolved = self.resolve_path(&raw_path);
                    for path in resolved {
                        let root_label = format!("root-{}", root_index);
                        root_index += 1;
                        if path.is_file() {
                            let file_name = path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "file".to_string());
                            let rel_path = PathBuf::from(file_name);
                            let backup_rel = build_backup_rel_path(&root_label, &rel_path);
                            if seen.insert(path.clone()) {
                                file_list.push((path, backup_rel));
                            }
                        } else if path.is_dir() {
                            for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
                                if entry.file_type().is_file() {
                                    let rel_path = entry
                                        .path()
                                        .strip_prefix(&path)
                                        .unwrap_or(entry.path())
                                        .to_path_buf();
                                    let backup_rel = build_backup_rel_path(&root_label, &rel_path);
                                    let entry_path = entry.path().to_path_buf();
                                    if seen.insert(entry_path.clone()) {
                                        file_list.push((entry_path, backup_rel));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let thread_pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads.max(1))
            .build()
            .map_err(|e| e.to_string())?;

        let total = file_list.len();
        let counter = AtomicUsize::new(0);
        let progress_ref = progress.clone();

        let results: Vec<Result<BackupFileEntry, String>> = thread_pool.install(|| {
            file_list
                .par_iter()
                .map(|(path, backup_path)| {
                    let size = self.copy_file_to_backup(destination, path, backup_path)?;
                    let done = counter.fetch_add(1, Ordering::SeqCst) + 1;
                    if let Some(cb) = &progress_ref {
                        if done == total || done % 50 == 0 {
                            cb(BackupProgress {
                                stage: "copy",
                                current: path.to_string_lossy().to_string(),
                                done,
                                total,
                            });
                        }
                    }
                    Ok(BackupFileEntry {
                        backup_path: backup_path.clone(),
                        original_path: path.to_string_lossy().to_string(),
                        size,
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

        self.write_manifest_to_dir(destination, &entries)?;
        self.write_readme_to_dir(destination)?;

        if matched_name != name {
            println!("Backup matched '{}' to manifest entry '{}'", name, matched_name);
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
            let manifest_path = backup_path.join(BACKUP_MANIFEST_NAME);
            if manifest_path.exists() {
                let manifest_text =
                    fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
                let manifest: BackupArchiveManifest =
                    serde_json::from_str(&manifest_text).map_err(|e| e.to_string())?;

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

        let manifest: BackupArchiveManifest = {
            let mut manifest_file = archive
                .by_name(BACKUP_MANIFEST_NAME)
                .map_err(|_| "Backup manifest missing in archive".to_string())?;
            let mut manifest_buf = String::new();
            manifest_file
                .read_to_string(&mut manifest_buf)
                .map_err(|e| e.to_string())?;
            serde_json::from_str(&manifest_buf).map_err(|e| e.to_string())?
        };

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

    // --- Path Resolution Logic ---

    fn resolve_path(&self, raw_path: &str) -> Vec<PathBuf> {
        let mut base_path = raw_path.to_string();
        let mut candidates = Vec::new();

        // 1. Replacements
        if let Some(dirs) = dirs::home_dir() {
            base_path = base_path.replace("<home>", dirs.to_str().unwrap());
        }
        if let Some(docs) = dirs::document_dir() {
            base_path = base_path.replace("<winDocuments>", docs.to_str().unwrap());
            base_path = base_path.replace("<documents>", docs.to_str().unwrap());
        }
        if let Some(data) = dirs::data_dir() {
            base_path = base_path.replace("<winAppData>", data.to_str().unwrap());
        }
        if let Some(local) = dirs::data_local_dir() {
            base_path = base_path.replace("<winLocalAppData>", local.to_str().unwrap());
        }

        // <steam> is harder, need to find steam path via registry or default locations
        if base_path.contains("<steam>") {
            if let Some(steam_path) = self.find_steam_path() {
                base_path = base_path.replace("<steam>", steam_path.to_str().unwrap());
            } else {
                return vec![]; // Cannot resolve steam path
            }
        }

        // 2. Glob expansion
        if base_path.contains('*') || base_path.contains('?') {
            if let Ok(paths) = glob::glob(&base_path) {
                for p in paths.filter_map(|x| x.ok()) {
                    candidates.push(p);
                }
            }
        } else {
            let p = PathBuf::from(&base_path);
            if p.exists() {
                candidates.push(p);
            }
        }

        candidates
    }

    fn find_steam_path(&self) -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            use winreg::enums::*;
            use winreg::RegKey;

            let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
            if let Ok(key) = hklm.open_subkey("SOFTWARE\\Wow6432Node\\Valve\\Steam") {
                if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                    return Some(PathBuf::from(path));
                }
            }
            if let Ok(key) = hklm.open_subkey("SOFTWARE\\Valve\\Steam") {
                if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                    return Some(PathBuf::from(path));
                }
            }
        }

        let paths = vec!["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"];
        for p in paths {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Some(pb);
            }
        }
        None
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
        entries: &[BackupFileEntry],
    ) -> Result<(), String> {
        let manifest = BackupArchiveManifest {
            version: 1,
            files: entries.to_vec(),
        };
        let json = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        let manifest_path = backup_root.join(BACKUP_MANIFEST_NAME);
        fs::write(manifest_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn write_readme_to_dir(&self, backup_root: &Path) -> Result<(), String> {
        let readme = "\
Arrancador backup format\n\
\n\
This folder contains raw save files plus a manifest.\n\
- __arrancador_manifest.json: list of files and original paths\n\
- files/: backed up files in the same names/structure as saves\n\
\n\
To restore manually:\n\
1) Open __arrancador_manifest.json\n\
2) For each entry, copy files/<path> to original_path\n\
";
        let readme_path = backup_root.join(BACKUP_README_NAME);
        fs::write(readme_path, readme.as_bytes()).map_err(|e| e.to_string())?;
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
        let manifest = match &self.manifest {
            Some(m) => m,
            None => return Vec::new(),
        };
        let normalized = normalize_name(name);
        let mut scored: Vec<(String, f32)> = manifest
            .games
            .keys()
            .map(|key| {
                let score = similarity_score(&normalized, &normalize_name(key));
                (key.clone(), score)
            })
            .filter(|(_, score)| *score >= 0.4)
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().take(limit).map(|(k, _)| k).collect()
    }
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

fn normalize_name(name: &str) -> String {
    let lower = name.to_lowercase();
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let cleaned = re.replace_all(&lower, " ");
    let stop_words = [
        "the", "a", "an", "edition", "definitive", "remastered", "goty", "game", "of", "year",
        "ultimate", "complete", "collection", "bundle", "deluxe", "enhanced", "hd",
    ];
    let tokens: Vec<&str> = cleaned
        .split_whitespace()
        .filter(|t| !stop_words.contains(t))
        .collect();
    tokens.join(" ")
}

fn similarity_score(a: &str, b: &str) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    if a.contains(b) || b.contains(a) {
        return 0.9;
    }
    let set_a: HashSet<&str> = a.split_whitespace().collect();
    let set_b: HashSet<&str> = b.split_whitespace().collect();
    if set_a.is_empty() || set_b.is_empty() {
        return 0.0;
    }
    let inter = set_a.intersection(&set_b).count() as f32;
    let union = set_a.union(&set_b).count() as f32;
    inter / union
}

fn manifest_from_yaml(text: &str) -> Result<Manifest, String> {
    let root: YamlValue = serde_yaml::from_str(text).map_err(|e| e.to_string())?;
    let mapping = root
        .as_mapping()
        .ok_or_else(|| "Invalid manifest format".to_string())?;

    let mut games: HashMap<String, GameManifest> = HashMap::new();

    for (game_name, game_val) in mapping {
        let name = match game_name.as_str() {
            Some(n) => n.to_string(),
            None => continue,
        };

        let mut files_map: HashMap<String, Vec<String>> = HashMap::new();
        if let Some(files) = game_val.as_mapping().and_then(|m| m.get(&YamlValue::from("files"))).and_then(|v| v.as_mapping()) {
            for (path_key, meta_val) in files {
                let path = match path_key.as_str() {
                    Some(p) => p.to_string(),
                    None => continue,
                };
                if !is_path_applicable(meta_val) {
                    continue;
                }
                let tags = extract_tags(meta_val);
                for tag in tags {
                    files_map.entry(tag).or_default().push(path.clone());
                }
            }
        }

        let game_manifest = GameManifest {
            files: if files_map.is_empty() { None } else { Some(files_map) },
            registry: None,
        };
        games.insert(name, game_manifest);
    }

    Ok(Manifest { games })
}

fn extract_tags(meta: &YamlValue) -> Vec<String> {
    if let Some(tags) = meta
        .as_mapping()
        .and_then(|m| m.get(&YamlValue::from("tags")))
        .and_then(|v| v.as_sequence())
    {
        let mut out = Vec::new();
        for t in tags {
            if let Some(s) = t.as_str() {
                out.push(s.to_string());
            }
        }
        if !out.is_empty() {
            return out;
        }
    }
    vec!["save".to_string()]
}

fn is_path_applicable(meta: &YamlValue) -> bool {
    let when = meta
        .as_mapping()
        .and_then(|m| m.get(&YamlValue::from("when")))
        .and_then(|v| v.as_sequence());
    if when.is_none() {
        return true;
    }

    for cond in when.unwrap() {
        if let Some(map) = cond.as_mapping() {
            if let Some(os_val) = map.get(&YamlValue::from("os")).and_then(|v| v.as_str()) {
                let os = os_val.to_lowercase();
                if os == "windows" || os == "win" {
                    return true;
                } else {
                    continue;
                }
            } else {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
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
            GameManifest {
                files: Some(files),
                registry: None,
            },
        );

        let engine = BackupEngine {
            manifest: Some(Manifest { games }),
        };

        let backup_path = dir.path().join("backup");
        let total_size = engine
            .backup_game("Test Game", &backup_path)
            .expect("backup");

        assert!(total_size > 0);
        assert!(backup_path.join(BACKUP_MANIFEST_NAME).exists());
        assert!(backup_path.join(BACKUP_README_NAME).exists());

        let manifest_text = fs::read_to_string(backup_path.join(BACKUP_MANIFEST_NAME))
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
}
