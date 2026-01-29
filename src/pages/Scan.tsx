import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Cpu,
  FolderOpen,
  FolderSearch,
  Gamepad2,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { gamesApi, scanApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useGames } from "@/store/GamesContext";
import type { ExeEntry, NewGame } from "@/types";

interface ScanResult extends ExeEntry {
  selected: boolean;
  alreadyAdded: boolean;
  customName: string;
  cpuUsage?: number;
  gpuUsage?: number;
}

export default function Scan() {
  const { addGames, refreshGames } = useGames();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<"folders" | "processes">(
    "folders",
  );

  // Folder Scan State
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [dropAdding, setDropAdding] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "cpu">("cpu");

  // Process Scan State
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [processes, setProcesses] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const refreshUsage = async () => {
    setLoadingProcesses(true);
    try {
      const procs = await scanApi.getRunningProcesses();

      setProcesses((prev) => {
        if (prev.length === 0) {
          return procs.map((p) => ({
            path: p.path,
            file_name: p.name,
            selected: false,
            alreadyAdded: false,
            customName: p.name.replace(/\.exe$/i, ""),
            cpuUsage: p.cpu_usage,
            gpuUsage: 0,
          }));
        }

        return prev.map((p) => {
          const freshData = procs.find((up) => up.path === p.path);
          if (freshData) {
            return { ...p, cpuUsage: freshData.cpu_usage };
          }
          return { ...p, cpuUsage: 0 };
        });
      });
    } catch (e) {
      console.error("Failed to refresh usage:", e);
    } finally {
      setLoadingProcesses(false);
    }
  };
  const startScan = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Выбрать папку для сканирования",
    });

    if (!selected) return;

    setResults([]);
    setScanning(true);

    try {
      await invoke("scan_executables_stream", { dir: selected });
    } catch (e) {
      console.error("Scan failed:", e);
      setScanning(false);
    }
  };

  const cancelScan = async () => {
    try {
      await invoke("cancel_scan");
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  };

  const loadProcesses = async () => {
    setLoadingProcesses(true);
    setProcesses([]);
    setError(null);
    try {
      const procs = await scanApi.getRunningProcesses();
      console.log("RAW PROCESSES DATA:", JSON.stringify(procs, null, 2));

      if (procs.length === 0) {
        setError(
          "nvidia-smi \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0432. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435, \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u044b \u043b\u0438 \u0434\u0440\u0430\u0439\u0432\u0435\u0440\u0430 NVIDIA \u0438 \u0437\u0430\u043f\u0443\u0449\u0435\u043d\u0430 \u043b\u0438 \u0438\u0433\u0440\u0430.",
        );
      }

      const procsWithStatus = await Promise.all(
        procs.map(async (p) => {
          const exists = await gamesApi.existsByPath(p.path).catch(() => false);
          return {
            path: p.path,
            file_name: p.name,
            selected: false,
            alreadyAdded: exists,
            customName: p.name.replace(/\.exe$/i, ""),
            cpuUsage: p.cpu_usage,
            gpuUsage: p.gpu_usage,
          };
        }),
      );

      setProcesses(procsWithStatus);
    } catch (e) {
      console.error("Failed to load processes:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingProcesses(false);
    }
  };

  const fileNameFromPath = (filePath: string) => {
    const normalized = filePath.replace(/\\/g, "/");
    const name = normalized.split("/").pop();
    return name || filePath;
  };

  const cleanNameFromFile = (fileName: string) => {
    const base = fileName.replace(/\.exe$/i, "");
    return base.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim() || base;
  };

  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      setDropAdding(true);

      const toAdd: NewGame[] = [];
      const seen = new Set<string>();
      let skipped = 0;
      let invalid = 0;

      for (const rawPath of paths) {
        let resolved = rawPath;
        if (rawPath.toLowerCase().endsWith(".lnk")) {
          try {
            resolved = await gamesApi.resolveShortcutTarget(rawPath);
          } catch (e) {
            console.error("Failed to resolve shortcut:", e);
            invalid += 1;
            continue;
          }
        }

        const lowerResolved = resolved.toLowerCase();
        if (!lowerResolved.endsWith(".exe")) {
          invalid += 1;
          continue;
        }

        if (seen.has(lowerResolved)) {
          continue;
        }
        seen.add(lowerResolved);

        const exists = await gamesApi.existsByPath(resolved).catch(() => false);
        if (exists) {
          skipped += 1;
          continue;
        }

        const exeName = fileNameFromPath(resolved);
        const name = cleanNameFromFile(exeName);
        toAdd.push({ name, exe_path: resolved, exe_name: exeName });
      }

      if (toAdd.length > 0) {
        try {
          await addGames(toAdd);
          await refreshGames();
          const extra: string[] = [];
          if (skipped > 0) {
            extra.push(`Пропущено: ${skipped}`);
          }
          if (invalid > 0) {
            extra.push(`Не поддерживается: ${invalid}`);
          }
          notify({
            tone: "success",
            title: `Добавлено ${toAdd.length}`,
            description: extra.length ? extra.join(" | ") : undefined,
          });
        } catch (e) {
          console.error("Failed to add dropped games:", e);
          notify({
            tone: "error",
            title: "Не удалось добавить игры",
            description: "Проверьте путь к файлу.",
          });
        }
      } else {
        notify({
          tone: "warning",
          title: "Файлы не добавлены",
          description: "Поддерживаются .exe и .lnk.",
        });
      }

      setDropAdding(false);
    },
    [addGames, refreshGames, notify],
  );



  useEffect(() => {
    if (activeTab === "processes") {
      setSortBy("cpu");
    } else {
      setSortBy("name");
    }
  }, [activeTab]);

  useEffect(() => {
    const unlisten1 = listen<ExeEntry>("scan:entry", async (event) => {
      const entry = event.payload;
      const exists = await gamesApi.existsByPath(entry.path).catch(() => false);
      const baseName = entry.file_name.replace(/\.exe$/i, "");
      const cleanName = baseName
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      setResults((prev) => [
        ...prev,
        {
          ...entry,
          selected: !exists,
          alreadyAdded: exists,
          customName: cleanName,
        },
      ]);
    });

    const unlisten3 = listen("scan:done", () => {
      setScanning(false);
    });

    return () => {
      Promise.all([unlisten1, unlisten3]).then((fns) =>
        fns.forEach((fn) => fn()),
      );
    };
  }, []);

  useEffect(() => {
    let unlistenDrop: (() => void) | null = null;
    let unlistenHover: (() => void) | null = null;
    let unlistenCancel: (() => void) | null = null;

    const setup = async () => {
      unlistenDrop = await listen<string[]>("tauri://file-drop", (event) => {
        setDropActive(false);
        handleDroppedPaths(event.payload || []);
      });
      unlistenHover = await listen("tauri://file-drop-hover", () => {
        setDropActive(true);
      });
      unlistenCancel = await listen("tauri://file-drop-cancelled", () => {
        setDropActive(false);
      });
    };

    setup();

    return () => {
      if (unlistenDrop) unlistenDrop();
      if (unlistenHover) unlistenHover();
      if (unlistenCancel) unlistenCancel();
    };
  }, [handleDroppedPaths]);
  // Switch tab handler
  const handleTabChange = (tab: "folders" | "processes") => {
    setActiveTab(tab);
    if (tab === "processes" && processes.length === 0) {
      loadProcesses();
    }
  };

  // Generic helper for both lists
  const toggleSelect = (listType: "folders" | "processes", path: string) => {
    const setter = listType === "folders" ? setResults : setProcesses;
    setter((prev) =>
      prev.map((r) =>
        r.path === path && !r.alreadyAdded
          ? { ...r, selected: !r.selected }
          : r,
      ),
    );
  };

  const selectAll = (listType: "folders" | "processes") => {
    const setter = listType === "folders" ? setResults : setProcesses;
    setter((prev) =>
      prev.map((r) => (!r.alreadyAdded ? { ...r, selected: true } : r)),
    );
  };

  const deselectAll = (listType: "folders" | "processes") => {
    const setter = listType === "folders" ? setResults : setProcesses;
    setter((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const updateName = (
    listType: "folders" | "processes",
    path: string,
    name: string,
  ) => {
    const setter = listType === "folders" ? setResults : setProcesses;
    setter((prev) =>
      prev.map((r) => (r.path === path ? { ...r, customName: name } : r)),
    );
  };

  const addSelectedGames = async (listType: "folders" | "processes") => {
    const list = listType === "folders" ? results : processes;
    const setter = listType === "folders" ? setResults : setProcesses;

    const selected = list.filter((r) => r.selected && !r.alreadyAdded);
    if (selected.length === 0) return;

    setAdding(true);
    try {
      const newGames: NewGame[] = selected.map((r) => ({
        name: r.customName || r.file_name.replace(/\.exe$/i, ""),
        exe_path: r.path,
        exe_name: r.file_name,
      }));

      await addGames(newGames);
      await refreshGames();

      // Mark as added
      setter((prev) =>
        prev.map((r) =>
          selected.some((s) => s.path === r.path)
            ? { ...r, alreadyAdded: true, selected: false }
            : r,
        ),
      );
    } catch (e) {
      console.error("Failed to add games:", e);
    } finally {
      setAdding(false);
    }
  };

  const currentList = activeTab === "folders" ? results : processes;

  const sortedList = useMemo(() => {
    return [...currentList].sort((a, b) => {
      if (sortBy === "cpu") {
        return (b.cpuUsage || 0) - (a.cpuUsage || 0);
      }
      return a.customName.localeCompare(b.customName);
    });
  }, [currentList, sortBy]);

  const filteredResults = useMemo(() => {
    let list = sortedList;

    if (filter) {
      list = list.filter(
        (r) =>
          r.file_name.toLowerCase().includes(filter.toLowerCase()) ||
          r.customName.toLowerCase().includes(filter.toLowerCase()),
      );
    }

    return list;
  }, [sortedList, filter]);

  const selectedCount = currentList.filter(
    (r) => r.selected && !r.alreadyAdded,
  ).length;
  const newCount = currentList.filter((r) => !r.alreadyAdded).length;

  return (
    <div className="p-3 sm:p-6 h-full flex flex-col max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Добавление игр
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Найдите игры на диске или выберите из запущенных процессов
        </p>
      </div>

      <div
        className={cn(
          "mb-4 sm:mb-6 rounded-xl border border-dashed border-border/70 bg-secondary/20",
          dropActive && "border-primary/60 bg-primary/10",
        )}
      >
        <div className="flex items-center gap-3 p-4">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              dropActive
                ? "bg-primary/15 text-primary"
                : "bg-secondary text-muted-foreground",
            )}
          >
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              {dropActive
                ? "Отпустите для добавления"
                : "Перетащите .exe или ярлык"}
            </div>
            <div className="text-xs text-muted-foreground">
              {dropActive
                ? "Мы добавим игру в библиотеку"
                : "Можно перетащить сразу несколько файлов"}
            </div>
          </div>
          {dropAdding && (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 rounded-lg bg-muted p-1 mb-4 sm:mb-6 w-full sm:w-fit">
        <button
          onClick={() => handleTabChange("folders")}
          className={cn(
            "flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all",
            activeTab === "folders"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/50",
          )}
        >
          <FolderSearch className="w-4 h-4" />
          <span className="truncate">Папки</span>
        </button>
        <button
          onClick={() => handleTabChange("processes")}
          className={cn(
            "flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all",
            activeTab === "processes"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/50",
          )}
        >
          <Cpu className="w-4 h-4" />
          <span className="truncate">Процессы</span>
        </button>
      </div>

      {/* Content Header (Actions) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        {activeTab === "folders" ? (
          scanning ? (
            <>
              <Button
                variant="destructive"
                onClick={cancelScan}
                className="sm:w-auto"
              >
                <X className="w-4 h-4 mr-2" />
                Остановить
              </Button>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex justify-between text-[10px] sm:text-sm">
                  <span className="text-primary font-medium flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Сканирование...
                  </span>
                  <span className="text-muted-foreground">
                    Найдено: {results.length}
                  </span>
                </div>
                <Progress value={null} className="h-1.5 sm:h-2 w-full" />
              </div>
            </>
          ) : (
            <Button onClick={startScan} className="gap-2 w-full sm:w-auto">
              <FolderOpen className="w-4 h-4" />
              Выбрать папку
            </Button>
          )
        ) : (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={loadProcesses}
              disabled={loadingProcesses}
              className="gap-2 flex-1 sm:flex-none"
            >
              {loadingProcesses ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Обновить список
            </Button>
          </div>
        )}
      </div>

      {/* Toolbar - ALWAYS VISIBLE if list is not empty or loading */}
      {(currentList.length > 0 || loadingProcesses) && (
        <div className="flex flex-col gap-3 mb-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию или файлу..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 pr-9 w-full"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-1">
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeTab === "processes" && (
                <div className="flex items-center bg-muted rounded-md p-0.5">
                  <button
                    onClick={() => setSortBy("cpu")}
                    className={cn(
                      "px-2 py-1 text-[10px] sm:text-xs font-medium rounded-sm transition-all",
                      sortBy === "cpu"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    ЦП
                  </button>
                  <div className="w-[1px] h-3 bg-border mx-1" />
                  <button
                    onClick={refreshUsage}
                    disabled={loadingProcesses}
                    className="px-1.5 py-1 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                    title="Обновить нагрузку"
                  >
                    <Loader2
                      className={cn(
                        "w-3 h-3",
                        loadingProcesses && "animate-spin",
                      )}
                    />
                  </button>
                </div>
              )}
              <span className="text-[10px] sm:text-sm text-muted-foreground whitespace-nowrap">
                {selectedCount} из {newCount}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectAll(activeTab)}
                className="h-7 text-[10px] px-2 sm:h-8 sm:text-xs sm:px-3"
              >
                Все
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deselectAll(activeTab)}
                className="h-7 text-[10px] px-2 sm:h-8 sm:text-xs sm:px-3"
              >
                Сброс
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* List Area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {error ? (
          <div className="flex-1 border border-destructive/20 bg-destructive/5 rounded-lg p-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4 text-destructive">
              <X className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-destructive mb-2">
              Произошла ошибка
            </h3>
            <p className="text-sm text-muted-foreground max-w-md break-all font-mono bg-background/50 p-3 rounded border">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={loadProcesses}
              className="mt-4 gap-2"
            >
              <Monitor className="w-4 h-4" />
              Попробовать снова
            </Button>
          </div>
        ) : loadingProcesses ? (
          <div className="flex-1 border rounded-lg flex flex-col items-center justify-center p-4">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary mb-2" />
            <p className="text-xs sm:text-sm text-muted-foreground">
              Получение списка процессов...
            </p>
          </div>
        ) : filteredResults.length > 0 ? (
          <ScrollArea className="flex-1 border rounded-lg">
            <div className="p-1.5 sm:p-2 space-y-1">
              {filteredResults.map((result) => (
                <div
                  key={result.path}
                  className={cn(
                    "flex items-center gap-3 p-2 sm:p-3 rounded-lg transition-all duration-300 border border-transparent",
                    result.alreadyAdded
                      ? "opacity-60 bg-muted/20"
                      : result.selected
                        ? "bg-primary/10 border-primary/20"
                        : "bg-card hover:bg-accent border-border/50 shadow-sm",
                  )}
                >
                  <button
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                      result.alreadyAdded
                        ? "border-muted bg-muted cursor-not-allowed"
                        : result.selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary",
                    )}
                    onClick={() => toggleSelect(activeTab, result.path)}
                    disabled={result.alreadyAdded}
                  >
                    {(result.selected || result.alreadyAdded) && (
                      <Check className="w-3 h-3" />
                    )}
                  </button>

                  <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-sm">
                    <Gamepad2 className="w-5 h-5 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2">
                      {result.alreadyAdded ? (
                        <span className="font-semibold text-sm sm:text-base leading-tight truncate">
                          {result.customName}
                        </span>
                      ) : (
                        <input
                          value={result.customName}
                          onChange={(e) =>
                            updateName(activeTab, result.path, e.target.value)
                          }
                          className="font-semibold bg-transparent border-none focus:outline-none p-0 text-sm sm:text-base w-fit max-w-full focus:ring-0 truncate hover:bg-accent/50 rounded px-1 -ml-1 transition-colors"
                          style={{
                            width: `${Math.max(result.customName.length, 1)}ch`,
                          }}
                          placeholder="Название"
                        />
                      )}
                      {result.alreadyAdded && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 bg-muted rounded leading-none flex-shrink-0">
                          Есть
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground truncate opacity-50 mt-0.5 pr-4">
                      {result.path}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-auto pl-2">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors duration-500",
                        (result.cpuUsage || 0) > 1
                          ? "bg-primary/10 border-primary/20 text-primary"
                          : "bg-primary/5 border-primary/10 text-primary/80",
                      )}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-tighter opacity-70">
                        CPU
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono font-bold min-w-[35px] text-right">
                        {(result.cpuUsage || 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 border rounded-lg flex flex-col items-center justify-center text-center p-6 sm:p-8">
            {activeTab === "folders" ? (
              <FolderSearch className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30 mb-4" />
            ) : (
              <Cpu className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30 mb-4" />
            )}
            <h3 className="text-base sm:text-lg font-medium">
              {filter ? "Ничего не найдено" : "Список пуст"}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mt-2">
              {filter
                ? `По запросу "${filter}" ничего не найдено.`
                : activeTab === "folders"
                  ? "Выберите папку для поиска игр."
                  : "Нажмите 'Обновить список' для поиска процессов."}
            </p>
          </div>
        )}
      </div>

      {/* Footer (Add Selected) */}
      {selectedCount > 0 && (
        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t flex flex-col sm:flex-row gap-3 justify-between items-center bg-background/80 backdrop-blur-sm sticky bottom-0">
          <div className="text-xs sm:text-sm">
            Выбрано{" "}
            <span className="font-bold text-primary">{selectedCount}</span>{" "}
            {selectedCount === 1 ? "игра" : "игр"}
          </div>
          <Button
            onClick={() => addSelectedGames(activeTab)}
            disabled={adding}
            size="default"
            className="gap-2 w-full sm:w-auto px-8"
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Добавить
          </Button>
        </div>
      )}
    </div>
  );
}
