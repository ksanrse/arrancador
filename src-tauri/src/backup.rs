use crate::database::with_db;
use tauri::Emitter;
use chrono::{DateTime, Local, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::Arc;
use uuid::Uuid;
#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use windows::core::PCWSTR;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(target_os = "windows")]
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::IO::DeviceIoControl;
#[cfg(target_os = "windows")]
use windows::Win32::System::Ioctl::{
    IOCTL_STORAGE_QUERY_PROPERTY, STORAGE_PROPERTY_QUERY, StorageDeviceSeekPenaltyProperty,
    PropertyStandardQuery, DEVICE_SEEK_PENALTY_DESCRIPTOR,
};

// Import our new native engine
#[path = "backup/engine.rs"]
pub mod engine;
use engine::BackupEngine;
use engine::BackupProgress;

lazy_static::lazy_static! {
    static ref BACKUP_ENGINE: Mutex<BackupEngine> = Mutex::new(BackupEngine::new());
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: String,
    pub game_id: String,
    pub backup_path: String,
    pub backup_size: i64,
    pub created_at: String,
    pub is_auto: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub game_name: String,
    pub save_path: Option<String>,
    pub registry_path: Option<String>,
    pub total_size: u64,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupProgressEvent {
    pub game_id: String,
    pub stage: String,
    pub message: String,
    pub done: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreCheck {
    pub should_restore: bool,
    pub backup_id: Option<String>,
    pub current_size: u64,
    pub backup_size: i64,
}

fn get_backup_directory() -> PathBuf {
    let custom_path: String = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'backup_directory'")?;
        let result: String = stmt.query_row([], |row| row.get(0)).unwrap_or_default();
        Ok(result)
    })
    .unwrap_or_default();

    if !custom_path.is_empty() {
        return PathBuf::from(custom_path);
    }

    // Default backup directory
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("arrancador").join("backups")
}

fn sanitize_folder_name(name: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut cleaned: String = name.chars().filter(|c| !invalid.contains(c)).collect();
    cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        "game".to_string()
    } else {
        cleaned
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DiskType {
    Hdd,
    Ssd,
    Unknown,
}

fn get_drive_letter(path: &Path) -> Option<String> {
    let s = path.to_string_lossy();
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        return Some(s[0..2].to_string());
    }
    None
}

fn load_disk_type(letter: &str) -> Option<DiskType> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let key = format!("disk_type_{}", letter);
        let value: Option<String> = stmt.query_row(params![key], |row| row.get(0)).ok();
        Ok(value)
    })
    .ok()
    .flatten()
    .and_then(|v| match v.as_str() {
        "hdd" => Some(DiskType::Hdd),
        "ssd" => Some(DiskType::Ssd),
        _ => Some(DiskType::Unknown),
    })
}

fn save_disk_type(letter: &str, disk_type: DiskType) {
    let value = match disk_type {
        DiskType::Hdd => "hdd",
        DiskType::Ssd => "ssd",
        DiskType::Unknown => "unknown",
    };
    let key = format!("disk_type_{}", letter);
    let _ = with_db(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    });
}

#[cfg(target_os = "windows")]
fn detect_disk_type_windows(path: &Path) -> DiskType {
    let letter = match get_drive_letter(path) {
        Some(l) => l,
        None => return DiskType::Unknown,
    };
    if let Some(cached) = load_disk_type(&letter) {
        return cached;
    }
    let device = format!("\\\\.\\{}", letter);
    let wide: Vec<u16> = OsStr::new(&device)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let handle = unsafe {
        CreateFileW(
            PCWSTR(wide.as_ptr()),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            HANDLE::default(),
        )
    };
    let handle = match handle {
        Ok(h) => h,
        Err(_) => return DiskType::Unknown,
    };
    if handle.is_invalid() {
        return DiskType::Unknown;
    }

    let query = STORAGE_PROPERTY_QUERY {
        PropertyId: StorageDeviceSeekPenaltyProperty,
        QueryType: PropertyStandardQuery,
        AdditionalParameters: [0],
    };
    let mut desc = DEVICE_SEEK_PENALTY_DESCRIPTOR {
        Version: 0,
        Size: std::mem::size_of::<DEVICE_SEEK_PENALTY_DESCRIPTOR>() as u32,
        IncursSeekPenalty: false.into(),
    };
    let mut bytes_returned = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            Some(&query as *const _ as _),
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            Some(&mut desc as *mut _ as _),
            std::mem::size_of::<DEVICE_SEEK_PENALTY_DESCRIPTOR>() as u32,
            Some(&mut bytes_returned),
            None,
        )
        .is_ok()
    };
    unsafe {
        let _ = CloseHandle(handle);
    }
    let disk_type = if ok && desc.IncursSeekPenalty.as_bool() {
        DiskType::Hdd
    } else if ok {
        DiskType::Ssd
    } else {
        DiskType::Unknown
    };
    save_disk_type(&letter, disk_type);
    disk_type
}

