use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static::lazy_static! {
    pub static ref DB: Mutex<Option<Connection>> = Mutex::new(None);
}

pub fn get_db_path() -> PathBuf {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let db_dir = app_data.join("arrancador");
    std::fs::create_dir_all(&db_dir).ok();
    db_dir.join("arrancador.db")
}

pub fn init_database() -> Result<()> {
    let db_path = get_db_path();
    println!("Initializing database at: {:?}", db_path);

    let conn = Connection::open(&db_path)?;

    // Games table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            exe_path TEXT NOT NULL UNIQUE,
            exe_name TEXT NOT NULL,

            -- Metadata from RAWG
            rawg_id INTEGER,
            description TEXT,
            released TEXT,
            background_image TEXT,
            metacritic INTEGER,
            rating REAL,
            genres TEXT,
            platforms TEXT,
            developers TEXT,
            publishers TEXT,

            -- Local metadata
            cover_image TEXT,
            is_favorite INTEGER DEFAULT 0,
            play_count INTEGER DEFAULT 0,
            total_playtime INTEGER DEFAULT 0,
            last_played TEXT,
            date_added TEXT NOT NULL,

            -- Backup settings
            backup_enabled INTEGER DEFAULT 0,
            last_backup TEXT,
            backup_count INTEGER DEFAULT 0,

            -- User rating
            user_rating INTEGER,
            user_note TEXT
        )",
        [],
    )?;

    ensure_game_columns(&conn)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS playtime_daily (
            game_id TEXT NOT NULL,
            date TEXT NOT NULL,
            seconds INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            UNIQUE(game_id, date)
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playtime_daily_date ON playtime_daily(date)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playtime_daily_game ON playtime_daily(game_id)",
        [],
    )?;

    // Backups table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS backups (
            id TEXT PRIMARY KEY,
            game_id TEXT NOT NULL,
            backup_path TEXT NOT NULL,
            backup_size INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            is_auto INTEGER DEFAULT 0,
            notes TEXT,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    // Scan history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS scan_directories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            last_scanned TEXT,
            auto_scan INTEGER DEFAULT 0
        )",
        [],
    )?;

    // Initialize default settings
    let default_settings = vec![
        ("ludusavi_path", ""),
        ("backup_directory", ""),
        ("auto_backup", "true"),
        ("backup_before_launch", "true"),
        ("max_backups_per_game", "5"),
        ("theme", "system"),
    ];

    for (key, value) in default_settings {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }

    let mut db = DB.lock().unwrap();
    *db = Some(conn);

    println!("Database initialized successfully");
    Ok(())
}

fn ensure_game_columns(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(games)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut cols = std::collections::HashSet::new();
    for r in rows {
        if let Ok(name) = r {
            cols.insert(name);
        }
    }

    if !cols.contains("user_rating") {
        conn.execute("ALTER TABLE games ADD COLUMN user_rating INTEGER", [])?;
    }
    if !cols.contains("user_note") {
        conn.execute("ALTER TABLE games ADD COLUMN user_note TEXT", [])?;
    }

    Ok(())
}

pub fn with_db<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&Connection) -> Result<T>,
{
    let db = DB.lock().unwrap();
    let conn = db.as_ref().ok_or(rusqlite::Error::InvalidQuery)?;
    f(conn)
}
