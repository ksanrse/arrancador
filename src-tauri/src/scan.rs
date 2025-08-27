use jwalk::WalkDirGeneric;
use rayon::prelude::*;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Arc, RwLock,
};
use tauri::{AppHandle, Emitter};

lazy_static::lazy_static! {
    static ref CANCEL_SCAN_FLAG: RwLock<Option<Arc<AtomicBool>>> = RwLock::new(None);
}

#[derive(Serialize)]
pub struct ExeEntry {
    pub path: String,
    pub file_name: String,
}

#[tauri::command]
pub fn scan_executables_stream(app: AppHandle, dir: String) {
    println!("scan_executables_stream invoked with dir: {}", dir);
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut writer = CANCEL_SCAN_FLAG.write().unwrap();
        *writer = Some(Arc::clone(&cancel_flag));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let files: Vec<_> = WalkDirGeneric::<((), u8)>::new(&dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                e.path()
                    .extension()
                    .map_or(false, |x| x.eq_ignore_ascii_case("exe"))
            })
            .collect();

        println!("Found {} executable files.", files.len());
        let total = files.len() as u32;
        let done = Arc::new(AtomicU32::new(0));

        for entry in files.into_iter() {
            if cancel_flag.load(Ordering::Relaxed) {
                println!("Scan cancelled!");
                break;
            }

            let data = ExeEntry {
                file_name: entry.file_name().to_string_lossy().into(),
                path: entry.path().display().to_string(),
            };
            let _ = app.emit("scan:entry", &data);
            println!("Emitted scan:entry for: {}", data.file_name);

            let cur = done.fetch_add(1, Ordering::Relaxed) + 1;
            let _ = app.emit("scan:progress", cur as f32 / total as f32);
            println!("Emitted scan:progress: {}/{}", cur, total);
        }

        let _ = app.emit("scan:done", ());
        println!("Emitted scan:done.");
        {
            let mut writer = CANCEL_SCAN_FLAG.write().unwrap();
            *writer = None;
        }
    });
}

#[tauri::command]
pub fn cancel_scan() {
    println!("cancel_scan invoked.");
    if let Some(flag) = CANCEL_SCAN_FLAG.read().unwrap().as_ref() {
        flag.store(true, Ordering::Relaxed);
        println!("Cancellation flag set to true.");
    } else {
        println!("No active scan to cancel.");
    }
}
