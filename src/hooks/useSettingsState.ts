import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { metadataApi, settingsApi } from "@/lib/api";
import type { AppSettings } from "@/types";

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function useSettingsState() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [backupDirectory, setBackupDirectory] = useState("");
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupBeforeLaunch, setBackupBeforeLaunch] = useState(true);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [compressionLevel, setCompressionLevel] = useState(60);
  const [skipCompressionOnce, setSkipCompressionOnce] = useState(false);
  const [maxBackups, setMaxBackups] = useState(5);
  const [rawgApiKey, setRawgApiKey] = useState("");
  const [autoStart, setAutoStart] = useState(false);

  const handleCompressionToggle = useCallback((next: boolean) => {
    setCompressionEnabled(next);
    if (!next) {
      setSkipCompressionOnce(false);
    }
  }, []);

  const handleCompressionLevelChange = useCallback((value: number) => {
    if (Number.isNaN(value)) return;
    setCompressionLevel(clampNumber(value, 1, 100));
  }, []);

  const handleMaxBackupsChange = useCallback((value: number) => {
    if (Number.isNaN(value)) return;
    setMaxBackups(clampNumber(value, 1, 100));
  }, []);

  const checkAutoStart = useCallback(async () => {
    try {
      const enabled = await isEnabled();
      setAutoStart(enabled);
    } catch (e) {
      console.error("Failed to check autostart:", e);
    }
  }, []);

  const toggleAutoStart = useCallback(
    async (next?: boolean) => {
      const previousState = autoStart;
      const newState = typeof next === "boolean" ? next : !previousState;

      setAutoStart(newState);

      try {
        if (newState) {
          await enable();
        } else {
          await disable();
        }
      } catch (e) {
        console.error("Failed to toggle autostart:", e);
        setAutoStart(previousState);
      }
    },
    [autoStart],
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [appSettings] = await Promise.all([settingsApi.getAll()]);

      setSettings(appSettings);
      setBackupDirectory(appSettings.backup_directory);
      setAutoBackup(appSettings.auto_backup);
      setBackupBeforeLaunch(appSettings.backup_before_launch);
      setCompressionEnabled(appSettings.backup_compression_enabled);
      setCompressionLevel(appSettings.backup_compression_level);
      setSkipCompressionOnce(appSettings.backup_skip_compression_once);
      setMaxBackups(appSettings.max_backups_per_game);
      setRawgApiKey(appSettings.rawg_api_key);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await settingsApi.update({
        ...settings,
        backup_directory: backupDirectory,
        auto_backup: autoBackup,
        backup_before_launch: backupBeforeLaunch,
        backup_compression_enabled: compressionEnabled,
        backup_compression_level: compressionLevel,
        backup_skip_compression_once: skipCompressionOnce,
        max_backups_per_game: maxBackups,
        rawg_api_key: rawgApiKey,
        ludusavi_path: "native",
      });

      if (rawgApiKey !== settings.rawg_api_key) {
        await metadataApi.setApiKey(rawgApiKey);
      }

      await loadSettings();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }, [
    autoBackup,
    backupBeforeLaunch,
    backupDirectory,
    compressionEnabled,
    compressionLevel,
    loadSettings,
    maxBackups,
    rawgApiKey,
    settings,
    skipCompressionOnce,
  ]);

  const selectBackupDirectory = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043f\u0430\u043f\u043a\u0443 \u0434\u043b\u044f \u0431\u044d\u043a\u0430\u043f\u043e\u0432",
    });

    if (selected) {
      setBackupDirectory(selected as string);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    checkAutoStart();
  }, [checkAutoStart, loadSettings]);

  return {
    loading,
    saving,
    backupDirectory,
    setBackupDirectory,
    autoBackup,
    setAutoBackup,
    backupBeforeLaunch,
    setBackupBeforeLaunch,
    compressionEnabled,
    handleCompressionToggle,
    compressionLevel,
    handleCompressionLevelChange,
    skipCompressionOnce,
    setSkipCompressionOnce,
    maxBackups,
    handleMaxBackupsChange,
    rawgApiKey,
    setRawgApiKey,
    autoStart,
    toggleAutoStart,
    saveSettings,
    selectBackupDirectory,
  };
}
