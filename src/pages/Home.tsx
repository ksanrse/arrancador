import { useFavs } from "@/store/FavoritesContext";
import { Card, CardContent } from "@/components/ui/card";
import { openPath } from "@tauri-apps/plugin-opener";

export default function Home() {
  const { keeps } = useFavs();

  if (keeps.length === 0) {
    return <p className="text-muted-foreground">Нет избранных игр. Отметьте их ⭐ в Search.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {keeps.map((exe) => (
        <Card
          key={exe.path}
          className="cursor-pointer hover:bg-secondary transition"
          onClick={() => openPath(exe.path).catch(console.error)}
        >
          <CardContent className="p-4">{exe.file_name}</CardContent>
        </Card>
      ))}
    </div>
  );
}
