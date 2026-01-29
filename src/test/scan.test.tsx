import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Scan from "@/pages/Scan";
import { useGames } from "@/store/GamesContext";

const { gamesApiMock, scanApiMock } = vi.hoisted(() => ({
  gamesApiMock: {
    existsByPath: vi.fn(),
    resolveShortcutTarget: vi.fn(),
  },
  scanApiMock: {
    getRunningProcesses: vi.fn(),
  },
}));

vi.mock("@/store/GamesContext", () => ({ useGames: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ notify: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ gamesApi: gamesApiMock, scanApi: scanApiMock }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const useGamesMock = vi.mocked(useGames);

describe("Scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGamesMock.mockReturnValue({
      games: [],
      favorites: [],
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
  });

  it("loads running processes when switching tabs", async () => {
    scanApiMock.getRunningProcesses.mockResolvedValueOnce([
      {
        pid: 1,
        name: "SampleApp.exe",
        path: "C:\\Games\\SampleApp.exe",
        cpu_usage: 12,
        gpu_usage: 0,
      },
    ]);
    gamesApiMock.existsByPath.mockResolvedValue(false);

    render(<Scan />);

    const processesTab = screen.getByRole("button", { name: "Процессы" });
    await userEvent.click(processesTab);

    await waitFor(() =>
      expect(scanApiMock.getRunningProcesses).toHaveBeenCalled(),
    );

    expect(await screen.findByDisplayValue("SampleApp")).toBeInTheDocument();
  });
});
