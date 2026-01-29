use crate::backup::auto_backup_on_exit;
use crate::database::with_db;
use chrono::Utc;
use rusqlite::params;
use std::collections::HashSet;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tauri::AppHandle;

const UPDATE_INTERVAL_SECS: u64 = 10;

#[derive(Clone)]
struct GameInfo {
    id: String,
    exe_path: PathBuf,
}

pub fn start_tracker(app: AppHandle) {
    thread::spawn(move || {
        let mut sys = System::new_all();
        let mut games_cache: Vec<GameInfo> = Vec::new();
        let mut last_cache_update = std::time::Instant::now();
        let cache_ttl = Duration::from_secs(60); // Update game list every minute
        let mut previously_active: HashSet<String> = HashSet::new();
        let app_handle = app;

        // Initial load
        update_games_cache(&mut games_cache);

        loop {
            // Refresh game list periodically
            if last_cache_update.elapsed() > cache_ttl {
                update_games_cache(&mut games_cache);
                last_cache_update = std::time::Instant::now();
            }

            // Refresh processes
            sys.refresh_processes(ProcessesToUpdate::All, true);

            let mut active_game_ids = Vec::new();

            for process in sys.processes().values() {
                if let Some(exe_path) = process.exe() {
                    // Check if this process matches any game
                    // On Windows paths can be case-insensitive, but PathBuf handles it reasonably well usually.
                    // Ideally we normalize to lowercase string for comparison on Windows.

                    for game in &games_cache {
                        if paths_match(exe_path, &game.exe_path) {
                            active_game_ids.push(game.id.clone());
                        }
                    }
                }
            }

            // Deduplicate (in case multiple processes match same game)
            active_game_ids.sort();
            active_game_ids.dedup();

            let current_active: HashSet<String> = active_game_ids.iter().cloned().collect();
            let ended: Vec<String> = previously_active
                .difference(&current_active)
                .cloned()
                .collect();

            // Update DB
            if !active_game_ids.is_empty() {
                update_playtime(&active_game_ids);
            }

            for game_id in ended {
                let id_clone = game_id.clone();
                let app_clone = app_handle.clone();
                thread::spawn(move || {
                    if let Err(e) = auto_backup_on_exit(&id_clone, Some(app_clone)) {
                        eprintln!("Auto-backup failed for {}: {}", id_clone, e);
                    }
                });
            }

            previously_active = current_active;
            thread::sleep(Duration::from_secs(UPDATE_INTERVAL_SECS));
        }
    });
}

fn update_games_cache(cache: &mut Vec<GameInfo>) {
    let result = with_db(|conn| {
        let mut stmt = conn.prepare("SELECT id, exe_path FROM games")?;
        let rows = stmt.query_map([], |row| {
            Ok(GameInfo {
                id: row.get(0)?,
                exe_path: PathBuf::from(row.get::<_, String>(1)?),
            })
        })?;

        let mut new_cache = Vec::new();
        for info in rows.flatten() {
            new_cache.push(info);
        }
        Ok(new_cache)
    });

    if let Ok(new_cache) = result {
        *cache = new_cache;
    }
}

fn update_playtime(game_ids: &[String]) {
    let now = Utc::now().to_rfc3339();
    let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();
    let increment = UPDATE_INTERVAL_SECS as i64;
    let _ = with_db(|conn| {
        for id in game_ids {
            // Add seconds to total_playtime and update last_played
            conn.execute(
                "UPDATE games SET total_playtime = total_playtime + ?1, last_played = ?2 WHERE id = ?3",
                params![increment, now, id],
            )?;
            conn.execute(
                "INSERT INTO playtime_daily (game_id, date, seconds)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(game_id, date) DO UPDATE SET seconds = seconds + excluded.seconds",
                params![id, today, increment],
            )?;
        }
        Ok(())
    });
}

fn paths_match(p1: &std::path::Path, p2: &std::path::Path) -> bool {
    // Simple equality check is often enough, but on Windows we might want case-insensitive
    if cfg!(target_os = "windows") {
        p1.to_string_lossy().to_lowercase() == p2.to_string_lossy().to_lowercase()
    } else {
        p1 == p2
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{set_test_db, TestDbGuard, TEST_DB_MUTEX};
    use rusqlite::{params, Connection};

    fn setup_db() -> TestDbGuard {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute(
            "CREATE TABLE games (
                id TEXT PRIMARY KEY,
                total_playtime INTEGER NOT NULL DEFAULT 0,
                last_played TEXT
            )",
            [],
        )
        .expect("create games table");
        conn.execute(
            "CREATE TABLE playtime_daily (
                game_id TEXT NOT NULL,
                date TEXT NOT NULL,
                seconds INTEGER NOT NULL DEFAULT 0,
                UNIQUE(game_id, date)
            )",
            [],
        )
        .expect("create playtime_daily table");

        set_test_db(conn)
    }

    #[test]
    fn update_playtime_increments_totals_and_daily() {
        let _lock = TEST_DB_MUTEX.lock().unwrap();
        let _db_guard = setup_db();

        let game_id = "game-1".to_string();
        crate::database::with_db(|conn| {
            conn.execute(
                "INSERT INTO games (id, total_playtime) VALUES (?1, 0)",
                params![game_id.clone()],
            )?;
            Ok(())
        })
        .expect("insert game");

        update_playtime(&[game_id.clone()]);

        let (total, daily) = crate::database::with_db(|conn| {
            let total: i64 = conn.query_row(
                "SELECT total_playtime FROM games WHERE id = ?1",
                params![game_id],
                |row| row.get(0),
            )?;
            let daily: i64 = conn.query_row(
                "SELECT seconds FROM playtime_daily WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )?;
            Ok((total, daily))
        })
        .expect("fetch totals");

        let expected = UPDATE_INTERVAL_SECS as i64;
        assert_eq!(total, expected);
        assert_eq!(daily, expected);
    }
}
