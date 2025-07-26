import { Button } from "./ui/button";

export function ScanButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} disabled={busy}>
      {busy ? "Сканирование…" : "Выбрать папку"}
    </Button>
  );
}
