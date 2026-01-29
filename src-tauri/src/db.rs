use crate::database::with_db;
use rusqlite::{Connection, Result};

pub trait Db {
    fn with_conn<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>;
}

#[derive(Clone, Copy, Default)]
pub struct GlobalDb;

impl Db for GlobalDb {
    fn with_conn<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        with_db(f)
    }
}

pub struct ConnectionDb {
    conn: Connection,
}

impl ConnectionDb {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    pub fn into_inner(self) -> Connection {
        self.conn
    }
}

impl Db for ConnectionDb {
    fn with_conn<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        f(&self.conn)
    }
}
