import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { gamesApi } from "@/lib/api";
import type { Game, NewGame } from "@/types";

interface GamesStateContextType {
  games: Game[];
  favorites: Game[];
  loading: boolean;
  error: string | null;
  getGame: (id: string) => Game | undefined;
}

interface GamesActionsContextType {
  refreshGames: () => Promise<void>;
  addGame: (game: NewGame) => Promise<Game>;
  addGames: (games: NewGame[]) => Promise<Game[]>;
  updateGame: (id: string, updates: Partial<Game>) => Promise<Game>;
  deleteGame: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<Game>;
  searchGames: (query: string) => Promise<Game[]>;
}

type GamesContextType = GamesStateContextType & GamesActionsContextType;

const GamesStateContext = createContext<GamesStateContextType | null>(null);
const GamesActionsContext = createContext<GamesActionsContextType | null>(null);

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gamesRef = useRef<Game[]>([]);

  gamesRef.current = games;

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

  const favorites = useMemo(() => games.filter((g) => g.is_favorite), [games]);
  const gamesById = useMemo(
    () => new Map(games.map((game) => [game.id, game])),
    [games],
  );

  const addGame = useCallback(async (game: NewGame): Promise<Game> => {
    const newGame = await gamesApi.add(game);
    setGames((prev) => [...prev, newGame].sort((a, b) => a.name.localeCompare(b.name)));
    return newGame;
  }, []);

  const addGames = useCallback(async (newGames: NewGame[]): Promise<Game[]> => {
    const added = await gamesApi.addBatch(newGames);
    if (added.length > 0) {
      setGames((prev) => [...prev, ...added].sort((a, b) => a.name.localeCompare(b.name)));
    }
    return added;
  }, []);

  const updateGame = useCallback(async (id: string, updates: Partial<Game>): Promise<Game> => {
    const updated = await gamesApi.update({ id, ...updates });
    setGames((prev) => prev.map((g) => (g.id === id ? updated : g)));
    return updated;
  }, []);

  const deleteGame = useCallback(async (id: string): Promise<void> => {
    await gamesApi.delete(id);
    setGames((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const toggleFavorite = useCallback(async (id: string): Promise<Game> => {
    const updated = await gamesApi.toggleFavorite(id);
    setGames((prev) => prev.map((g) => (g.id === id ? updated : g)));
    return updated;
  }, []);

  const getGame = useCallback((id: string): Game | undefined => gamesById.get(id), [gamesById]);

  const searchGames = useCallback(async (query: string): Promise<Game[]> => {
    if (!query.trim()) return gamesRef.current;
    return gamesApi.search(query);
  }, []);

  const stateValue = useMemo(
    () => ({ games, favorites, loading, error, getGame }),
    [games, favorites, loading, error, getGame],
  );
  const actionsValue = useMemo(
    () => ({
      refreshGames,
      addGame,
      addGames,
      updateGame,
      deleteGame,
      toggleFavorite,
      searchGames,
    }),
    [
      refreshGames,
      addGame,
      addGames,
      updateGame,
      deleteGame,
      toggleFavorite,
      searchGames,
    ],
  );

  return (
    <GamesStateContext.Provider value={stateValue}>
      <GamesActionsContext.Provider value={actionsValue}>
        {children}
      </GamesActionsContext.Provider>
    </GamesStateContext.Provider>
  );
}

export function useGamesState() {
  const context = useContext(GamesStateContext);
  if (!context) {
    throw new Error("useGamesState must be used within GamesProvider");
  }
  return context;
}

export function useGamesActions() {
  const context = useContext(GamesActionsContext);
  if (!context) {
    throw new Error("useGamesActions must be used within GamesProvider");
  }
  return context;
}

export function useGames() {
  const state = useGamesState();
  const actions = useGamesActions();
  return useMemo<GamesContextType>(() => ({ ...state, ...actions }), [state, actions]);
}
