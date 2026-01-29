use crate::backup::auto_backup_on_exit;
use crate::db::Db;
use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::params;
use std::collections::HashSet;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tauri::AppHandle;

pub const UPDATE_INTERVAL_SECS: u64 = 10;

#[derive(Clone)]
struct GameInfo {
    id: String,
    exe_path: PathBuf,
}

pub trait Clock {
    fn now(&self) -> DateTime<Utc>;
    fn today(&self) -> NaiveDate;
}

#[derive(Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }

    fn today(&self) -> NaiveDate {
        Utc::now().date_naive()
    }
}

pub struct TrackerService<D: Db, C: Clock> {
    db: D,
    clock: C,
}

impl<D: Db, C: Clock> TrackerService<D, C> {
    pub fn new(db: D, clock: C) -> Self {
        Self { db, clock }
    }

    pub fn start(self, app: AppHandle)
    where
        D: Send + 'static,
        C: Send + 'static,
    {
        thread::spawn(move || {
            let mut sys = System::new_all();
            let mut games_cache: Vec<GameInfo> = Vec::new();
            let mut last_cache_update = std::time::Instant::now();
            let cache_ttl = Duration::from_secs(60);
            let mut previously_active: HashSet<String> = HashSet::new();
            let app_handle = app;

            self.update_games_cache(&mut games_cache);

            loop {
                if last_cache_update.elapsed() > cache_ttl {
                    self.update_games_cache(&mut games_cache);
                    last_cache_update = std::time::Instant::now();
                }

                sys.refresh_processes(ProcessesToUpdate::All, true);

                let mut active_game_ids = Vec::new();

                for process in sys.processes().values() {
                    if let Some(exe_path) = process.exe() {
                        for game in &games_cache {
                            if paths_match(exe_path, &game.exe_path) {
                                active_game_ids.push(game.id.clone());
                            }
                        }
                    }
                }

                active_game_ids.sort();
                active_game_ids.dedup();

                let current_active: HashSet<String> = active_game_ids.iter().cloned().collect();
                let ended: Vec<String> = previously_active
                    .difference(&current_active)
                    .cloned()
                    .collect();

                if !active_game_ids.is_empty() {
                    self.update_playtime(&active_game_ids);
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

    pub fn update_playtime(&self, game_ids: &[String]) {
        let now = self.clock.now().to_rfc3339();
        let today = self.clock.today().format("%Y-%m-%d").to_string();
        let increment = UPDATE_INTERVAL_SECS as i64;
        let _ = self.db.with_conn(|conn| {
            for id in game_ids {
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

    fn update_games_cache(&self, cache: &mut Vec<GameInfo>) {
        let result = self.db.with_conn(|conn| {
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
}

fn paths_match(p1: &std::path::Path, p2: &std::path::Path) -> bool {
    if cfg!(target_os = "windows") {
        p1.to_string_lossy().to_lowercase() == p2.to_string_lossy().to_lowercase()
    } else {
        p1 == p2
    }
}
