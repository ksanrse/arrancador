import { openPath } from "@tauri-apps/plugin-opener";
import { ScrollArea } from "./ui/scroll-area";
import { ExeEntry } from "@/hooks/useScan";

export function FileList({ items }: { items: ExeEntry[] }) {
  return (
    <ScrollArea className="h-[500px] border rounded-md p-2">
      {items.map((e) => (
        <div
          key={e.path}
          className="p-2 hover:bg-secondary cursor-pointer rounded"
          onClick={() => openPath(e.path)}
        >
          {e.file_name}
        </div>
      ))}
    </ScrollArea>
  );
}
