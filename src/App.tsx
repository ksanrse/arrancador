import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { ScrollArea } from "./components/ui/scroll-area";
import { ThemeProvider } from "./components/theme-provider";
import { ModeToggle } from "./components/mode-toggle";

interface ExeEntry {
  path: string;
  file_name: string;
}

export default function App() {
  const [executables, setExecs] = useState<ExeEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const unlistenEntry = listen<ExeEntry>("scan:entry", (e) =>
      setExecs((prev) => [...prev, e.payload])
    );
    const unlistenProg = listen<number>("scan:progress", (e) =>
      setProgress(e.payload)
    );
    const unlistenDone = listen("scan:done", () => {
      setProgress(1);
      setScanning(false);
    });

    return () => {
      unlistenEntry.then((f) => f());
      unlistenProg.then((f) => f());
      unlistenDone.then((f) => f());
    };
  }, []);

  const pickFolder = async () => {
    if (scanning) {
      // отменяем текущий скан
      await emit("scan:cancel");
    }

    const dir = await openDialog({ directory: true });
    if (!dir || Array.isArray(dir)) return;

    setExecs([]);
    setProgress(0);
    setScanning(true);
    invoke("scan_executables_stream", { dir });
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="p-8 space-y-4">
        <div className="absolute top-4 right-4">
          <ModeToggle />
        </div>

        <Button onClick={pickFolder} disabled={scanning}>
          {scanning ? "Сканирование…" : "Выбрать папку"}
        </Button>
        <Progress value={progress * 100} />

        <ScrollArea className="h-[500px] border rounded-md p-2">
          {executables.map((exe) => (
            <div
              key={exe.path}
              className="p-2 hover:bg-secondary cursor-pointer rounded"
              onClick={() => openPath(exe.path)}
            >
              {exe.file_name}
            </div>
          ))}
        </ScrollArea>
      </div>
    </ThemeProvider>
  );
}