#[cfg(not(target_os = "windows"))]
fn detect_disk_type_windows(_path: &Path) -> DiskType {
    DiskType::Unknown
}

fn get_disk_threads(path: &Path) -> usize {
    let cpu_count = num_cpus::get().max(1);
    match detect_disk_type_windows(path) {
        DiskType::Hdd => 2.min(cpu_count),
        DiskType::Ssd => 8.min(cpu_count),
        DiskType::Unknown => 4.min(cpu_count),
    }
}

fn get_game_year(game_id: &str) -> Option<String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT released FROM games WHERE id = ?1")?;
        let released: Option<String> = stmt.query_row(params![game_id], |row| row.get(0)).ok();
        Ok(released)
    })
    .ok()
    .flatten()
    .and_then(|r| r.split('-').next().map(|s| s.to_string()))
}

fn get_max_backups() -> i32 {
    with_db(|conn| {
        let mut stmt =
            conn.prepare("SELECT value FROM settings WHERE key = 'max_backups_per_game'")?;
        let val: String = stmt
            .query_row([], |row| row.get(0))
            .unwrap_or_else(|_| "5".to_string());
        Ok(val.parse::<i32>().unwrap_or(5))
    })
    .unwrap_or(5)
}

// Deprecated but kept for API compatibility, always returns true now
#[tauri::command]
pub fn check_ludusavi_installed() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub fn get_ludusavi_executable_path() -> Result<Option<String>, String> {
    Ok(Some("native".to_string()))
}

#[tauri::command]
pub fn set_ludusavi_path(_path: String) -> Result<(), String> {
    Ok(()) // No-op
}

#[tauri::command]
pub fn set_backup_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))?;

    with_db(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_directory', ?1)",
            params![path],
        )?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_backup_directory_setting() -> Result<String, String> {
    Ok(get_backup_directory().to_string_lossy().to_string())
}

