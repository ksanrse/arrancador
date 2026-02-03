import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Library from "@/pages/Library";
import { useGamesActions, useGamesState } from "@/store/GamesContext";
import { testFavoriteGameFixture, testGameFixture } from "@/types";

vi.mock("@/store/GamesContext", () => ({
  useGamesState: vi.fn(),
  useGamesActions: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ notify: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  gamesApi: { existsByPath: vi.fn(), resolveShortcutTarget: vi.fn() },
  metadataApi: { getApiKey: vi.fn(), search: vi.fn(), apply: vi.fn() },
}));

const useGamesStateMock = vi.mocked(useGamesState);
const useGamesActionsMock = vi.mocked(useGamesActions);

describe("Library", () => {
  beforeEach(() => {
    useGamesStateMock.mockReset();
    useGamesActionsMock.mockReset();

    useGamesActionsMock.mockReturnValue({
      refreshGames: vi.fn(),
      addGame: vi.fn(),
      addGames: vi.fn().mockResolvedValue([]),
      updateGame: vi.fn(),
      deleteGame: vi.fn(),
      toggleFavorite: vi.fn(),
      searchGames: vi.fn(),
    });
  });

  it("filters games by search query", async () => {
    useGamesStateMock.mockReturnValue({
      games: [testGameFixture, testFavoriteGameFixture],
      favorites: [testFavoriteGameFixture],
      loading: false,
      error: null,
      getGame: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>,
    );

    expect(screen.getByText(testGameFixture.name)).toBeInTheDocument();
    expect(screen.getByText(testFavoriteGameFixture.name)).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox");
    await userEvent.type(searchInput, testFavoriteGameFixture.name);

    expect(screen.queryByText(testGameFixture.name)).not.toBeInTheDocument();
    expect(screen.getByText(testFavoriteGameFixture.name)).toBeInTheDocument();
  });

  it("shows favorites when toggled", async () => {
    useGamesStateMock.mockReturnValue({
      games: [testGameFixture, testFavoriteGameFixture],
      favorites: [testFavoriteGameFixture],
      loading: false,
      error: null,
      getGame: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>,
    );

    const favoritesButton = screen.getByRole("button", { name: "Избранное" });
    await userEvent.click(favoritesButton);

    expect(screen.queryByText(testGameFixture.name)).not.toBeInTheDocument();
    expect(screen.getByText(testFavoriteGameFixture.name)).toBeInTheDocument();
  });
});
