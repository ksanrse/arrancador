export interface Game {
  id: string;
  name: string;
  exe_path: string;
  exe_name: string;

  // RAWG metadata
  rawg_id: number | null;
  description: string | null;
  released: string | null;
  background_image: string | null;
  metacritic: number | null;
  rating: number | null;
  genres: string | null;
  platforms: string | null;
  developers: string | null;
  publishers: string | null;

  // Local metadata
  cover_image: string | null;
  is_favorite: boolean;
  play_count: number;
  total_playtime: number;
  last_played: string | null;
  date_added: string;

  // Backup
  backup_enabled: boolean;
  last_backup: string | null;
  backup_count: number;

  user_rating: number | null;
  user_note: string | null;
}

export interface NewGame {
  name: string;
  exe_path: string;
  exe_name: string;
}

export interface UpdateGame {
  id: string;
  name?: string | null;
  description?: string | null;
  cover_image?: string | null;
  is_favorite?: boolean;
  backup_enabled?: boolean;
  rawg_id?: number | null;
  released?: string | null;
  background_image?: string | null;
  metacritic?: number | null;
  rating?: number | null;
  genres?: string | null;
  platforms?: string | null;
  developers?: string | null;
  publishers?: string | null;
  user_rating?: number | null;
  user_note?: string | null;
}

export interface Backup {
  id: string;
  game_id: string;
  backup_path: string;
  backup_size: number;
  created_at: string;
  is_auto: boolean;
  notes: string | null;
}

export interface BackupInfo {
  game_name: string;
  save_path: string | null;
  registry_path: string | null;
  total_size: number;
  files: string[];
}

export interface RestoreCheck {
  should_restore: boolean;
  backup_id: string | null;
  current_size: number;
  backup_size: number;
}

export interface RawgGame {
  id: number;
  name: string;
  slug: string;
  released: string | null;
  background_image: string | null;
  metacritic: number | null;
  rating: number | null;
  ratings_count: number | null;
  genres: { id: number; name: string; slug: string }[] | null;
  platforms: { platform: { id: number; name: string; slug: string } }[] | null;
}

export interface RawgGameDetails extends RawgGame {
  description: string | null;
  description_raw: string | null;
  background_image_additional: string | null;
  developers: { id: number; name: string; slug: string }[] | null;
  publishers: { id: number; name: string; slug: string }[] | null;
}

export interface AppSettings {
  theme: string;
  ludusavi_path: string;
  backup_directory: string;
  auto_backup: boolean;
  backup_before_launch: boolean;
  max_backups_per_game: number;
  rawg_api_key: string;
}

export interface ExeEntry {
  path: string;
  file_name: string;
}

export interface ProcessEntry {
  pid: number;
  name: string;
  path: string;
  cpu_usage: number;
  gpu_usage: number;
}
