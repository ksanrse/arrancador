type TauriMockConfig = {
  games: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  scanEntries: Array<{ path: string; file_name: string }>;
  processes: Array<{
    pid: number;
    name: string;
    path: string;
    cpu_usage: number;
    gpu_usage: number;
  }>;
  dialogOpenResult?: string | string[] | null;
};

export const tauriMockInit = (config: TauriMockConfig) => {
  const listeners = new Map<string, Map<string, string>>();
  const callbacks = new Map<
    string,
    { callback: (payload: unknown) => void; once: boolean }
  >();
  let callbackId = 0;
  let eventId = 0;

  const state = {
    games: config.games ? [...config.games] : [],
    settings: config.settings ? { ...config.settings } : {},
  };

  const registerListener = (event: string, handlerId: string) => {
    const id = `listener-${++eventId}`;
    if (!listeners.has(event)) {
      listeners.set(event, new Map());
    }
    listeners.get(event)?.set(id, handlerId);
    return id;
  };

  const emit = (event: string, payload: unknown) => {
    const eventListeners = listeners.get(event);
    if (!eventListeners) return;

    for (const [listenerId, handlerId] of eventListeners.entries()) {
      const handler = callbacks.get(String(handlerId));
      if (!handler) continue;

      handler.callback({ event, id: listenerId, payload });
      if (handler.once) {
        callbacks.delete(String(handlerId));
        eventListeners.delete(listenerId);
      }
    }
  };

  const invokeHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    get_all_games: () => state.games,
    get_all_settings: () => state.settings,
    update_settings: (args) => {
      state.settings = {
        ...state.settings,
        ...(args.settings as Record<string, unknown>),
      };
      return null;
    },
    set_rawg_api_key: () => null,
    game_exists_by_path: (args) =>
      state.games.some((game) => game.exe_path === args.exePath),
    get_running_processes: () => config.processes ?? [],
    scan_executables_stream: () => {
      setTimeout(() => {
        (config.scanEntries ?? []).forEach((entry) => emit("scan:entry", entry));
        emit("scan:done", null);
      }, 50);
      return null;
    },
    cancel_scan: () => {
      emit("scan:done", null);
      return null;
    },
    "plugin:autostart|is_enabled": () => false,
    "plugin:autostart|enable": () => null,
    "plugin:autostart|disable": () => null,
    "plugin:dialog|open": () => config.dialogOpenResult ?? null,
  };

  const tauriWindow = globalThis as typeof globalThis & {
    __TAURI_INTERNALS__: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (callback: (payload: unknown) => void, once?: boolean) => string;
      unregisterCallback: (id: string) => void;
    };
    __TAURI_EVENT_PLUGIN_INTERNALS__: {
      unregisterListener: (event: string, eventId: string) => void;
    };
    __TAURI_MOCK__: { emit: typeof emit; state: typeof state };
  };

  tauriWindow.__TAURI_MOCK__ = { emit, state };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args = {}) => {
      if (cmd === "plugin:event|listen") {
        const event = String(args.event ?? "");
        const handlerId = String(args.handler ?? "");
        return registerListener(event, handlerId);
      }

      if (cmd === "plugin:event|unlisten") {
        const event = String(args.event ?? "");
        const listenerId = String(args.eventId ?? "");
        listeners.get(event)?.delete(listenerId);
        return null;
      }

      const handler = invokeHandlers[cmd];
      return handler ? handler(args) : null;
    },
    transformCallback: (callback, once = false) => {
      const id = `callback-${++callbackId}`;
      callbacks.set(id, { callback, once });
      return id;
    },
    unregisterCallback: (id) => {
      callbacks.delete(id);
    },
  };
  tauriWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (event, listenerId) => {
      listeners.get(event)?.delete(listenerId);
    },
  };
};
