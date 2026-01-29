import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Library from "@/pages/Library";
import { useGames } from "@/store/GamesContext";
import { testFavoriteGameFixture, testGameFixture } from "@/types";

vi.mock("@/store/GamesContext", () => ({ useGames: vi.fn() }));

const useGamesMock = vi.mocked(useGames);

describe("Library", () => {
  beforeEach(() => {
    useGamesMock.mockReset();
  });

  it("filters games by search query", async () => {
    useGamesMock.mockReturnValue({
      games: [testGameFixture, testFavoriteGameFixture],
      favorites: [testFavoriteGameFixture],
      loading: false,
      error: null,
      refreshGames: vi.fn(),
      addGame: vi.fn(),
      addGames: vi.fn(),
      updateGame: vi.fn(),
      deleteGame: vi.fn(),
      toggleFavorite: vi.fn(),
      getGame: vi.fn(),
      searchGames: vi.fn(),
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
    useGamesMock.mockReturnValue({
      games: [testGameFixture, testFavoriteGameFixture],
      favorites: [testFavoriteGameFixture],
      loading: false,
      error: null,
      refreshGames: vi.fn(),
      addGame: vi.fn(),
      addGames: vi.fn(),
      updateGame: vi.fn(),
      deleteGame: vi.fn(),
      toggleFavorite: vi.fn(),
      getGame: vi.fn(),
      searchGames: vi.fn(),
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
