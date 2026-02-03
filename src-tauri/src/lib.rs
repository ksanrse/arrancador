mod backup;
mod database;
mod db;
mod domain;
mod games;
mod metadata;
mod scan;
mod services;
mod settings;
mod stats;
mod system;
mod tracker;

use backup::*;
use database::init_database;
use games::*;
use metadata::*;
use scan::{cancel_scan, get_running_processes, scan_executables_stream};
use settings::*;
use stats::*;
use std::sync::atomic::{AtomicBool, Ordering};
use system::*;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, WindowEvent};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

struct AppState {
    is_quitting: AtomicBool,
}

impl AppState {
    fn new() -> Self {
        Self {
            is_quitting: AtomicBool::new(false),
        }
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

fn request_exit<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    state.is_quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "tray_show", "Показать", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "tray_quit", "Выход", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("arrancador")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id() == "tray_show" {
                show_main_window(app);
            } else if event.id() == "tray_quit" {
                request_exit(app);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    toggle_main_window(tray.app_handle());
                }
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database before starting app
    if let Err(e) = init_database() {
        eprintln!("Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            setup_tray(app.app_handle())?;
            tracker::start_tracker(app.app_handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<AppState>();
                if !state.is_quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            // Scan commands
            scan_executables_stream,
            cancel_scan,
            get_running_processes,
            // Game commands
            add_game,
            add_games_batch,
            get_all_games,
            get_favorites, // Swap order to force rebuild
            get_game,
            update_game,
            toggle_favorite,
            delete_game,
            record_game_launch,
            search_games,
            game_exists_by_path,
            is_game_installed,
            launch_game,
            get_running_instances,
            kill_game_processes,
            resolve_shortcut_target,
            // Metadata commands
            search_rawg,
            get_rawg_game_details,
            apply_rawg_metadata,
            set_rawg_api_key,
            get_rawg_api_key,
            // Backup commands
            check_ludusavi_installed,
            get_ludusavi_executable_path,
            set_ludusavi_path,
            set_backup_directory,
            get_backup_directory_setting,
            refresh_sqoba_manifest,
            find_game_save_paths,
            find_game_saves,
            create_backup,
            get_game_backups,
            restore_backup,
            delete_backup,
            should_backup_before_launch,
            check_backup_needed,
            check_restore_needed,
            get_backup_settings,
            update_backup_settings,
            // Settings commands
            get_all_settings,
            update_settings,
            get_setting,
            set_setting,
            add_scan_directory,
            get_scan_directories,
            remove_scan_directory,
            // Stats commands
            get_playtime_stats,
            // System commands
            get_system_info,
            test_disk_speed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod smoke_tests {
    #[test]
    fn smoke_test_harness_runs() {
        assert_eq!(2 + 2, 4);
    }
}
