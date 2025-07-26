import { useScan } from "@/hooks/useScan";
import { FileList } from "@/components/FileList";
import { ScanButton } from "@/components/ScanButton";
import { ProgressBar } from "@/components/ProgressBar";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  const { files, prog, busy, start } = useScan();

  return (
    <div className="p-8 space-y-4">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>

      <ScanButton busy={busy} onClick={start} />
      <ProgressBar v={prog} />
      <FileList items={files} />
    </div>
  );
}
