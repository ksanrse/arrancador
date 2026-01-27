import { Link } from "react-router-dom";
import { Star, Play, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Game } from "@/types";

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  return (
    <Link
      to={`/game/${game.id}`}
      className="group relative aspect-[3/4] rounded-lg overflow-hidden bg-muted hover-lift"
    >
      {/* Background Image */}
      {game.background_image ? (
        <img
          src={game.background_image}
          alt={game.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-secondary">
          <Gamepad2 className="w-12 h-12 text-muted-foreground" />
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Favorite badge */}
      {game.is_favorite && (
        <div className="absolute top-2 right-2">
          <Star className="w-5 h-5 fill-yellow-500 text-yellow-500 drop-shadow-lg" />
        </div>
      )}

      {/* Metacritic badge */}
      {game.metacritic && (
        <div
          className={cn(
            "absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-bold",
            game.metacritic >= 75
              ? "bg-green-500 text-white"
              : game.metacritic >= 50
              ? "bg-yellow-500 text-black"
              : "bg-red-500 text-white"
          )}
        >
          {game.metacritic}
        </div>
      )}

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <h3 className="font-semibold text-white text-sm leading-tight truncate-2 drop-shadow-lg">
          {game.name}
        </h3>
        {game.genres && (
          <p className="text-white/70 text-xs mt-1 truncate">
            {game.genres.split(",")[0]}
          </p>
        )}
        {game.play_count > 0 && (
          <div className="flex items-center gap-1 text-white/60 text-xs mt-1">
            <Play className="w-3 h-3" />
            <span>Played {game.play_count} times</span>
          </div>
        )}
      </div>

      {/* Hover play button */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
          <Play className="w-6 h-6 text-white fill-white ml-1" />
        </div>
      </div>
    </Link>
  );
}
