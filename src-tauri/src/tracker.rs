use crate::db::GlobalDb;
use crate::services::tracker::{SystemClock, TrackerService};
use tauri::AppHandle;

pub fn start_tracker(app: AppHandle) {
    TrackerService::new(GlobalDb, SystemClock).start(app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{set_test_db, TestDbGuard, TEST_DB_MUTEX};
    use crate::db::GlobalDb;
    use crate::services::tracker::{Clock, TrackerService, UPDATE_INTERVAL_SECS};
    use chrono::{DateTime, NaiveDate, Utc};
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

    #[derive(Clone, Copy)]
    struct FixedClock {
        now: DateTime<Utc>,
    }

    impl FixedClock {
        fn new(now: DateTime<Utc>) -> Self {
            Self { now }
        }
    }

    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            self.now
        }

        fn today(&self) -> NaiveDate {
            self.now.date_naive()
        }
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

        let clock = FixedClock::new(Utc::now());
        let service = TrackerService::new(GlobalDb, clock);
        service.update_playtime(&[game_id.clone()]);

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
