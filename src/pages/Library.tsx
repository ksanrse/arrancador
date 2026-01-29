import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useGamesState } from "@/store/GamesContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Grid3X3,
  List,
  Star,
  Play,
  Clock,
  Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Game } from "@/types";
import { GameCard } from "@/components/GameCard";

type ViewMode = "grid" | "list";
type SortBy = "name" | "lastPlayed" | "dateAdded" | "playCount";

// Helper to format playtime
function formatPlaytime(seconds: number) {
  if (!seconds) return "0 ч";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export default function Library() {
  const { games, loading, favorites } = useGamesState();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const filteredGames = useMemo(() => {
    let result = (showFavoritesOnly ? favorites : games).slice();

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (game) =>
          game.name.toLowerCase().includes(query) ||
          game.exe_name.toLowerCase().includes(query),
      );
    }

    return result.sort((a, b) => {
      switch (sortBy) {
        case "lastPlayed":
          if (!a.last_played && !b.last_played) return 0;
          if (!a.last_played) return 1;
          if (!b.last_played) return -1;
          return (
            new Date(b.last_played).getTime() -
            new Date(a.last_played).getTime()
          );
        case "dateAdded":
          return (
            new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
          );
        case "playCount":
          return b.play_count - a.play_count;
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [games, favorites, searchQuery, sortBy, showFavoritesOnly]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-64" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Моя библиотека</h1>
          <p className="text-muted-foreground text-sm">
            {games.length} {games.length === 1 ? "игра" : "игр"} в библиотеке
          </p>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск игр..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full md:w-64"
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
          <Button
            variant={showFavoritesOnly ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className="gap-2 flex-shrink-0"
          >
            <Star
              className={cn(
                "w-4 h-4",
                showFavoritesOnly && "fill-yellow-500 text-yellow-500",
              )}
            />
            Избранное
          </Button>

          <div className="h-4 w-px bg-border flex-shrink-0" />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-sm bg-transparent border-none focus:outline-none text-muted-foreground cursor-pointer flex-shrink-0"
          >
            <option value="name">По имени</option>
            <option value="lastPlayed">Недавно запущенные</option>
            <option value="dateAdded">Недавно добавленные</option>
            <option value="playCount">Популярные</option>
          </select>
        </div>

        <div className="flex items-center gap-1 justify-end">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="w-8 h-8"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="w-8 h-8"
            onClick={() => setViewMode("list")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {filteredGames.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Gamepad2 className="w-12 h-12 text-muted-foreground mb-4" />
          {games.length === 0 ? (
            <>
              <h3 className="text-lg font-medium mb-2">Нет игр</h3>
              <p className="text-muted-foreground mb-4">
                Просканируйте папку, чтобы добавить игры
              </p>
              <Link to="/scan">
                <Button>Сканировать</Button>
              </Link>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium mb-2">Игры не найдены</h3>
              <p className="text-muted-foreground">
                Попробуйте изменить поиск или фильтры
              </p>
            </>
          )}
        </div>
      )}

      {/* Game Grid/List */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGames.map((game) => (
            <GameListItem key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameListItem({ game }: { game: Game }) {
  return (
    <Link
      to={`/game/${game.id}`}
      className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-lg hover:bg-accent transition-colors group"
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {game.background_image ? (
          <img
            src={game.background_image}
            alt={game.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate text-sm sm:text-base">{game.name}</h3>
          {game.is_favorite && (
            <Star className="w-3 h-3 sm:w-4 sm:h-4 fill-yellow-500 text-yellow-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
          {game.genres && (
            <span className="truncate">{game.genres.split(",")[0]}</span>
          )}
          {game.total_playtime > 0 && (
             <span className="flex items-center gap-1">
               <Clock className="w-3 h-3" />
               {formatPlaytime(game.total_playtime)}
             </span>
          )}
          {game.last_played && (
            <span className="flex items-center gap-1 hidden sm:flex">
              <Play className="w-3 h-3" />
              {new Date(game.last_played).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Rating */}
      {game.metacritic && (
        <div
          className={cn(
            "px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] sm:text-sm font-medium",
            game.metacritic >= 75
              ? "bg-green-500/10 text-green-500"
              : game.metacritic >= 50
                ? "bg-yellow-500/10 text-yellow-500"
                : "bg-red-500/10 text-red-500",
          )}
        >
          {game.metacritic}
        </div>
      )}
    </Link>
  );
}
