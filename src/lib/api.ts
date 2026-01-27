import { invoke } from "@tauri-apps/api/core";
import type {
  Game,
  NewGame,
  UpdateGame,
  Backup,
  BackupInfo,
  RestoreCheck,
  RawgGame,
  RawgGameDetails,
  AppSettings,
} from "@/types";

// Game API
export const gamesApi = {
  getAll: () => invoke<Game[]>("get_all_games"),
  get: (id: string) => invoke<Game | null>("get_game", { id }),
  add: (game: NewGame) => invoke<Game>("add_game", { game }),
  addBatch: (games: NewGame[]) => invoke<Game[]>("add_games_batch", { games }),
  update: (update: UpdateGame) => invoke<Game>("update_game", { update }),
  delete: (id: string) => invoke<void>("delete_game", { id }),
  toggleFavorite: (id: string) => invoke<Game>("toggle_favorite", { id }),
  getFavorites: () => invoke<Game[]>("get_favorites"),
  recordLaunch: (id: string) => invoke<Game>("record_game_launch", { id }),
  search: (query: string) => invoke<Game[]>("search_games", { query }),
  existsByPath: (exePath: string) => invoke<boolean>("game_exists_by_path", { exePath }),
  isInstalled: (id: string) => invoke<boolean>("is_game_installed", { id }),
  launch: (id: string) => invoke<void>("launch_game", { id }),
  getRunningInstances: (id: string) => invoke<number>("get_running_instances", { id }),
  killProcesses: (id: string) => invoke<number>("kill_game_processes", { id }),
};

// Metadata API (RAWG)
export const metadataApi = {
  search: (query: string) => invoke<RawgGame[]>("search_rawg", { query }),
  getDetails: (rawgId: number) => invoke<RawgGameDetails>("get_rawg_game_details", { rawgId }),
  apply: (gameId: string, rawgId: number, rename: boolean) =>
    invoke<Game>("apply_rawg_metadata", { gameId, rawgId, rename }),
  setApiKey: (key: string) => invoke<void>("set_rawg_api_key", { key }),
  getApiKey: () => invoke<string>("get_rawg_api_key"),
};

// Backup API
export const backupApi = {
  checkLudusaviInstalled: () => invoke<boolean>("check_ludusavi_installed"),
  getLudusaviPath: () => invoke<string | null>("get_ludusavi_executable_path"),
  setLudusaviPath: (path: string) => invoke<void>("set_ludusavi_path", { path }),
  setBackupDirectory: (path: string) => invoke<void>("set_backup_directory", { path }),
  getBackupDirectory: () => invoke<string>("get_backup_directory_setting"),
  findGameSaves: (gameName: string) => invoke<BackupInfo | null>("find_game_saves", { gameName }),
  create: (gameId: string, gameName: string, isAuto: boolean, notes?: string) =>
    invoke<Backup>("create_backup", { gameId, gameName, isAuto, notes }),
  getForGame: (gameId: string) => invoke<Backup[]>("get_game_backups", { gameId }),
  restore: (backupId: string) => invoke<void>("restore_backup", { backupId }),
  delete: (backupId: string) => invoke<void>("delete_backup", { backupId }),
  shouldBackupBeforeLaunch: (gameId: string) => invoke<boolean>("should_backup_before_launch", { gameId }),
  checkBackupNeeded: (gameId: string, gameName: string) =>
    invoke<boolean>("check_backup_needed", { gameId, gameName }),
  checkRestoreNeeded: (gameId: string, gameName: string) =>
    invoke<RestoreCheck>("check_restore_needed", { gameId, gameName }),
  getSettings: () => invoke<Record<string, string>>("get_backup_settings"),
  updateSettings: (settings: Record<string, string>) =>
    invoke<void>("update_backup_settings", { settings }),
};

// Settings API
export const settingsApi = {
  getAll: () => invoke<AppSettings>("get_all_settings"),
  update: (settings: AppSettings) => invoke<void>("update_settings", { settings }),
  get: (key: string) => invoke<string | null>("get_setting", { key }),
  set: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  addScanDirectory: (path: string) => invoke<void>("add_scan_directory", { path }),
  getScanDirectories: () => invoke<string[]>("get_scan_directories"),
  removeScanDirectory: (path: string) => invoke<void>("remove_scan_directory", { path }),
};

import { ProcessEntry } from "@/types";
export const scanApi = {
  getRunningProcesses: () => invoke<ProcessEntry[]>("get_running_processes"),
};
