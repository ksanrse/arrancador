use crate::database::with_db;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub ludusavi_path: String,
    pub backup_directory: String,
    pub auto_backup: bool,
    pub backup_before_launch: bool,
    pub max_backups_per_game: i32,
    pub rawg_api_key: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            ludusavi_path: String::new(),
            backup_directory: String::new(),
            auto_backup: true,
            backup_before_launch: true,
            max_backups_per_game: 5,
            rawg_api_key: String::new(),
        }
    }
}

#[tauri::command]
pub fn get_all_settings() -> Result<AppSettings, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let mut rows = stmt.query([])?;

        let mut settings = AppSettings::default();

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;

            match key.as_str() {
                "theme" => settings.theme = value,
                "ludusavi_path" => settings.ludusavi_path = value,
                "backup_directory" => settings.backup_directory = value,
                "auto_backup" => settings.auto_backup = value == "true",
                "backup_before_launch" => settings.backup_before_launch = value == "true",
                "max_backups_per_game" => {
                    settings.max_backups_per_game = value.parse().unwrap_or(5)
                }
                "rawg_api_key" => settings.rawg_api_key = value,
                _ => {}
            }
        }

        Ok(settings)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(settings: AppSettings) -> Result<(), String> {
    with_db(|conn| {
        let pairs = vec![
            ("theme", settings.theme),
            ("ludusavi_path", settings.ludusavi_path),
            ("backup_directory", settings.backup_directory),
            (
                "auto_backup",
                if settings.auto_backup {
                    "true"
                } else {
                    "false"
                }
                .to_string(),
            ),
            (
                "backup_before_launch",
                if settings.backup_before_launch {
                    "true"
                } else {
                    "false"
                }
                .to_string(),
            ),
            (
                "max_backups_per_game",
                settings.max_backups_per_game.to_string(),
            ),
            ("rawg_api_key", settings.rawg_api_key),
        ];

        for (key, value) in pairs {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )?;
        }

        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_setting(key: String) -> Result<Option<String>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let value = stmt.query_row(params![key], |row| row.get(0)).ok();
        Ok(value)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(key: String, value: String) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_scan_directory(path: String) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "INSERT OR IGNORE INTO scan_directories (path) VALUES (?1)",
            params![path],
        )?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_scan_directories() -> Result<Vec<String>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT path FROM scan_directories")?;
        let paths = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(paths)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_scan_directory(path: String) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "DELETE FROM scan_directories WHERE path = ?1",
            params![path],
        )?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}
