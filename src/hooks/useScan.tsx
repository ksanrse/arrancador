import { useEffect, useState, useCallback } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface ExeEntry {
  path: string;
  file_name: string;
}

export function useScan() {
  const [files, setFiles] = useState<ExeEntry[]>([]);
  const [prog, setProg] = useState(0);
  const [busy, setBusy] = useState(false);

  // подписки один раз
  useEffect(() => {
    const offs = [
      listen<ExeEntry>("scan:entry", (e) => setFiles((p) => [...p, e.payload])),
      listen<number>("scan:progress", (e) => setProg(e.payload)),
      listen("scan:done", () => {
        setProg(1);
        setBusy(false);
      }),
    ];
    return () => {
      offs.forEach((p) => p.then((f) => f()));
    };
  }, []);

  /** старт нового скана (отменяет текущий) */
  const start = useCallback(async () => {
    if (busy) await emit("scan:cancel");

    const dir = await openDialog({ directory: true });
    if (!dir || Array.isArray(dir)) return;

    setFiles([]);
    setProg(0);
    setBusy(true);
    invoke("scan_executables_stream", { dir });
  }, [busy]);

  return { files, prog, busy, start };
}
