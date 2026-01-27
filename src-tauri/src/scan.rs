use jwalk::WalkDirGeneric;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, RwLock,
};
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

lazy_static::lazy_static! {
    static ref CANCEL_SCAN_FLAG: RwLock<Option<Arc<AtomicBool>>> = RwLock::new(None);
}

#[derive(Serialize)]
pub struct ExeEntry {
    pub path: String,
    pub file_name: String,
}

#[derive(Serialize)]
pub struct ProcessEntry {
    pub pid: u32,
    pub name: String,
    pub path: String,
    pub cpu_usage: f32,
    pub gpu_usage: f32,
}


#[tauri::command]
pub fn get_running_processes() -> Vec<ProcessEntry> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let cpu_count = sys.cpus().len() as f32;
    let mut processes = Vec::new();

    for (pid, process) in sys.processes() {
        if let Some(exe_path) = process.exe() {
            if exe_path.exists() {
                processes.push(ProcessEntry {
                    pid: pid.as_u32(),
                    name: process.name().to_string_lossy().to_string(),
                    path: exe_path.to_string_lossy().to_string(),
                    cpu_usage: process.cpu_usage() / cpu_count,
                    gpu_usage: 0.0,
                });
            }
        }
    }

    processes.sort_by(|a, b| {
        b.cpu_usage
            .partial_cmp(&a.cpu_usage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    processes
}

#[tauri::command]
pub fn scan_executables_stream(app: AppHandle, dir: String) {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut writer = CANCEL_SCAN_FLAG.write().unwrap();
        *writer = Some(Arc::clone(&cancel_flag));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let walker = WalkDirGeneric::<((), u8)>::new(&dir).process_read_dir(|_, _, _, children| {
            children.iter_mut().for_each(|dir_entry_result| {
                if let Ok(dir_entry) = dir_entry_result {
                    if dir_entry.file_name().to_string_lossy().starts_with('.') {
                        dir_entry.read_children_path = None;
                    }
                }
            });
        });

        let mut count = 0;
        for entry in walker {
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(entry) = entry {
                if entry.file_type().is_file() {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ext.eq_ignore_ascii_case("exe") {
                            let data = ExeEntry {
                                file_name: entry.file_name().to_string_lossy().into(),
                                path: path.display().to_string(),
                            };
                            let _ = app.emit("scan:entry", &data);
                            count += 1;
                        }
                    }
                }
            }
        }
        let _ = app.emit("scan:done", count);
        {
            let mut writer = CANCEL_SCAN_FLAG.write().unwrap();
            *writer = None;
        }
    });
}

#[tauri::command]
pub fn cancel_scan() {
    if let Some(flag) = CANCEL_SCAN_FLAG.read().unwrap().as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
}
