import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ExternalLink,
  FolderOpen,
  Key,
  Loader2,
  Monitor,
  Moon,
  Power,
  Shield,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { metadataApi, settingsApi } from "@/lib/api";
import type { AppSettings } from "@/types";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [backupDirectory, setBackupDirectory] = useState("");
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupBeforeLaunch, setBackupBeforeLaunch] = useState(true);
  const [maxBackups, setMaxBackups] = useState(5);
  const [rawgApiKey, setRawgApiKey] = useState("");
  const [autoStart, setAutoStart] = useState(false);

  useEffect(() => {
    loadSettings();
    checkAutoStart();
  }, []);

  const checkAutoStart = async () => {
    try {
      const enabled = await isEnabled();
      setAutoStart(enabled);
    } catch (e) {
      console.error("Failed to check autostart:", e);
    }
  };

  const toggleAutoStart = async (next?: boolean) => {
    const previousState = autoStart;
    const newState = typeof next === "boolean" ? next : !previousState;

    // Optimistic update
    setAutoStart(newState);

    try {
      if (newState) {
        await enable();
      } else {
        await disable();
      }
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
      // Revert on failure
      setAutoStart(previousState);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [appSettings] = await Promise.all([settingsApi.getAll()]);

      setSettings(appSettings);
      setBackupDirectory(appSettings.backup_directory);
      setAutoBackup(appSettings.auto_backup);
      setBackupBeforeLaunch(appSettings.backup_before_launch);
      setMaxBackups(appSettings.max_backups_per_game);
      setRawgApiKey(appSettings.rawg_api_key);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await settingsApi.update({
        ...settings,
        backup_directory: backupDirectory,
        auto_backup: autoBackup,
        backup_before_launch: backupBeforeLaunch,
        max_backups_per_game: maxBackups,
        rawg_api_key: rawgApiKey,
        ludusavi_path: "native",
      });

      // Update RAWG API key separately
      if (rawgApiKey !== settings.rawg_api_key) {
        await metadataApi.setApiKey(rawgApiKey);
      }

      await loadSettings();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  };

  const selectBackupDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Выбрать папку для бэкапов",
    });

    if (selected) {
      setBackupDirectory(selected as string);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Настройки
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Настройте параметры лаунчера
        </p>
      </div>

      <div className="space-y-6 sm:space-y-8 pb-20 sm:pb-0">
        {/* Appearance */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            <h2 className="text-base sm:text-lg font-semibold">Внешний вид</h2>
          </div>

          <div className="bg-card rounded-lg border p-3 sm:p-4">
            <label className="text-sm font-medium mb-3 block">Тема</label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="gap-2 flex-1 sm:flex-none"
              >
                <Sun className="w-4 h-4" />
                Светлая
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="gap-2 flex-1 sm:flex-none"
              >
                <Moon className="w-4 h-4" />
                Темная
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                className="gap-2 w-full sm:w-auto"
              >
                <Monitor className="w-4 h-4" />
                Системная
              </Button>
            </div>
          </div>
        </section>

        {/* System Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Power className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Система</h2>
          </div>

          <div className="bg-card rounded-lg border overflow-hidden hover:bg-accent/50 transition-colors">
            <div
              className="flex items-center justify-between gap-4 p-4 cursor-pointer select-none"
              onClick={() => toggleAutoStart()}
            >
              <div className="flex-1">
                <span
                  id="setting-autostart"
                  className="text-sm font-medium block"
                >
                  {
                    "\u0410\u0432\u0442\u043e\u0437\u0430\u043f\u0443\u0441\u043a"
                  }
                </span>
                <span className="text-xs text-muted-foreground">
                  {
                    "\u0417\u0430\u043f\u0443\u0441\u043a\u0430\u0442\u044c \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043f\u0440\u0438 \u0441\u0442\u0430\u0440\u0442\u0435 \u0441\u0438\u0441\u0442\u0435\u043c\u044b \u0434\u043b\u044f \u0444\u043e\u043d\u043e\u0432\u043e\u0433\u043e \u0442\u0440\u0435\u043a\u0438\u043d\u0433\u0430 \u0438\u0433\u0440"
                  }
                </span>
              </div>
              <Switch
                checked={autoStart}
                onCheckedChange={toggleAutoStart}
                aria-labelledby="setting-autostart"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        </section>

        {/* Backup Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Резервное копирование</h2>
          </div>

          <div className="bg-card rounded-lg border p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Движок бэкапов</label>
                <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-500">
                  <Check className="w-3 h-3" />
                  Встроенный (Native)
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Используется встроенный движок, совместимый с манифестом
                Ludusavi.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Папка для бэкапов
              </label>
              <div className="flex gap-2">
                <Input
                  value={backupDirectory}
                  onChange={(e) => setBackupDirectory(e.target.value)}
                  placeholder="Путь к папке"
                  className="flex-1"
                />
                <Button variant="outline" onClick={selectBackupDirectory}>
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Макс. кол-во бэкапов на игру
              </label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxBackups}
                onChange={(e) => setMaxBackups(parseInt(e.target.value) || 5)}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Старые копии будут удалены при превышении лимита
              </p>
            </div>

            <div className="space-y-2">
              <div
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setAutoBackup((prev) => !prev)}
              >
                <span id="setting-auto-backup" className="text-sm">
                  {
                    "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0431\u044d\u043a\u0430\u043f\u044b"
                  }
                </span>
                <Switch
                  checked={autoBackup}
                  onCheckedChange={setAutoBackup}
                  aria-labelledby="setting-auto-backup"
                  onClick={(event) => event.stopPropagation()}
                />
              </div>

              <div
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setBackupBeforeLaunch((prev) => !prev)}
              >
                <span id="setting-backup-before-launch" className="text-sm">
                  {
                    "\u041f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0442\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0431\u044d\u043a\u0430\u043f \u043f\u0435\u0440\u0435\u0434 \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u043c"
                  }
                </span>
                <Switch
                  checked={backupBeforeLaunch}
                  onCheckedChange={setBackupBeforeLaunch}
                  aria-labelledby="setting-backup-before-launch"
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>
          </div>
        </section>

        {/* RAWG API */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            <h2 className="text-lg font-semibold">RAWG API</h2>
          </div>

          <div className="bg-card rounded-lg border p-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                API Ключ (Необязательно)
              </label>
              <Input
                type="password"
                value={rawgApiKey}
                onChange={(e) => setRawgApiKey(e.target.value)}
                placeholder="Ваш RAWG API ключ"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Получите бесплатный ключ на{" "}
                <a
                  href="https://rawg.io/apidocs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  RAWG.io <ExternalLink className="w-3 h-3" />
                </a>{" "}
                для расширенных возможностей поиска
              </p>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end pt-4 sm:border-t fixed sm:relative bottom-0 left-0 right-0 p-4 sm:p-0 bg-background/80 backdrop-blur-md sm:bg-transparent z-10 border-t sm:border-none">
          <Button
            onClick={saveSettings}
            disabled={saving}
            className="gap-2 w-full sm:w-auto"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Сохранить настройки
          </Button>
        </div>
      </div>
    </div>
  );
}
