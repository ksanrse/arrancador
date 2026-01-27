import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { gamesApi } from "@/lib/api";
import type { Game, NewGame } from "@/types";

interface GamesContextType {
  games: Game[];
  favorites: Game[];
  loading: boolean;
  error: string | null;
  refreshGames: () => Promise<void>;
  addGame: (game: NewGame) => Promise<Game>;
  addGames: (games: NewGame[]) => Promise<Game[]>;
  updateGame: (id: string, updates: Partial<Game>) => Promise<Game>;
  deleteGame: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<Game>;
  getGame: (id: string) => Game | undefined;
  searchGames: (query: string) => Promise<Game[]>;
}

const GamesContext = createContext<GamesContextType | null>(null);

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allGames = await gamesApi.getAll();
      setGames(allGames);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load games");
      console.error("Failed to load games:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  const favorites = games.filter((g) => g.is_favorite);

  const addGame = async (game: NewGame): Promise<Game> => {
    const newGame = await gamesApi.add(game);
    setGames((prev) => [...prev, newGame].sort((a, b) => a.name.localeCompare(b.name)));
    return newGame;
  };

  const addGames = async (newGames: NewGame[]): Promise<Game[]> => {
    const added = await gamesApi.addBatch(newGames);
    if (added.length > 0) {
      setGames((prev) => [...prev, ...added].sort((a, b) => a.name.localeCompare(b.name)));
    }
    return added;
  };

  const updateGame = async (id: string, updates: Partial<Game>): Promise<Game> => {
    const updated = await gamesApi.update({ id, ...updates });
    setGames((prev) => prev.map((g) => (g.id === id ? updated : g)));
    return updated;
  };

  const deleteGame = async (id: string): Promise<void> => {
    await gamesApi.delete(id);
    setGames((prev) => prev.filter((g) => g.id !== id));
  };

  const toggleFavorite = async (id: string): Promise<Game> => {
    const updated = await gamesApi.toggleFavorite(id);
    setGames((prev) => prev.map((g) => (g.id === id ? updated : g)));
    return updated;
  };

  const getGame = (id: string): Game | undefined => {
    return games.find((g) => g.id === id);
  };

  const searchGames = async (query: string): Promise<Game[]> => {
    if (!query.trim()) return games;
    return gamesApi.search(query);
  };

  return (
    <GamesContext.Provider
      value={{
        games,
        favorites,
        loading,
        error,
        refreshGames,
        addGame,
        addGames,
        updateGame,
        deleteGame,
        toggleFavorite,
        getGame,
        searchGames,
      }}
    >
      {children}
    </GamesContext.Provider>
  );
}

export function useGames() {
  const context = useContext(GamesContext);
  if (!context) {
    throw new Error("useGames must be used within GamesProvider");
  }
  return context;
}