#[tauri::command]
pub fn find_game_saves(game_name: String) -> Result<Option<BackupInfo>, String> {
    let mut engine = BACKUP_ENGINE.lock().map_err(|e| e.to_string())?;

    // Ensure manifest is loaded
    engine
        .load_manifest()
        .map_err(|e| format!("Failed to load manifest: {}", e))?;

    match engine.find_game_files(&game_name) {
        Ok(Some((files, size))) => {
            // Convert PathBufs to Strings
            let file_strings: Vec<String> = files
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            let first_path = file_strings.first().cloned();

            Ok(Some(BackupInfo {
                game_name,
                save_path: first_path,
                registry_path: None, // TODO: Implement registry check if needed
                total_size: size,
                files: file_strings,
            }))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn create_backup(
    app: tauri::AppHandle,
    game_id: String,
    game_name: String,
    is_auto: bool,
    notes: Option<String>,
) -> Result<Backup, String> {
    let game_id_clone = game_id.clone();
    let game_name_clone = game_name.clone();
    tauri::async_runtime::spawn_blocking(move || {
        create_backup_inner(Some(app), game_id_clone, game_name_clone, is_auto, notes)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn create_backup_inner(
    app: Option<tauri::AppHandle>,
    game_id: String,
    game_name: String,
    is_auto: bool,
    notes: Option<String>,
) -> Result<Backup, String> {
    let mut engine = BACKUP_ENGINE.lock().map_err(|e| e.to_string())?;
    // Ensure manifest
    engine
        .load_manifest()
        .map_err(|e| format!("Failed to load manifest: {}", e))?;

    let backup_root = get_backup_directory();
    let threads = get_disk_threads(&backup_root);
    let year = get_game_year(&game_id);
    let safe_name = sanitize_folder_name(&game_name);
    let game_folder = match year {
        Some(y) => format!("{}-{}", safe_name, y),
        None => safe_name,
    };

    let game_backup_dir = backup_root.join(game_folder);
    fs::create_dir_all(&game_backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Create timestamped backup folder
    let timestamp = Local::now().format("%H%M%S_%d%m%Y").to_string();
    let backup_path = game_backup_dir.join(&timestamp);

    // Run native backup
    if let Some(app) = &app {
        let _ = app.emit(
            "backup:progress",
            BackupProgressEvent {
                game_id: game_id.clone(),
                stage: "scan".to_string(),
                message: "Scanning backup files".to_string(),
                done: 0,
                total: 0,
            },
        );
    }

    let progress: Option<Arc<dyn Fn(BackupProgress) + Send + Sync>> = app.as_ref().map(|app| {
        let app = app.clone();
        let game_id = game_id.clone();
        Arc::new(move |p: BackupProgress| {
            let _ = app.emit(
                "backup:progress",
                BackupProgressEvent {
                    game_id: game_id.clone(),
                    stage: p.stage.to_string(),
                    message: p.current,
                    done: p.done,
                    total: p.total,
                },
            );
        }) as Arc<dyn Fn(BackupProgress) + Send + Sync>
    });

    let backup_size = engine.backup_game_with_threads_and_progress(
        &game_name,
        &backup_path,
        threads,
        progress,
    )?;

    if let Some(app) = &app {
        let _ = app.emit(
            "backup:progress",
            BackupProgressEvent {
                game_id: game_id.clone(),
                stage: "done".to_string(),
                message: "Backup completed".to_string(),
                done: 0,
                total: 0,
            },
        );
    }

    if backup_size == 0 {
        let _ = fs::remove_dir_all(&backup_path);
        return Err("No save data found for this game".to_string());
    }

    // Record backup in database
    let backup_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();

    with_db(|conn| {
        conn.execute(
            "INSERT INTO backups (id, game_id, backup_path, backup_size, created_at, is_auto, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                backup_id,
                game_id,
                backup_path.to_string_lossy().to_string(),
                backup_size as i64,
                created_at,
                if is_auto { 1 } else { 0 },
                notes
            ],
        )?;

        // Update game backup info
        conn.execute(
            "UPDATE games SET last_backup = ?1, backup_count = backup_count + 1, backup_enabled = 1 WHERE id = ?2",
            params![created_at, game_id],
        )?;

        Ok(())
    })
    .map_err(|e| e.to_string())?;

    // Cleanup old backups
    cleanup_old_backups(&game_id)?;

    Ok(Backup {
        id: backup_id,
        game_id,
        backup_path: backup_path.to_string_lossy().to_string(),
        backup_size: backup_size as i64,
        created_at,
        is_auto,
        notes,
    })
}

fn cleanup_old_backups(game_id: &str) -> Result<(), String> {
    let max_backups = get_max_backups();

    let backups: Vec<Backup> = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, backup_path, backup_size, created_at, is_auto, notes
             FROM backups WHERE game_id = ?1 ORDER BY created_at DESC",
        )?;

        let backups = stmt
            .query_map(params![game_id], |row| {
                Ok(Backup {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    backup_path: row.get(2)?,
                    backup_size: row.get(3)?,
                    created_at: row.get(4)?,
                    is_auto: row.get::<_, i32>(5)? == 1,
                    notes: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(backups)
    })
    .map_err(|e: rusqlite::Error| e.to_string())?;

    // Keep only max_backups, delete the rest
    if backups.len() > max_backups as usize {
        for backup in backups.iter().skip(max_backups as usize) {
            // Delete backup path directly
            let backup_path = Path::new(&backup.backup_path);
            if backup_path.exists() {
                if backup_path.is_dir() {
                    let _ = fs::remove_dir_all(backup_path);
                } else {
                    let _ = fs::remove_file(backup_path);
                }
            }

            // Remove from database
            with_db(|conn| {
                conn.execute("DELETE FROM backups WHERE id = ?1", params![backup.id])?;
                Ok(())
            })
            .ok();
        }

        // Update backup count
        with_db(|conn| {
            conn.execute(
                "UPDATE games SET backup_count = ?1 WHERE id = ?2",
                params![max_backups, game_id],
            )?;
            Ok(())
        })
        .ok();
    }

    Ok(())
}

#[tauri::command]
pub fn get_game_backups(game_id: String) -> Result<Vec<Backup>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, backup_path, backup_size, created_at, is_auto, notes
             FROM backups WHERE game_id = ?1 ORDER BY created_at DESC",
        )?;

        let backups = stmt
            .query_map(params![game_id], |row| {
                Ok(Backup {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    backup_path: row.get(2)?,
                    backup_size: row.get(3)?,
                    created_at: row.get(4)?,
                    is_auto: row.get::<_, i32>(5)? == 1,
                    notes: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(backups)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle, backup_id: String) -> Result<(), String> {
    let backup: Backup = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, backup_path, backup_size, created_at, is_auto, notes
             FROM backups WHERE id = ?1",
        )?;

        stmt.query_row(params![backup_id], |row| {
            Ok(Backup {
                id: row.get(0)?,
                game_id: row.get(1)?,
                backup_path: row.get(2)?,
                backup_size: row.get(3)?,
                created_at: row.get(4)?,
                is_auto: row.get::<_, i32>(5)? == 1,
                notes: row.get(6)?,
            })
        })
    })
    .map_err(|e| e.to_string())?;

    let backup_path = backup.backup_path.clone();
    let game_id = backup.game_id.clone();
    let threads = get_disk_threads(Path::new(&backup_path));
    tauri::async_runtime::spawn_blocking(move || {
        let engine = BACKUP_ENGINE.lock().map_err(|e| e.to_string())?;
        let progress: Arc<dyn Fn(BackupProgress) + Send + Sync> = {
            let app = app.clone();
            let game_id = game_id.clone();
            Arc::new(move |p: BackupProgress| {
                let _ = app.emit(
                    "restore:progress",
                    BackupProgressEvent {
                        game_id: game_id.clone(),
                        stage: p.stage.to_string(),
                        message: p.current,
                        done: p.done,
                        total: p.total,
                    },
                );
            }) as Arc<dyn Fn(BackupProgress) + Send + Sync>
        };
        let result =
            engine.restore_backup_with_threads_and_progress(Path::new(&backup_path), threads, Some(progress));
        let _ = app.emit(
            "restore:progress",
            BackupProgressEvent {
                game_id: game_id.clone(),
                stage: "done".to_string(),
                message: "Restore completed".to_string(),
                done: 0,
                total: 0,
            },
        );
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn delete_backup(backup_id: String) -> Result<(), String> {
    let backup: Backup = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, backup_path, backup_size, created_at, is_auto, notes
             FROM backups WHERE id = ?1",
        )?;

        stmt.query_row(params![backup_id], |row| {
            Ok(Backup {
                id: row.get(0)?,
                game_id: row.get(1)?,
                backup_path: row.get(2)?,
                backup_size: row.get(3)?,
                created_at: row.get(4)?,
                is_auto: row.get::<_, i32>(5)? == 1,
                notes: row.get(6)?,
            })
        })
    })
    .map_err(|e| e.to_string())?;

    // Delete backup path
    let backup_path = Path::new(&backup.backup_path);
    if backup_path.exists() {
        if backup_path.is_dir() {
            fs::remove_dir_all(backup_path)
                .map_err(|e| format!("Failed to delete backup directory: {}", e))?;
        } else {
            fs::remove_file(backup_path)
                .map_err(|e| format!("Failed to delete backup file: {}", e))?;
        }
    }

    // Remove from database
    with_db(|conn| {
        conn.execute("DELETE FROM backups WHERE id = ?1", params![backup_id])?;
        conn.execute(
            "UPDATE games SET backup_count = backup_count - 1 WHERE id = ?1 AND backup_count > 0",
            params![backup.game_id],
        )?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn should_backup_before_launch(game_id: String) -> Result<bool, String> {
    // Check if auto backup is enabled globally
    let auto_backup: String = with_db(|conn| {
        let mut stmt =
            conn.prepare("SELECT value FROM settings WHERE key = 'backup_before_launch'")?;
        let result: String = stmt
            .query_row([], |row| row.get(0))
            .unwrap_or_else(|_| "true".to_string());
        Ok(result)
    })
    .unwrap_or_else(|_| "true".to_string());

    if auto_backup != "true" {
        return Ok(false);
    }

    // Check if game has backup enabled
    let backup_enabled: bool = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT backup_enabled FROM games WHERE id = ?1")?;
        let enabled: i32 = stmt
            .query_row(params![game_id], |row| row.get(0))
            .unwrap_or(0);
        Ok(enabled == 1)
    })
    .unwrap_or(false);

    Ok(backup_enabled)
}

#[tauri::command]
pub fn check_backup_needed(game_id: String, game_name: String) -> Result<bool, String> {
    // Find current save data
    let save_info = find_game_saves(game_name)?;

    if save_info.is_none() {
        return Ok(false);
    }

    let save_info = save_info.unwrap();

    // Get last backup
    let last_backup: Option<Backup> = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, backup_path, backup_size, created_at, is_auto, notes
             FROM backups WHERE game_id = ?1 ORDER BY created_at DESC LIMIT 1",
        )?;

        let backup = stmt
            .query_row(params![game_id], |row| {
                Ok(Backup {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    backup_path: row.get(2)?,
                    backup_size: row.get(3)?,
                    created_at: row.get(4)?,
                    is_auto: row.get::<_, i32>(5)? == 1,
                    notes: row.get(6)?,
                })
            })
            .ok();
        Ok(backup)
    })
    .ok()
    .flatten();

    match last_backup {
        None => Ok(true), // No backup exists, should create one
        Some(backup) => {
            // Check if save data is newer and larger than backup
            let _current_size = save_info.total_size as i64;

            // If current save is larger, we should backup
            // Note: ZIP compression makes this check unreliable if we compare compressed vs raw
            // So we just check time mostly.

            // Check modification time of save files
            for file_path in &save_info.files {
                if let Ok(metadata) = fs::metadata(file_path) {
                    if let Ok(modified) = metadata.modified() {
                        let file_time: DateTime<Utc> = modified.into();
                        if let Ok(backup_time) = DateTime::parse_from_rfc3339(&backup.created_at) {
                            if file_time > backup_time.with_timezone(&Utc) {
                                return Ok(true);
                            }
                        }
                    }
                }
            }

            Ok(false)
        }
    }
}

#[tauri::command]
pub fn check_restore_needed(game_id: String, game_name: String) -> Result<RestoreCheck, String> {
    let save_info = find_game_saves(game_name)?;

    if save_info.is_none() {
        return Ok(RestoreCheck {
            should_restore: false,
            backup_id: None,
            current_size: 0,
            backup_size: 0,
        });
    }

    let save_info = save_info.unwrap();

    let last_backup: Option<Backup> = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, backup_path, backup_size, created_at, is_auto, notes
             FROM backups WHERE game_id = ?1 ORDER BY created_at DESC LIMIT 1",
        )?;

        let backup = stmt
            .query_row(params![game_id], |row| {
                Ok(Backup {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    backup_path: row.get(2)?,
                    backup_size: row.get(3)?,
                    created_at: row.get(4)?,
                    is_auto: row.get::<_, i32>(5)? == 1,
                    notes: row.get(6)?,
                })
            })
            .ok();
        Ok(backup)
    })
    .ok()
    .flatten();

    match last_backup {
        None => Ok(RestoreCheck {
            should_restore: false,
            backup_id: None,
            current_size: save_info.total_size,
            backup_size: 0,
        }),
        Some(backup) => {
            let should_restore = save_info.total_size < backup.backup_size as u64;
            Ok(RestoreCheck {
                should_restore,
                backup_id: Some(backup.id),
                current_size: save_info.total_size,
                backup_size: backup.backup_size,
            })
        }
    }
}

pub fn auto_backup_on_exit(game_id: &str) -> Result<(), String> {
    let auto_backup: String = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'auto_backup'")?;
        let result: String = stmt
            .query_row([], |row| row.get(0))
            .unwrap_or_else(|_| "true".to_string());
        Ok(result)
    })
    .unwrap_or_else(|_| "true".to_string());

    if auto_backup != "true" {
        return Ok(());
    }

    let (game_name, backup_enabled) = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT name, backup_enabled FROM games WHERE id = ?1")?;
        let result = stmt.query_row(params![game_id], |row| {
            let name: String = row.get(0)?;
            let enabled: i32 = row.get(1)?;
            Ok((name, enabled == 1))
        });
        Ok(result.ok())
    })
    .unwrap_or(None)
    .ok_or_else(|| "Game not found".to_string())?;

    if !backup_enabled {
        return Ok(());
    }

    if !check_backup_needed(game_id.to_string(), game_name.clone())? {
        return Ok(());
    }

    create_backup_inner(
        None,
        game_id.to_string(),
        game_name,
        true,
        Some("Auto backup after exit".to_string()),
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_backup_settings() -> Result<serde_json::Value, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT key, value FROM settings WHERE key LIKE 'backup%' OR key = 'ludusavi_path' OR key = 'max_backups_per_game'")?;

        let mut settings = serde_json::Map::new();
        let mut rows = stmt.query([])?;

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            settings.insert(key, serde_json::Value::String(value));
        }

        Ok(serde_json::Value::Object(settings))
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_backup_settings(settings: serde_json::Value) -> Result<(), String> {
    let obj = settings.as_object().ok_or("Settings must be an object")?;

    with_db(|conn| {
        for (key, value) in obj {
            if let Some(val_str) = value.as_str() {
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                    params![key, val_str],
                )?;
            }
        }
        Ok(())
    })
    .map_err(|e| e.to_string())
}
