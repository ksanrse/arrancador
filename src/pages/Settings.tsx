import {
  Check,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Key,
  Loader2,
  Monitor,
  Moon,
  Power,
  RefreshCw,
  Shield,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSettingsState } from "@/hooks/useSettingsState";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const {
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
    refreshSqobaManifest,
  } = useSettingsState();
  const [manifestRefreshing, setManifestRefreshing] = useState(false);
  const [manifestStatus, setManifestStatus] = useState<string | null>(null);

  const handleRefreshManifest = async () => {
    if (manifestRefreshing) return;
    setManifestRefreshing(true);
    setManifestStatus(null);
    try {
      await refreshSqobaManifest();
      setManifestStatus("Манифест обновлён");
    } catch (e) {
      console.error("Failed to refresh SQOBA manifest:", e);
      setManifestStatus("Не удалось обновить манифест");
    } finally {
      setManifestRefreshing(false);
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

            <div className="rounded-md border border-dashed p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Манифест SQOBA</div>
                  <div className="text-xs text-muted-foreground">
                    Нужен для автопоиска сохранений (Ludusavi/PCGamingWiki).
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshManifest}
                  disabled={manifestRefreshing}
                  className="gap-2"
                >
                  {manifestRefreshing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Обновить
                </Button>
              </div>
              {manifestStatus ? (
                <div className="text-xs text-muted-foreground mt-2">
                  {manifestStatus}
                </div>
              ) : null}
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
                max={100}
                value={maxBackups}
                onChange={(event) =>
                  handleMaxBackupsChange(parseInt(event.target.value, 10))
                }
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

        {/* Compression Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            <h2 className="text-lg font-semibold">
              {"\u0421\u0436\u0430\u0442\u0438\u0435 SQOBA"}
            </h2>
          </div>

          <div className="bg-card rounded-lg border p-4 space-y-4">
            <div
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleCompressionToggle(!compressionEnabled)}
            >
              <div>
                <span id="setting-compression" className="text-sm font-medium">
                  {
                    "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0441\u0436\u0430\u0442\u0438\u0435"
                  }
                </span>
                <span className="text-xs text-muted-foreground block">
                  {
                    "\u0421\u0436\u0430\u0442\u044b\u0435 \u0431\u044d\u043a\u0430\u043f\u044b \u0437\u0430\u043d\u0438\u043c\u0430\u044e\u0442 \u043c\u0435\u043d\u044c\u0448\u0435 \u043c\u0435\u0441\u0442\u0430 \u0438 \u043b\u0443\u0447\u0448\u0435 \u0445\u0440\u0430\u043d\u044f\u0442 \u0438\u0441\u0442\u043e\u0440\u0438\u044e."
                  }
                </span>
              </div>
              <Switch
                checked={compressionEnabled}
                onCheckedChange={handleCompressionToggle}
                aria-labelledby="setting-compression"
                onClick={(event) => event.stopPropagation()}
              />
            </div>

            <div
              className={`space-y-3 ${compressionEnabled ? "" : "opacity-50"}`}
            >
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">
                  {"\u0423\u0440\u043e\u0432\u0435\u043d\u044c"}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={compressionLevel}
                  onChange={(event) =>
                    handleCompressionLevelChange(
                      parseInt(event.target.value, 10),
                    )
                  }
                  className="w-20"
                  disabled={!compressionEnabled}
                />
                <div className="text-xs text-muted-foreground ml-auto">
                  {compressionLevel}
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={compressionLevel}
                onChange={(event) =>
                  handleCompressionLevelChange(parseInt(event.target.value, 10))
                }
                className="w-full accent-primary"
                disabled={!compressionEnabled}
              />
              <p className="text-xs text-muted-foreground">
                {
                  "\u041d\u0438\u0437\u043a\u0438\u0435 \u0443\u0440\u043e\u0432\u043d\u0438 \u2014 \u0431\u044b\u0441\u0442\u0440\u0435\u0435, \u0432\u044b\u0441\u043e\u043a\u0438\u0435 \u2014 \u043a\u043e\u043c\u043f\u0430\u043a\u0442\u043d\u0435\u0435. \u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f: 40\u201370 \u0434\u043b\u044f \u0431\u0430\u043b\u0430\u043d\u0441\u0430."
                }
              </p>
            </div>

            <div
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 bg-background/30 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() =>
                compressionEnabled && setSkipCompressionOnce((prev) => !prev)
              }
            >
              <span id="setting-skip-compression" className="text-sm">
                {
                  "\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0441\u0436\u0430\u0442\u0438\u0435 \u043e\u0434\u0438\u043d \u0440\u0430\u0437"
                }
              </span>
              <Switch
                checked={skipCompressionOnce}
                onCheckedChange={setSkipCompressionOnce}
                aria-labelledby="setting-skip-compression"
                disabled={!compressionEnabled}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {
                "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0431\u044d\u043a\u0430\u043f \u0431\u0443\u0434\u0435\u0442 \u0441\u043e\u0437\u0434\u0430\u043d \u0431\u0435\u0437 \u0441\u0436\u0430\u0442\u0438\u044f, \u0430 \u0437\u0430\u0442\u0435\u043c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u0432\u0435\u0440\u043d\u0435\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438."
              }
            </p>
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
