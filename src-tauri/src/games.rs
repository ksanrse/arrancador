use crate::database::with_db;
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use sysinfo::{ProcessesToUpdate, System};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{
    CREATE_BREAKAWAY_FROM_JOB, CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub exe_path: String,
    pub exe_name: String,

    // RAWG metadata
    pub rawg_id: Option<i64>,
    pub description: Option<String>,
    pub released: Option<String>,
    pub background_image: Option<String>,
    pub metacritic: Option<i32>,
    pub rating: Option<f64>,
    pub genres: Option<String>,
    pub platforms: Option<String>,
    pub developers: Option<String>,
    pub publishers: Option<String>,

    // Local metadata
    pub cover_image: Option<String>,
    pub is_favorite: bool,
    pub play_count: i32,
    pub total_playtime: i64,
    pub last_played: Option<String>,
    pub date_added: String,

    // Backup
    pub backup_enabled: bool,
    pub last_backup: Option<String>,
    pub backup_count: i32,

    pub user_rating: Option<i32>,
    pub user_note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewGame {
    pub name: String,
    pub exe_path: String,
    pub exe_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateGame {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub cover_image: Option<String>,
    pub is_favorite: Option<bool>,
    pub backup_enabled: Option<bool>,
    pub rawg_id: Option<i64>,
    pub released: Option<String>,
    pub background_image: Option<String>,
    pub metacritic: Option<i32>,
    pub rating: Option<f64>,
    pub genres: Option<String>,
    pub platforms: Option<String>,
    pub developers: Option<String>,
    pub publishers: Option<String>,
    pub user_rating: Option<i32>,
    pub user_note: Option<String>,
}

impl Game {
    fn from_row(row: &rusqlite::Row) -> Result<Self> {
        Ok(Game {
            id: row.get(0)?,
            name: row.get(1)?,
            exe_path: row.get(2)?,
            exe_name: row.get(3)?,
            rawg_id: row.get(4)?,
            description: row.get(5)?,
            released: row.get(6)?,
            background_image: row.get(7)?,
            metacritic: row.get(8)?,
            rating: row.get(9)?,
            genres: row.get(10)?,
            platforms: row.get(11)?,
            developers: row.get(12)?,
            publishers: row.get(13)?,
            cover_image: row.get(14)?,
            is_favorite: row.get::<_, i32>(15)? == 1,
            play_count: row.get(16)?,
            total_playtime: row.get(17)?,
            last_played: row.get(18)?,
            date_added: row.get(19)?,
            backup_enabled: row.get::<_, i32>(20)? == 1,
            last_backup: row.get(21)?,
            backup_count: row.get(22)?,
            user_rating: row.get(23)?,
            user_note: row.get(24)?,
        })
    }
}

#[tauri::command]
pub fn get_game(id: String) -> Result<Option<Game>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games WHERE id = ?1",
        )?;

        let game = stmt.query_row(params![id], Game::from_row).ok();
        Ok(game)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_game(game: NewGame) -> Result<Game, String> {
    let id = Uuid::new_v4().to_string();
    let date_added = Utc::now().to_rfc3339();

    with_db(|conn| {
        conn.execute(
            "INSERT INTO games (id, name, exe_path, exe_name, date_added) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, game.name, game.exe_path, game.exe_name, date_added],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games WHERE id = ?1"
        )?;

        let game = stmt.query_row(params![id], Game::from_row)?;
        Ok(game)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_games_batch(games: Vec<NewGame>) -> Result<Vec<Game>, String> {
    let mut added_games = Vec::new();

    for game in games {
        match add_game(game) {
            Ok(g) => added_games.push(g),
            Err(e) => {
                if !e.contains("UNIQUE constraint failed") {
                    eprintln!("Error adding game: {}", e);
                }
            }
        }
    }

    Ok(added_games)
}

#[tauri::command]
pub fn get_all_games() -> Result<Vec<Game>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games ORDER BY name ASC",
        )?;

        let games = stmt
            .query_map([], Game::from_row)?
            .filter_map(|r| r.ok())
            .collect();

        Ok(games)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favorites() -> Result<Vec<Game>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games WHERE is_favorite = 1 ORDER BY name ASC",
        )?;

        let games = stmt
            .query_map([], Game::from_row)?
            .filter_map(|r| r.ok())
            .collect();

        Ok(games)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_game(update: UpdateGame) -> Result<Game, String> {
    with_db(|conn| {
        let mut updates = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref name) = update.name {
            updates.push("name = ?");
            params_vec.push(Box::new(name.clone()));
        }
        if let Some(ref desc) = update.description {
            updates.push("description = ?");
            params_vec.push(Box::new(desc.clone()));
        }
        if let Some(ref cover) = update.cover_image {
            updates.push("cover_image = ?");
            params_vec.push(Box::new(cover.clone()));
        }
        if let Some(fav) = update.is_favorite {
            updates.push("is_favorite = ?");
            params_vec.push(Box::new(if fav { 1 } else { 0 }));
        }
        if let Some(backup) = update.backup_enabled {
            updates.push("backup_enabled = ?");
            params_vec.push(Box::new(if backup { 1 } else { 0 }));
        }
        if let Some(rawg_id) = update.rawg_id {
            updates.push("rawg_id = ?");
            params_vec.push(Box::new(rawg_id));
        }
        if let Some(ref released) = update.released {
            updates.push("released = ?");
            params_vec.push(Box::new(released.clone()));
        }
        if let Some(ref bg) = update.background_image {
            updates.push("background_image = ?");
            params_vec.push(Box::new(bg.clone()));
        }
        if let Some(mc) = update.metacritic {
            updates.push("metacritic = ?");
            params_vec.push(Box::new(mc));
        }
        if let Some(rating) = update.rating {
            updates.push("rating = ?");
            params_vec.push(Box::new(rating));
        }
        if let Some(ref genres) = update.genres {
            updates.push("genres = ?");
            params_vec.push(Box::new(genres.clone()));
        }
        if let Some(ref platforms) = update.platforms {
            updates.push("platforms = ?");
            params_vec.push(Box::new(platforms.clone()));
        }
        if let Some(ref devs) = update.developers {
            updates.push("developers = ?");
            params_vec.push(Box::new(devs.clone()));
        }
        if let Some(ref pubs) = update.publishers {
            updates.push("publishers = ?");
            params_vec.push(Box::new(pubs.clone()));
        }
        if let Some(user_rating) = update.user_rating {
            updates.push("user_rating = ?");
            params_vec.push(Box::new(user_rating));
        }
        if let Some(ref user_note) = update.user_note {
            updates.push("user_note = ?");
            params_vec.push(Box::new(user_note.clone()));
        }

        if updates.is_empty() {
            let mut stmt = conn.prepare(
                "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
                 background_image, metacritic, rating, genres, platforms, developers, publishers,
                 cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
                 backup_enabled, last_backup, backup_count, user_rating, user_note
                 FROM games WHERE id = ?1",
            )?;
            return stmt.query_row(params![update.id], Game::from_row);
        }

        params_vec.push(Box::new(update.id.clone()));

        let sql = format!("UPDATE games SET {} WHERE id = ?", updates.join(", "));

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())?;

        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games WHERE id = ?1",
        )?;

        stmt.query_row(params![update.id], Game::from_row)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_favorite(id: String) -> Result<Game, String> {
    with_db(|conn| {
        conn.execute(
            "UPDATE games SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![id],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games WHERE id = ?1"
        )?;

        stmt.query_row(params![id], Game::from_row)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_game(id: String) -> Result<(), String> {
    with_db(|conn| {
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn record_game_launch(id: String) -> Result<Game, String> {
    let now = Utc::now().to_rfc3339();

    with_db(|conn| {
        conn.execute(
            "UPDATE games SET play_count = play_count + 1, last_played = ?1 WHERE id = ?2",
            params![now, id],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count
             FROM games WHERE id = ?1",
        )?;

        stmt.query_row(params![id], Game::from_row)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_games(query: String) -> Result<Vec<Game>, String> {
    with_db(|conn| {
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, name, exe_path, exe_name, rawg_id, description, released,
             background_image, metacritic, rating, genres, platforms, developers, publishers,
             cover_image, is_favorite, play_count, total_playtime, last_played, date_added,
             backup_enabled, last_backup, backup_count, user_rating, user_note
             FROM games WHERE name LIKE ?1 OR exe_name LIKE ?1 ORDER BY name ASC",
        )?;

        let games = stmt
            .query_map(params![pattern], Game::from_row)?
            .filter_map(|r| r.ok())
            .collect();

        Ok(games)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn game_exists_by_path(exe_path: String) -> Result<bool, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM games WHERE exe_path = ?1")?;
        let count: i32 = stmt.query_row(params![exe_path], |row| row.get(0))?;
        Ok(count > 0)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_game_installed(id: String) -> Result<bool, String> {
    let exe_path: String = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT exe_path FROM games WHERE id = ?1")?;
        let path: String = stmt.query_row(params![id], |row| row.get(0))?;
        Ok(path)
    })
    .map_err(|e| e.to_string())?;

    Ok(std::path::Path::new(&exe_path).exists())
}

#[tauri::command]
pub fn get_running_instances(id: String) -> Result<u32, String> {
    let exe_path: String = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT exe_path FROM games WHERE id = ?1")?;
        let path: String = stmt.query_row(params![id], |row| row.get(0))?;
        Ok(path)
    })
    .map_err(|e| e.to_string())?;

    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let target = std::path::PathBuf::from(exe_path);
    let mut count = 0u32;
    for process in sys.processes().values() {
        if let Some(path) = process.exe() {
            if paths_match(path, &target) {
                count += 1;
            }
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn kill_game_processes(id: String) -> Result<u32, String> {
    let exe_path: String = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT exe_path FROM games WHERE id = ?1")?;
        let path: String = stmt.query_row(params![id], |row| row.get(0))?;
        Ok(path)
    })
    .map_err(|e| e.to_string())?;

    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let target = std::path::PathBuf::from(exe_path);
    let mut killed = 0u32;
    for process in sys.processes().values() {
        if let Some(path) = process.exe() {
            if paths_match(path, &target) {
                if process.kill() {
                    killed += 1;
                }
            }
        }
    }

    Ok(killed)
}

#[tauri::command]
pub async fn launch_game(id: String) -> Result<(), String> {
    // 1. Get Path
    let exe_path: String = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT exe_path FROM games WHERE id = ?1")?;
        let path: String = stmt.query_row(params![id], |row| row.get(0))?;
        Ok(path)
    })
    .map_err(|e| e.to_string())?;

    // 2. Spawn process (fire and forget)
    // The background tracker will handle playtime tracking
    tauri::async_runtime::spawn_blocking(move || spawn_game_process(&exe_path))
    .await
    .map_err(|e| e.to_string())??;

    // 3. Record Start (Increment play count) only after successful spawn
    record_game_launch(id.clone())?;

    Ok(())
}

fn paths_match(p1: &std::path::Path, p2: &std::path::Path) -> bool {
    if cfg!(target_os = "windows") {
        p1.to_string_lossy().to_lowercase() == p2.to_string_lossy().to_lowercase()
    } else {
        p1 == p2
    }
}

fn spawn_game_process(exe_path: &str) -> Result<(), String> {
    let path = std::path::Path::new(exe_path);
    let parent = path.parent().unwrap_or(path);

    #[cfg(target_os = "windows")]
    {
        let mut command = std::process::Command::new(path);
        command.current_dir(parent);
        let flags = CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB;
        match command.creation_flags(flags.0).spawn() {
            Ok(_) => Ok(()),
            Err(_) => {
                let mut fallback = std::process::Command::new(path);
                fallback.current_dir(parent);
                let fallback_flags = CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS;
                fallback
                    .creation_flags(fallback_flags.0)
                    .spawn()
                    .map(|_| ())
                    .map_err(|e| format!("Failed to launch game: {}", e))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(path)
            .current_dir(parent)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to launch game: {}", e))
    }
}
