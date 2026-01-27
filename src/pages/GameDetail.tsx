import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Activity,
  ArrowLeft,
  Clock,
  Download,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Play,
  Save,
  Search,
  Shield,
  Star,
  Timer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { backupApi, gamesApi, metadataApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useGames } from "@/store/GamesContext";
import type { Backup, Game, RawgGame, RestoreCheck } from "@/types";

function formatPlaytime(seconds: number) {
  if (!seconds) return "0 ч";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, toggleFavorite, deleteGame, refreshGames } = useGames();

  const [game, setGame] = useState<Game | null>(null);

  // Edit Dialog State
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    background_image: string;
  }>({ name: "", description: "", background_image: "" });

  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Metadata search
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [metadataQuery, setMetadataQuery] = useState("");
  const [metadataResults, setMetadataResults] = useState<RawgGame[]>([]);
  const [searchingMetadata, setSearchingMetadata] = useState(false);
  const [applyingMetadata, setApplyingMetadata] = useState(false);

  const [renameFromMetadata, setRenameFromMetadata] = useState(false);

  // Backups
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [savePathDraft, setSavePathDraft] = useState("");
  const [savingSavePath, setSavingSavePath] = useState(false);
  const [locatingSavePath, setLocatingSavePath] = useState(false);

  const [showAllBackups, setShowAllBackups] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<RestoreCheck | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [backupProgress, setBackupProgress] = useState({
    active: false,
    stage: "",
    message: "",
    done: 0,
    total: 0,
  });
  const [runningCount, setRunningCount] = useState(0);
  const [checkingRunning, setCheckingRunning] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [checkingInstalled, setCheckingInstalled] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [userNote, setUserNote] = useState("");
  const [savingUserRating, setSavingUserRating] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(4);

  const latestBackup = backups[0];
  const olderBackups = backups.slice(1);
  const savePathValue = savePathDraft.trim();
  const savedPath = game?.save_path ?? "";
  const savePathDirty = savePathValue !== savedPath;
  const ratingLevels = [
    { value: 1, label: "1", desc: "Ужасно, играть невозможно" },
    { value: 2, label: "2", desc: "Плохо, много проблем" },
    { value: 3, label: "3", desc: "Слабо, на один раз" },
    { value: 4, label: "4", desc: "Нормально, без восторга" },
    { value: 5, label: "5", desc: "Хорошо, понравилось" },
    { value: 6, label: "6", desc: "Отлично, рекомендую" },
    { value: 7, label: "7", desc: "Шедевр, топ" },
  ];

  const displayRating = showRatingModal ? ratingDraft : userRating;

  const getRatingTone = (value: number | null) => {
    const t = value ? Math.min(Math.max((value - 1) / 6, 0), 1) : 0.25;
    const r = Math.round(100 + (236 - 100) * t);
    const g = Math.round(112 + (86 - 112) * t);
    const b = Math.round(210 + (176 - 210) * t);
    return { r, g, b };
  };

  const getRatingSurfaceStyle = (value: number | null) => {
    const { r, g, b } = getRatingTone(value);
    return {
      backgroundImage: `radial-gradient(120% 160% at 0% 0%, rgba(${r}, ${g}, ${b}, 0.25), transparent 60%)`,
      borderColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
    };
  };

  const getRatingBadgeStyle = (value: number | null) => {
    const { r, g, b } = getRatingTone(value);
    return {
      backgroundImage: `radial-gradient(circle at 30% 30%, rgba(${r}, ${g}, ${b}, 0.85), rgba(${r}, ${g}, ${b}, 0.35))`,
      boxShadow: `0 10px 24px rgba(${r}, ${g}, ${b}, 0.35)`,
      borderColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
    };
  };

  const getRatingBarStyle = (value: number | null) => {
    const { r, g, b } = getRatingTone(value);
    return {
      backgroundImage: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0.9), rgba(${r}, ${g}, ${b}, 0.35))`,
    };
  };

  const ratingGlowTone = getRatingTone(displayRating);
  const isRunning = runningCount > 0;
  const isMissing = !isInstalled && !checkingInstalled;
  const playState = isMissing ? "missing" : isRunning ? "running" : "ready";
  const playLabel = isMissing
    ? "\u041d\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430"
    : launching
      ? "\u0417\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0442\u0441\u044f"
      : isRunning
        ? "\u0417\u0430\u043f\u0443\u0449\u0435\u043d\u0430"
        : "\u0418\u0433\u0440\u0430\u0442\u044c";

  useEffect(() => {
    const found = games.find((g) => g.id === id);
    if (found) {
      const isSameGame = game?.id === found.id;
      const currentSavedPath = game?.save_path ?? "";
      const draftTrimmed = savePathDraft.trim();
      setGame(found);
      // Initialize edit form
      setEditForm({
        name: found.name,
        description: found.description || "",
        background_image: found.background_image || "",
      });
      setUserRating(found.user_rating ?? null);
      setUserNote(found.user_note || "");
      if (!isSameGame || draftTrimmed === currentSavedPath) {
        setSavePathDraft(found.save_path || "");
      }
    }
  }, [id, games]);

  useEffect(() => {
    if (!game) return;
    let mounted = true;
    setCheckingInstalled(true);
    gamesApi
      .isInstalled(game.id)
      .then((installed) => {
        if (mounted) setIsInstalled(installed);
      })
      .catch((e) => {
        console.error("Failed to check install status:", e);
        if (mounted) setIsInstalled(true);
      })
      .finally(() => {
        if (mounted) setCheckingInstalled(false);
      });

    return () => {
      mounted = false;
    };
  }, [game?.id, game?.exe_path]);

  useEffect(() => {
    if (game) {
      loadBackups();
    }
  }, [game?.id]);

  useEffect(() => {
    if (!game) return;
    let mounted = true;
    const updateRunning = async () => {
      try {
        setCheckingRunning(true);
        const count = await gamesApi.getRunningInstances(game.id);
        if (mounted) setRunningCount(count);
      } catch (e) {
        console.error("Failed to check running instances:", e);
      } finally {
        if (mounted) setCheckingRunning(false);
      }
    };
    updateRunning();
    const id = setInterval(updateRunning, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [game?.id]);

  useEffect(() => {
    if (!game) return;
    let unlistenBackup = null;
    let unlistenRestore = null;
    const setup = async () => {
      unlistenBackup = await listen("backup:progress", (event) => {
        const payload = event.payload;
        if (payload.game_id !== game.id) return;
        const { stage, message, done, total } = payload;
        if (stage === "done") {
          setBackupProgress({ active: false, stage, message, done, total });
        } else {
          setBackupProgress({ active: true, stage, message, done, total });
        }
      });
      unlistenRestore = await listen("restore:progress", (event) => {
        const payload = event.payload;
        if (payload.game_id !== game.id) return;
        const { stage, message, done, total } = payload;
        if (stage === "done") {
          setBackupProgress({ active: false, stage, message, done, total });
        } else {
          setBackupProgress({ active: true, stage, message, done, total });
        }
      });
    };
    setup();
    return () => {
      if (unlistenBackup) unlistenBackup();
      if (unlistenRestore) unlistenRestore();
    };
  }, [game?.id]);

  const loadBackups = async () => {
    if (!game) return;
    setLoadingBackups(true);
    try {
      const data = await backupApi.getForGame(game.id);
      setBackups(data);
    } catch (e) {
      console.error("Failed to load backups:", e);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleLaunch = async () => {
    if (!game || isMissing) return;

    if (runningCount > 0) {
      const label =
        runningCount > 1
          ? `Закрыть ${runningCount} процесса?`
          : "Закрыть игру?";
      if (!confirm(`Игра уже запущена. ${label}`)) return;
      try {
        await gamesApi.killProcesses(game.id);
        setRunningCount(0);
      } catch (e) {
        console.error("Failed to kill processes:", e);
        alert("Не удалось закрыть игру: " + (e as Error).message);
      }
      return;
    }

    setLaunching(true);
    try {
      if (game.backup_enabled) {
        const restoreCheck = await backupApi.checkRestoreNeeded(
          game.id,
          game.name,
        );
        if (restoreCheck.should_restore && restoreCheck.backup_id) {
          setRestoreInfo(restoreCheck);
          setShowRestorePrompt(true);
          setLaunching(false);
          return;
        }

        const shouldBackup = await backupApi.shouldBackupBeforeLaunch(game.id);
        if (shouldBackup) {
          const needsBackup = await backupApi.checkBackupNeeded(
            game.id,
            game.name,
          );
          if (needsBackup) {
            setShowBackupPrompt(true);
            setLaunching(false);
            return;
          }
        }
      }

      await launchGame();
    } catch (e) {
      console.error("Launch error:", e);
      setLaunching(false);
    }
  };

  const launchGame = async () => {
    if (!game) return;
    try {
      // Launch and track time
      await gamesApi.launch(game.id);
      const count = await gamesApi.getRunningInstances(game.id);
      setRunningCount(count);
      await refreshGames();
    } catch (e) {
      console.error("Failed to launch:", e);
    } finally {
      setLaunching(false);
    }
  };

  const startBackupInBackground = (isAuto: boolean) => {
    if (!game) return;
    setCreatingBackup(true);
    backupApi
      .create(game.id, game.name, isAuto)
      .then(async () => {
        await loadBackups();
        await refreshGames();
      })
      .catch((e) => {
        console.error("Backup failed:", e);
        alert("Backup failed: " + (e as Error).message);
      })
      .finally(() => {
        setCreatingBackup(false);
      });
  };

  const handleBackupAndLaunch = async () => {
    if (!game) return;
    setShowBackupPrompt(false);
    startBackupInBackground(true);
    setLaunching(true);
    await launchGame();
  };

  const handleRestoreAndLaunch = async () => {
    if (!game || !restoreInfo?.backup_id) return;
    setShowRestorePrompt(false);
    setRestoreInfo(null);
    setRestoring(true);
    try {
      await backupApi.restore(restoreInfo.backup_id);
      await refreshGames();
    } catch (e) {
      console.error("Restore failed:", e);
      alert("Restore failed: " + (e as Error).message);
    } finally {
      setRestoring(false);
    }
    setLaunching(true);
    await launchGame();
  };

  const handleSkipRestore = async () => {
    setShowRestorePrompt(false);
    setRestoreInfo(null);
    setLaunching(true);
    await launchGame();
  };

  const handleToggleFavorite = async () => {
    if (!game) return;
    await toggleFavorite(game.id);
  };

  const handleDelete = async () => {
    if (!game) return;
    if (confirm(`Удалить "${game.name}" из библиотеки?`)) {
      await deleteGame(game.id);
      navigate("/");
    }
  };

  const handleSaveEdit = async () => {
    if (!game) return;
    setSaving(true);
    try {
      await gamesApi.update({
        id: game.id,
        name: editForm.name,
        description: editForm.description,
        background_image: editForm.background_image,
      });
      await refreshGames();
      setShowEditDialog(false);
    } catch (e) {
      console.error("Failed to update:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSearchGoogleImage = async () => {
    const query = encodeURIComponent(`${editForm.name} game wallpaper 4k`);
    const url = `https://www.google.com/search?tbm=isch&q=${query}`;
    await openPath(url);
  };

  const searchMetadata = async () => {
    if (!metadataQuery.trim()) return;
    setSearchingMetadata(true);
    try {
      const results = await metadataApi.search(metadataQuery);
      setMetadataResults(results);
    } catch (e) {
      console.error("Metadata search failed:", e);
    } finally {
      setSearchingMetadata(false);
    }
  };

  const applyMetadata = async (rawgGame: RawgGame) => {
    if (!game) return;
    setApplyingMetadata(true);
    try {
      await metadataApi.apply(game.id, rawgGame.id, renameFromMetadata);
      await refreshGames();
      setShowMetadataSearch(false);
      setMetadataResults([]);
      setMetadataQuery("");
    } catch (e) {
      console.error("Failed to apply metadata:", e);
    } finally {
      setApplyingMetadata(false);
    }
  };

  const createManualBackup = async () => {
    if (!game) return;
    startBackupInBackground(false);
  };

  const restoreBackup = async (backupId: string, withConfirm = true) => {
    if (
      withConfirm &&
      !confirm("Восстановить бэкап? Текущие сохранения будут перезаписаны.")
    )
      return;
    try {
      await backupApi.restore(backupId);
      alert("Бэкап успешно восстановлен!");
    } catch (e) {
      console.error("Restore failed:", e);
      alert("Restore failed: " + (e as Error).message);
    }
  };

  const toggleBackupEnabled = async () => {
    if (!game) return;
    try {
      await gamesApi.update({
        id: game.id,
        backup_enabled: !game.backup_enabled,
      });
      await refreshGames();
    } catch (e) {
      console.error("Failed to update backup setting:", e);
    }
  };

  const handleSelectSavePath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043f\u0430\u043f\u043a\u0443 \u0441 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f\u043c\u0438",
    });

    if (selected) {
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        setSavePathDraft(path);
      }
    }
  };

  const handleOpenSavePath = async () => {
    if (!savePathValue) return;
    try {
      await openPath(savePathValue);
    } catch (e) {
      console.error("Failed to open save path:", e);
    }
  };

  const handleLocateSavePath = async () => {
    if (!game) return;
    setLocatingSavePath(true);
    try {
      const info = await backupApi.findGameSaves(game.name, game.id);
      if (info?.save_path) {
        setSavePathDraft(info.save_path);
      } else {
        alert(
          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f. \u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043f\u0443\u0442\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.",
        );
      }
    } catch (e) {
      console.error("Failed to locate saves:", e);
      alert(
        "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u043f\u043e\u0438\u0441\u043a\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0439.",
      );
    } finally {
      setLocatingSavePath(false);
    }
  };

  const handleSaveSavePath = async () => {
    if (!game) return;
    setSavingSavePath(true);
    try {
      const normalizedPath = savePathValue;
      await gamesApi.update({
        id: game.id,
        save_path: normalizedPath === "" ? null : normalizedPath,
      });
      setSavePathDraft(normalizedPath);
      await refreshGames();
    } catch (e) {
      console.error("Failed to update save path:", e);
    } finally {
      setSavingSavePath(false);
    }
  };

  const handleSaveUserRating = async (nextRating?: number | null) => {
    if (!game) return;
    setSavingUserRating(true);
    try {
      const ratingValue = nextRating !== undefined ? nextRating : userRating;
      await gamesApi.update({
        id: game.id,
        user_rating: ratingValue,
        user_note: userNote,
      });
      if (nextRating !== undefined) {
        setUserRating(nextRating);
      }
      await refreshGames();
    } catch (e) {
      console.error("Failed to update user rating:", e);
    } finally {
      setSavingUserRating(false);
    }
  };

  if (!game) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Игра не найдена</p>
        <Link to="/" className="text-primary hover:underline">
          Назад в библиотеку
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-48 right-[-160px] h-96 w-96 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(99, 102, 241, 0.55), rgba(99, 102, 241, 0))",
          }}
        />
        <div
          className="absolute top-24 left-[-180px] h-80 w-80 rounded-full opacity-50 blur-3xl"
          style={{
            background: `radial-gradient(circle, rgba(${ratingGlowTone.r}, ${ratingGlowTone.g}, ${ratingGlowTone.b}, 0.45), rgba(${ratingGlowTone.r}, ${ratingGlowTone.g}, ${ratingGlowTone.b}, 0))`,
          }}
        />
        <div
          className="absolute bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full opacity-45 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(56, 189, 248, 0.4), rgba(56, 189, 248, 0))",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "3px 3px",
          }}
        />
      </div>
      {/* Hero Section */}
      <div className="relative h-72 overflow-hidden group">
        {game.background_image ? (
          <img
            src={game.background_image}
            alt={game.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105 duration-700"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(60% 80% at 70% 10%, rgba(129, 140, 248, 0.45), transparent 70%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(35% 45% at 20% 20%, rgba(244, 114, 182, 0.35), transparent 60%)",
            }}
          />
          <div
            className="absolute -top-8 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full opacity-80 blur-2xl"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.8), rgba(255,255,255,0))",
            }}
          />
        </div>

        {/* Back button */}
        <div className="absolute top-4 left-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => navigate(-1)}
            className="bg-background/60 backdrop-blur-md border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Actions */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleToggleFavorite}
            className="bg-background/60 backdrop-blur-md border border-white/10"
            title={game.is_favorite ? "Убрать из избранного" : "В избранное"}
          >
            <Star
              className={cn(
                "w-4 h-4",
                game.is_favorite && "fill-yellow-500 text-yellow-500",
              )}
            />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => {
              setMetadataQuery(game.name);
              setShowMetadataSearch(true);
            }}
            className="bg-background/60 backdrop-blur-md border border-white/10"
            title="Найти метаданные (RAWG)"
          >
            <Search className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setShowEditDialog(true)}
            className="bg-background/60 backdrop-blur-md border border-white/10"
            title="Редактировать"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleDelete}
            className="bg-background/60 backdrop-blur-md border border-white/10 hover:bg-destructive hover:text-destructive-foreground"
            title="Удалить"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 -mt-20 relative z-10">
        {/* Title and Play */}
        <div className="flex items-end justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg mb-2">
              {game.name}
            </h1>

            {game.genres && (
              <p className="text-white/80 font-medium">{game.genres}</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <Button
              size="lg"
              className={cn(
                "gap-2 h-14 px-8 text-lg transition-all",
                playState === "running" &&
                  "text-white bg-gradient-to-br from-rose-500/90 via-red-500/85 to-orange-500/80 border border-white/10 shadow-[0_12px_30px_rgba(239,68,68,0.35)]",
                playState === "ready" &&
                  "bg-foreground text-background border border-foreground/20 shadow-[0_12px_30px_rgba(15,23,42,0.25)] hover:shadow-[0_16px_40px_rgba(15,23,42,0.35)]",
                playState === "missing" &&
                  "bg-muted text-muted-foreground border border-border/60 shadow-none disabled:opacity-100",
              )}
              onClick={handleLaunch}
              disabled={isMissing || restoring || (launching && !isRunning)}
            >
              {isMissing ? (
                <HardDrive className="w-5 h-5 opacity-70" />
              ) : isRunning ? (
                <Activity className="w-5 h-5 animate-pulse" />
              ) : launching || checkingRunning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              {playLabel}
            </Button>
            {isMissing && (
              <div className="max-w-[280px] text-xs text-muted-foreground text-right">
                {
                  "\u0418\u0433\u0440\u0430 \u043d\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430, \u043d\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f \u0432 \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0435 \u2014 \u043a\u0430\u043a IMDb \u0434\u043b\u044f \u0441\u0432\u043e\u0438\u0445 \u0438\u0433\u0440. \u041c\u043e\u0436\u043d\u043e \u0441\u043d\u043e\u0432\u0430 \u0441\u043a\u0430\u0447\u0430\u0442\u044c, \u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0443 \u0438 \u0432\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a \u0431\u044d\u043a\u0430\u043f\u0430\u043c."
                }
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            type="button"
            className="group relative w-full rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-4 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_18px_45px_rgba(8,10,25,0.45)] min-h-[130px]"
            style={getRatingSurfaceStyle(displayRating)}
            onClick={() => {
              setRatingDraft(userRating ?? 4);
              setShowRatingModal(true);
            }}
            aria-label={"\u041e\u0446\u0435\u043d\u043a\u0430"}
          >
            <div
              className="absolute inset-0 rounded-2xl opacity-70 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(255,255,255,0.08), transparent 60%)",
              }}
            />
            <div className="relative flex h-full flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {"\u041e\u0446\u0435\u043d\u043a\u0430"}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-foreground">
                      {displayRating ?? "?"}
                    </span>
                    <span className="text-xs text-muted-foreground">/7</span>
                  </div>
                </div>
                <div
                  className="h-11 w-11 rounded-full border border-white/10 flex items-center justify-center text-white/90"
                  style={getRatingBadgeStyle(displayRating)}
                >
                  <Star className="w-4 h-4" />
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${displayRating ? (displayRating / 7) * 100 : 0}%`,
                    ...getRatingBarStyle(displayRating),
                  }}
                />
              </div>
            </div>
          </button>

          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-4 shadow-[0_12px_30px_rgba(8,12,24,0.35)]">
            <div className="text-sm text-muted-foreground mb-1">
              {"\u0412\u0440\u0435\u043c\u044f \u0432 \u0438\u0433\u0440\u0435"}
            </div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Timer className="w-5 h-5" />
              {formatPlaytime(game.total_playtime)}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-4 shadow-[0_12px_30px_rgba(8,12,24,0.35)]">
            <div className="text-sm text-muted-foreground mb-1">
              {
                "\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0437\u0430\u043f\u0443\u0441\u043a"
              }
            </div>
            {game.last_played ? (
              <div className="text-lg font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {new Date(game.last_played).toLocaleDateString()}
              </div>
            ) : (
              <div className="text-lg font-medium text-muted-foreground">
                {
                  "\u041d\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u043b\u043e\u0441\u044c"
                }
              </div>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid md:grid-cols-3 gap-5">
          {/* Main Info */}
          <div className="md:col-span-2 space-y-5">
            {/* Description */}
            <div className="bg-card/60 backdrop-blur-xl rounded-2xl p-6 border border-border/60 shadow-[0_18px_40px_rgba(8,12,24,0.35)]">
              <h3 className="font-semibold text-lg mb-4">Об игре</h3>
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {game.description || "Описание отсутствует."}
              </p>
            </div>

            {/* Details Table */}
            <div className="bg-card/60 backdrop-blur-xl rounded-2xl p-6 border border-border/60 shadow-[0_18px_40px_rgba(8,12,24,0.35)]">
              <h3 className="font-semibold text-lg mb-4">Детали</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {game.released && (
                  <div>
                    <span className="text-muted-foreground block mb-1">
                      Дата выхода
                    </span>
                    <span>{new Date(game.released).toLocaleDateString()}</span>
                  </div>
                )}
                {game.developers && (
                  <div>
                    <span className="text-muted-foreground block mb-1">
                      Разработчик
                    </span>
                    <span>{game.developers}</span>
                  </div>
                )}
                {game.publishers && (
                  <div>
                    <span className="text-muted-foreground block mb-1">
                      Издатель
                    </span>
                    <span>{game.publishers}</span>
                  </div>
                )}
                {game.platforms && (
                  <div>
                    <span className="text-muted-foreground block mb-1">
                      Платформы
                    </span>
                    <span>{game.platforms}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-border/60 flex items-center gap-2 text-xs text-muted-foreground">
                <FolderOpen className="w-3 h-3" />
                <span className="font-mono truncate">{game.exe_path}</span>
              </div>
            </div>
          </div>

          {/* Sidebar / Backups */}
          <div className="space-y-5">
            <div className="bg-card/60 backdrop-blur-xl rounded-2xl p-4 border border-border/60 shadow-[0_18px_40px_rgba(8,12,24,0.35)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Бэкапы
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={createManualBackup}
                    title="Создать бэкап"
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button
                    variant={game.backup_enabled ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={toggleBackupEnabled}
                    title={
                      game.backup_enabled
                        ? "Авто-бэкап включен"
                        : "Авто-бэкап выключен"
                    }
                  >
                    <Shield
                      className={cn(
                        "w-3 h-3",
                        game.backup_enabled && "fill-current",
                      )}
                    />
                  </Button>{" "}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 mb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {"\u041f\u0443\u0442\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0439"}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider",
                      game.save_path
                        ? "text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {game.save_path
                      ? "\u041d\u0430\u0441\u0442\u0440\u043e\u0435\u043d"
                      : "\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={savePathDraft}
                    onChange={(event) => setSavePathDraft(event.target.value)}
                    placeholder={
                      "\u041f\u0443\u0442\u044c \u043a \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f\u043c"
                    }
                    className="flex-1 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSelectSavePath}
                    title="\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043f\u0430\u043f\u043a\u0443"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenSavePath}
                    disabled={!savePathValue}
                    title="\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0430\u043f\u043a\u0443"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLocateSavePath}
                    disabled={locatingSavePath}
                    className="text-xs"
                  >
                    {locatingSavePath ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Search className="w-3 h-3" />
                    )}
                    {"\u041d\u0430\u0439\u0442\u0438"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveSavePath}
                    disabled={savingSavePath || !savePathDirty}
                    className="text-xs"
                  >
                    {savingSavePath ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    {"\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {"\u0415\u0441\u043b\u0438 \u043f\u0443\u0442\u044c \u043f\u0443\u0441\u0442\u043e\u0439, SQOBA \u043f\u043e\u043f\u044b\u0442\u0430\u0435\u0442\u0441\u044f \u043d\u0430\u0439\u0442\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u043f\u0440\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u043c \u0431\u044d\u043a\u0430\u043f\u0435."}
                </p>
              </div>

              {loadingBackups ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : backups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Нет бэкапов</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {latestBackup && (
                    <div className="rounded-xl border border-border/60 bg-secondary/50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            Актуальный бэкап
                          </div>
                          <div className="text-sm font-medium">
                            {new Date(
                              latestBackup.created_at,
                            ).toLocaleDateString()}
                            <span className="text-muted-foreground ml-1">
                              {new Date(
                                latestBackup.created_at,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>
                              {(latestBackup.backup_size / 1024 / 1024).toFixed(
                                1,
                              )}{" "}
                              MB
                            </span>
                            {latestBackup.is_auto && (
                              <span className="bg-primary/10 text-primary px-1 rounded">
                                Авто
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {olderBackups.length > 0 && (
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => setShowAllBackups(!showAllBackups)}
                      >
                        {showAllBackups
                          ? "Скрыть историю"
                          : `Показать историю (${olderBackups.length})`}
                      </Button>
                      {showAllBackups && (
                        <ScrollArea className="h-[240px] pr-3 mt-2">
                          <div className="space-y-2">
                            {olderBackups.map((backup) => (
                              <div
                                key={backup.id}
                                className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-transparent hover:border-border/60 transition-colors group"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">
                                    {new Date(
                                      backup.created_at,
                                    ).toLocaleDateString()}
                                    <span className="text-muted-foreground ml-1">
                                      {new Date(
                                        backup.created_at,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span>
                                      {(
                                        backup.backup_size /
                                        1024 /
                                        1024
                                      ).toFixed(1)}{" "}
                                      MB
                                    </span>
                                    {backup.is_auto && (
                                      <span className="bg-primary/10 text-primary px-1 rounded">
                                        Авто
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => restoreBackup(backup.id)}
                                  title="Восстановить"
                                >
                                  <Upload className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        {/* User Rating Notes */}
        <div className="bg-card/60 backdrop-blur-xl rounded-2xl p-5 border border-border/60 shadow-[0_18px_40px_rgba(8,12,24,0.35)] mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">
                {"\u0417\u0430\u043c\u0435\u0442\u043a\u0430"}
              </div>
              <div className="text-lg font-semibold">
                {
                  "\u0412\u0430\u0448\u0438 \u0432\u043f\u0435\u0447\u0430\u0442\u043b\u0435\u043d\u0438\u044f"
                }
              </div>
            </div>
            <Button onClick={handleSaveUserRating} disabled={savingUserRating}>
              {savingUserRating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {"\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c"}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              {"\u0417\u0430\u043c\u0435\u0442\u043a\u0430"}
            </label>
            <textarea
              className="flex min-h-[80px] w-full rounded-xl border border-border/60 bg-background/20 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u0447\u0442\u043e \u043f\u043e\u043d\u0440\u0430\u0432\u0438\u043b\u043e\u0441\u044c, \u0447\u0442\u043e \u043d\u0435 \u043f\u043e\u043d\u0440\u0430\u0432\u0438\u043b\u043e\u0441\u044c, \u0437\u0430\u043c\u0435\u0442\u043a\u0438 \u043f\u043e \u0441\u044e\u0436\u0435\u0442\u0443..."
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
            />
          </div>
        </div>
      </div>

      {showRatingModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="bg-card/90 backdrop-blur-xl rounded-2xl border border-border/60 w-full max-w-sm p-6 shadow-[0_30px_80px_rgba(8,12,24,0.55)]"
            style={getRatingSurfaceStyle(ratingDraft)}
          >
            <div className="flex items-center justify-between mb-6">
              <div
                className="w-12 h-12 rounded-full border flex items-center justify-center text-2xl font-bold text-white"
                style={getRatingBadgeStyle(ratingDraft)}
              >
                {ratingDraft}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowRatingModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <input
              type="number"
              min={1}
              max={7}
              step={1}
              value={ratingDraft}
              onChange={(e) => {
                const value = Math.max(
                  1,
                  Math.min(7, parseInt(e.target.value || "1", 10)),
                );
                setRatingDraft(value);
              }}
              className="w-full text-center text-6xl font-bold bg-background/20 border border-border/60 rounded-2xl py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowRatingModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                onClick={() => {
                  setShowRatingModal(false);
                  handleSaveUserRating(ratingDraft);
                }}
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {backupProgress.active && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-[280px] z-50">
          <div className="bg-card/80 backdrop-blur-xl border border-border/60 rounded-xl px-4 py-3 shadow-[0_16px_40px_rgba(8,12,24,0.45)] flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {backupProgress.stage === "scan"
                  ? "Preparing backup"
                  : backupProgress.stage === "copy"
                    ? "Creating backup"
                    : backupProgress.stage === "restore"
                      ? "Restoring backup"
                      : "Processing"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {backupProgress.message}
              </div>
            </div>
            {backupProgress.total > 0 && (
              <div className="ml-auto text-xs text-muted-foreground tabular-nums">
                {backupProgress.done}/{backupProgress.total}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT GAME DIALOG */}
      {showEditDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-xl border w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">Редактировать игру</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowEditDialog(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Название</label>
                  <Input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Описание</label>
                  <textarea
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-medium block">
                    Обложка (URL)
                  </label>

                  <div className="flex gap-2">
                    <Input
                      value={editForm.background_image}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          background_image: e.target.value,
                        }))
                      }
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleSearchGoogleImage}
                      title="Искать в Google"
                    >
                      <Globe className="w-4 h-4 mr-2" />
                      Google
                    </Button>
                  </div>

                  {/* Image Preview */}
                  <div className="aspect-video w-full rounded-lg border bg-muted/50 overflow-hidden relative">
                    {editForm.background_image ? (
                      <img
                        src={editForm.background_image}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = ""; // Clear broken image
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <ImageIcon className="w-8 h-8 mr-2 opacity-50" />
                        Нет изображения
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Подсказка: Нажмите "Google", найдите картинку, скопируйте
                    URL и вставьте сюда.
                  </p>
                </div>
              </div>
            </ScrollArea>

            <div className="p-6 border-t bg-muted/20 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RAWG Search Modal (Existing) */}
      {showMetadataSearch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Поиск метаданных</h2>
              <p className="text-sm text-muted-foreground">
                Поиск информации об игре в базе RAWG
              </p>
            </div>

            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Название игры..."
                  value={metadataQuery}
                  onChange={(e) => setMetadataQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchMetadata()}
                  autoFocus
                />
                <Button onClick={searchMetadata} disabled={searchingMetadata}>
                  {searchingMetadata ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground mb-3">
                <span id="rawg-rename-toggle">Use RAWG name</span>
                <Switch
                  checked={renameFromMetadata}
                  onCheckedChange={setRenameFromMetadata}
                  aria-labelledby="rawg-rename-toggle"
                />
              </div>
              <ScrollArea className="flex-1">
                {metadataResults.length > 0 ? (
                  <div className="space-y-2">
                    {metadataResults.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-center gap-3 p-3 rounded-md hover:bg-secondary cursor-pointer border border-transparent hover:border-border transition-colors"
                        onClick={() => applyMetadata(result)}
                      >
                        {result.background_image ? (
                          <img
                            src={result.background_image}
                            alt={result.name}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                            <Gamepad2 className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {result.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {result.released?.slice(0, 4)}
                            {result.metacritic && ` • ${result.metacritic}`}
                          </div>
                        </div>
                        {applyingMetadata ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Введите название для поиска
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="p-4 border-t flex justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowMetadataSearch(false)}
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Prompt Modal */}
      {showBackupPrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">Создать бэкап?</h2>
            <p className="text-muted-foreground mb-4">
              Ваши сохранения изменились с момента последнего бэкапа. Создать
              копию перед запуском?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowBackupPrompt(false);
                  launchGame();
                }}
              >
                Пропустить
              </Button>
              <Button onClick={handleBackupAndLaunch}>Бэкап и Запуск</Button>
            </div>
          </div>
        </div>
      )}
      {showRestorePrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">Восстановить бэкап?</h2>
            <p className="text-muted-foreground mb-4">
              Текущий размер сохранений меньше, чем в последнем бэкапе.
              Восстановить бэкап перед запуском?
            </p>
            {restoreInfo && (
              <div className="text-xs text-muted-foreground mb-4">
                Текущий: {(restoreInfo.current_size / 1024 / 1024).toFixed(1)}{" "}
                MB Бэкап: {(restoreInfo.backup_size / 1024 / 1024).toFixed(1)}{" "}
                MB
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={handleSkipRestore}
                disabled={restoring}
              >
                Пропустить
              </Button>
              <Button onClick={handleRestoreAndLaunch} disabled={restoring}>
                {restoring ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Восстановить и запустить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
