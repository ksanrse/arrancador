use crate::backup::auto_backup_on_exit;
use crate::database::with_db;
use chrono::Utc;
use rusqlite::params;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use std::collections::HashSet;

const UPDATE_INTERVAL_SECS: u64 = 10;

#[derive(Clone)]
struct GameInfo {
    id: String,
    exe_path: PathBuf,
}

pub fn start_tracker() {
    thread::spawn(move || {
        let mut sys = System::new_all();
        let mut games_cache: Vec<GameInfo> = Vec::new();
        let mut last_cache_update = std::time::Instant::now();
        let cache_ttl = Duration::from_secs(60); // Update game list every minute
        let mut previously_active: HashSet<String> = HashSet::new();

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
                thread::spawn(move || {
                    if let Err(e) = auto_backup_on_exit(&id_clone) {
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
        for row in rows {
            if let Ok(info) = row {
                new_cache.push(info);
            }
        }
        Ok(new_cache)
    });

    if let Ok(new_cache) = result {
        *cache = new_cache;
    }
}

fn update_playtime(game_ids: &[String]) {
    let now = Utc::now().to_rfc3339();
    let _ = with_db(|conn| {
        for id in game_ids {
            // Add seconds to total_playtime and update last_played
            conn.execute(
                "UPDATE games SET total_playtime = total_playtime + ?1, last_played = ?2 WHERE id = ?3",
                params![UPDATE_INTERVAL_SECS as i64, now, id],
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
