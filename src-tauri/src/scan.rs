use jwalk::WalkDirGeneric;
use rayon::prelude::*;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
pub struct ExeEntry {
    pub path: String,
    pub file_name: String,
}

#[tauri::command]
pub fn scan_executables_stream(app: AppHandle, dir: String) {
    tauri::async_runtime::spawn_blocking(move || {
        // собираем все каталоги, включая корневой
        let dirs: Vec<_> = WalkDirGeneric::<((), u8)>::new(&dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_dir())
            .map(|e| e.path().to_path_buf())
            .collect();

        let total = dirs.len() as u32;
        let done = Arc::new(AtomicU32::new(0));

        dirs.par_iter().for_each(|path| {
            if let Ok(read_dir) = std::fs::read_dir(path) {
                for entry in read_dir.flatten() {
                    if entry
                        .path()
                        .extension()
                        .map_or(false, |x| x.eq_ignore_ascii_case("exe"))
                    {
                        let data = ExeEntry {
                            file_name: entry.file_name().to_string_lossy().into(),
                            path: entry.path().display().to_string(),
                        };
                        let _ = app.emit("scan:entry", &data);
                    }
                }
            }

            let cur = done.fetch_add(1, Ordering::Relaxed) + 1;
            let _ = app.emit("scan:progress", cur as f32 / total as f32);
        });

        let _ = app.emit("scan:done", ());
    });
}
