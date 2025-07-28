import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface ExeEntry {
  path: string;
  file_name: string;
}

type ScanCtx = {
  files: ExeEntry[];
  progress: number;
  busy: boolean;
  startScan: () => void;
};

const Ctx = createContext<ScanCtx | null>(null);
export const useScanCtx = () => useContext(Ctx)!;

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<ExeEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // при каждом scan:entry отбрасываем дубликаты
    const off1 = listen<ExeEntry>("scan:entry", ({ payload }) =>
      setFiles((prev) => {
        if (prev.some((e) => e.path === payload.path)) {
          return prev;
        }
        return [...prev, payload];
      })
    );
    const off2 = listen<number>("scan:progress", (e) => setProgress(e.payload));
    const off3 = listen("scan:done", () => {
      setProgress(1);
      setBusy(false);
    });

    return () => {
      off1.then((f) => f());
      off2.then((f) => f());
      off3.then((f) => f());
    };
  }, []);

  const startScan = useCallback(async () => {
    if (busy) await emit("scan:cancel");
    const dir = await openDialog({ directory: true });
    if (!dir || Array.isArray(dir)) return;

    setFiles([]);
    setProgress(0);
    setBusy(true);
    invoke("scan_executables_stream", { dir });
  }, [busy]);

  return (
    <Ctx.Provider value={{ files, progress, busy, startScan }}>
      {children}
    </Ctx.Provider>
  );
}
