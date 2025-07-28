import { useScanCtx } from "@/store/ScanContext";
import { useFavs } from "@/store/FavoritesContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { openPath } from "@tauri-apps/plugin-opener";

export default function Search() {
  const { files, progress, busy, startScan } = useScanCtx(); // ← контекст
  const { keeps, toggle } = useFavs();

  const isKept = (p: string) => keeps.some((k) => k.path === p);

  return (
    <>
      <Button onClick={startScan} disabled={busy}>
        {busy ? "Сканирование…" : "Выбрать папку"}
      </Button>
      <Progress value={progress * 100} className="my-4" />

      <ScrollArea className="h-[calc(100%-88px)] border rounded-md p-2">
        {files.map((exe) => (
          <div
            key={exe.path}
            className="flex items-center justify-between p-2 hover:bg-muted rounded"
          >
            <span
              className="cursor-pointer flex-1"
              onClick={() => openPath(exe.path).catch(console.error)}
            >
              {exe.file_name}
            </span>
            <Button
              variant={isKept(exe.path) ? "secondary" : "outline"}
              size="sm"
              onClick={() => toggle(exe)}
            >
              {isKept(exe.path) ? "★" : "☆"}
            </Button>
          </div>
        ))}
      </ScrollArea>
    </>
  );
}
