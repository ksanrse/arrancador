import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/pages/Settings";
import { ThemeProvider } from "@/components/theme-provider";
import type { AppSettings } from "@/types";

const {
  settingsApiMock,
  metadataApiMock,
  enableMock,
  disableMock,
  isEnabledMock,
} = vi.hoisted(() => ({
  settingsApiMock: {
    getAll: vi.fn(),
    update: vi.fn(),
  },
  metadataApiMock: {
    setApiKey: vi.fn(),
  },
  enableMock: vi.fn(),
  disableMock: vi.fn(),
  isEnabledMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  settingsApi: settingsApiMock,
  metadataApi: metadataApiMock,
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: enableMock,
  disable: disableMock,
  isEnabled: isEnabledMock,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const baseSettings: AppSettings = {
  theme: "dark",
  ludusavi_path: "native",
  backup_directory: "C:\\Backups",
  auto_backup: true,
  backup_before_launch: true,
  backup_compression_enabled: true,
  backup_compression_level: 60,
  backup_skip_compression_once: false,
  max_backups_per_game: 5,
  rawg_api_key: "rawg-key",
};

const renderSettings = () =>
  render(
    <ThemeProvider>
      <Settings />
    </ThemeProvider>,
  );

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsApiMock.getAll.mockResolvedValue(baseSettings);
    settingsApiMock.update.mockResolvedValue(undefined);
    metadataApiMock.setApiKey.mockResolvedValue(undefined);
    isEnabledMock.mockResolvedValue(false);
  });

  it("loads settings and saves RAWG API changes", async () => {
    renderSettings();

    const apiInput = await screen.findByPlaceholderText("Ваш RAWG API ключ");
    expect(apiInput).toHaveValue("rawg-key");

    await userEvent.clear(apiInput);
    await userEvent.type(apiInput, "new-rawg-key");

    const saveButton = screen.getByRole("button", {
      name: "Сохранить настройки",
    });
    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(settingsApiMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ rawg_api_key: "new-rawg-key" }),
      ),
    );

    expect(metadataApiMock.setApiKey).toHaveBeenCalledWith("new-rawg-key");
  });

  it("toggles autostart through the plugin", async () => {
    renderSettings();

    const autostartSwitch = await screen.findByRole("switch", {
      name: "Автозапуск",
    });

    await userEvent.click(autostartSwitch);

    await waitFor(() => expect(enableMock).toHaveBeenCalled());
    expect(disableMock).not.toHaveBeenCalled();
  });
});
