import { useMemo } from "react";
import { useGames } from "@/store/GamesContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Clock,
  Gamepad2,
  Trophy,
  BarChart3,
} from "lucide-react";

// Helper to format seconds to hours
const toHours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;

export default function Statistics() {
  const { games } = useGames();

  const stats = useMemo(() => {
    const totalGames = games.length;
    const totalPlaytime = games.reduce((acc, g) => acc + g.total_playtime, 0);
    const completedGames = games.filter((g) => g.play_count > 0).length; // Just played ones for now
    
    // Top Played
    const topPlayed = [...games]
      .sort((a, b) => b.total_playtime - a.total_playtime)
      .slice(0, 10) // Top 10
      .map((g) => ({
        name: g.name,
        hours: toHours(g.total_playtime),
      }))
      .filter((g) => g.hours > 0);

    return { totalGames, totalPlaytime, completedGames, topPlayed };
  }, [games]);

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Статистика</h1>
        <p className="text-muted-foreground">Обзор вашей игровой активности</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium text-muted-foreground">
              Всего игр
            </h3>
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">{stats.totalGames}</div>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium text-muted-foreground">
              Общее время
            </h3>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">
            {Math.floor(stats.totalPlaytime / 3600)} ч{" "}
            {Math.round((stats.totalPlaytime % 3600) / 60)} мин
          </div>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium text-muted-foreground">
              Активных игр
            </h3>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">{stats.completedGames}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Запущенных хотя бы раз
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="bg-card rounded-lg border shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Топ игр по времени (часы)
          </h3>
        </div>
        <div className="p-6 h-[500px]">
          {stats.topPlayed.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topPlayed} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  tick={{ fontSize: 12, fill: "currentColor" }}
                  interval={0}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1e293b", borderRadius: "8px", border: "none", color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                  cursor={{fill: 'transparent'}}
                />
                <Bar dataKey="hours" fill="currentColor" radius={[0, 4, 4, 0]} className="fill-primary" barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Нет данных о времени игры
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
