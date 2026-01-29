import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GameDetail from "@/pages/GameDetail";
import { useGamesActions, useGamesState } from "@/store/GamesContext";
import { createTestGame } from "@/types";

const {
  toggleFavoriteMock,
  refreshGamesMock,
  deleteGameMock,
  gamesApiMock,
  backupApiMock,
  metadataApiMock,
} = vi.hoisted(() => ({
  toggleFavoriteMock: vi.fn(),
  refreshGamesMock: vi.fn(),
  deleteGameMock: vi.fn(),
  gamesApiMock: {
    isInstalled: vi.fn(),
    getRunningInstances: vi.fn(),
    killProcesses: vi.fn(),
    launch: vi.fn(),
    update: vi.fn(),
  },
  backupApiMock: {
    getForGame: vi.fn(),
    checkRestoreNeeded: vi.fn(),
    shouldBackupBeforeLaunch: vi.fn(),
    checkBackupNeeded: vi.fn(),
    create: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
  },
  metadataApiMock: {
    search: vi.fn(),
    getDetails: vi.fn(),
    apply: vi.fn(),
  },
}));

vi.mock("@/store/GamesContext", () => ({
  useGamesActions: vi.fn(),
  useGamesState: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  gamesApi: gamesApiMock,
  backupApi: backupApiMock,
  metadataApi: metadataApiMock,
}));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ notify: vi.fn() }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn() }));

const useGamesActionsMock = vi.mocked(useGamesActions);
const useGamesStateMock = vi.mocked(useGamesState);

describe("GameDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gamesApiMock.isInstalled.mockResolvedValue(true);
    gamesApiMock.getRunningInstances.mockResolvedValue(0);
    backupApiMock.getForGame.mockResolvedValue([]);
    backupApiMock.checkRestoreNeeded.mockResolvedValue({
      should_restore: false,
      backup_id: null,
      current_size: 0,
      backup_size: 0,
    });
  });

  it("renders details and toggles favorites", async () => {
    const game = createTestGame({ id: "game-1", name: "Arcadia" });
    toggleFavoriteMock.mockResolvedValue({ ...game, is_favorite: true });

    useGamesStateMock.mockReturnValue({
      games: [game],
      favorites: [],
      loading: false,
      error: null,
      getGame: vi.fn(),
    });
    useGamesActionsMock.mockReturnValue({
      refreshGames: refreshGamesMock,
      addGame: vi.fn(),
      addGames: vi.fn(),
      updateGame: vi.fn(),
      deleteGame: deleteGameMock,
      toggleFavorite: toggleFavoriteMock,
      searchGames: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/game/game-1"]}>
        <Routes>
          <Route path="/game/:id" element={<GameDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(game.name)).toBeInTheDocument());

    const favoriteButton = screen.getByTitle("В избранное");
    await userEvent.click(favoriteButton);

    expect(toggleFavoriteMock).toHaveBeenCalledWith("game-1");
  });
});
