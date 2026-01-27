# AGENTS.md

Project: Arrancador (Tauri + React)

Purpose
- Desktop game launcher with save backup/restore, RAWG metadata, playtime tracking, and user ratings/notes.

Tech stack
- Frontend: React + TypeScript + Vite
- Backend: Rust (Tauri)
- Database: SQLite (managed in Rust)

Repo layout
- src/                       Frontend UI
- src/pages/                Page screens (GameDetail, Library, Settings, etc.)
- src/components/           UI components
- src/lib/api.ts            Tauri invoke wrappers
- src/types/                Shared TS types
- src-tauri/src/            Rust backend
- src-tauri/src/database.rs DB schema/migrations
- src-tauri/src/games.rs    Game CRUD + launch + running process management
- src-tauri/src/backup.rs   Backup orchestration + settings
- src-tauri/src/backup/     Backup engine (manifest, copy/restore)
- src-tauri/src/metadata.rs RAWG API integration
- src-tauri/src/tracker.rs  Playtime tracker + auto-backup on exit

How to work
- Use `rg` for search.
- Prefer small, focused changes with clear reasoning.
- Keep Russian UI text as unicode escapes if the file already contains mojibake.

Common tasks
1) UI changes
   - Update React components in `src/pages` or `src/components`.
   - Use `gamesApi`, `backupApi`, `metadataApi` from `src/lib/api.ts` for backend calls.
2) Backend commands
   - Add Tauri commands in Rust, then expose in `src-tauri/src/lib.rs`.
   - Update `src/lib/api.ts` to call new commands.
3) DB changes
   - Modify schema in `src-tauri/src/database.rs`.
   - Add migration in `ensure_game_columns` (or similar) for existing DBs.
4) Backups
   - Engine: `src-tauri/src/backup/engine.rs`
   - Orchestration/UI: `src-tauri/src/backup.rs` and `src/pages/GameDetail.tsx`

Testing
- Rust: `cargo test` in `src-tauri`
- Frontend: `pnpm test` if configured

Notes
- Playtime and running processes are tracked in `src-tauri/src/tracker.rs`.
- User rating and note live in DB columns: `user_rating`, `user_note`.
- Backups are stored as folder with `__arrancador_manifest.json` and `files/`.

Style guidelines (Raycast-inspired)
- Visual language: compact, crisp, high-contrast, minimal chrome.
- Surfaces: use soft gradients, subtle glows, and layered cards; avoid flat, dull blocks.
- Spacing: tight but breathable; prefer 12–16px gaps; avoid large empty sections.
- Typography: strong hierarchy; titles bold, metadata muted; avoid oversized headings.
- Buttons: clear states, small radius, subtle hover lift; no heavy outlines.
- Shadows: soft, colored shadow to hint depth; avoid harsh black shadows.
- Color: use neutral base + accent; keep backgrounds slightly tinted.
- Motion: quick, subtle; avoid long transitions.
- Layout: bento-like tiles; align edges; keep cards the same radius.
