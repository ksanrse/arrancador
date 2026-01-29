import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Library from "@/pages/Library";
import { useGamesState } from "@/store/GamesContext";
import { testFavoriteGameFixture, testGameFixture } from "@/types";

vi.mock("@/store/GamesContext", () => ({ useGamesState: vi.fn() }));

const useGamesStateMock = vi.mocked(useGamesState);

describe("Library", () => {
  beforeEach(() => {
    useGamesStateMock.mockReset();
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
