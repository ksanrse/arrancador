import { useEffect, useMemo, useState } from "react";
import { useGames } from "@/store/GamesContext";
import { statsApi } from "@/lib/api";
import type { PlaytimeStats } from "@/types";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart3,
  Calendar,
  Clock,
  Gamepad2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RangePreset = "7d" | "30d" | "90d" | "custom";

const rangePresets: { id: RangePreset; label: string; days?: number }[] = [
  { id: "7d", label: "\u0417\u0430 7 \u0434\u043d\u0435\u0439", days: 7 },
  { id: "30d", label: "\u0417\u0430 30 \u0434\u043d\u0435\u0439", days: 30 },
  { id: "90d", label: "\u0417\u0430 90 \u0434\u043d\u0435\u0439", days: 90 },
  { id: "custom", label: "\u041f\u0435\u0440\u0438\u043e\u0434" },
];

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getRangeFromPreset = (days: number) => {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - (days - 1));
  return { start: formatDate(start), end: formatDate(end) };
};

const toHours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;

const formatDuration = (seconds: number) => {
  if (!seconds) return `0 \u043c\u0438\u043d`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} \u0447 ${minutes} \u043c\u0438\u043d`;
  }
  return `${minutes} \u043c\u0438\u043d`;
};

const formatShortDate = (value: string) => value.slice(5);

export default function Statistics() {
  const { games } = useGames();
  const defaultRange = useMemo(() => getRangeFromPreset(30), []);
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [stats, setStats] = useState<PlaytimeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [focusedGameId, setFocusedGameId] = useState<string>("");

  useEffect(() => {
    if (rangePreset === "custom") return;
    const preset = rangePresets.find((item) => item.id === rangePreset);
    if (!preset?.days) return;
    const range = getRangeFromPreset(preset.days);
    setStartDate(range.start);
    setEndDate(range.end);
  }, [rangePreset]);

  useEffect(() => {
    if (!startDate || !endDate) return;
    const [rangeStart, rangeEnd] =
      startDate <= endDate ? [startDate, endDate] : [endDate, startDate];

    let active = true;
    setStatsLoading(true);
    setStatsError(null);
    statsApi
      .getPlaytimeStats(rangeStart, rangeEnd)
      .then((data) => {
        if (!active) return;
        setStats(data);
      })
      .catch((error) => {
        if (!active) return;
        setStatsError(
          error instanceof Error
            ? error.message
            : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0443",
        );
      })
      .finally(() => {
        if (!active) return;
        setStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [startDate, endDate]);

  const totalGames = games.length;
  const totalPlaytime = useMemo(
    () => games.reduce((acc, game) => acc + game.total_playtime, 0),
    [games],
  );

  const rangeLabel = stats
    ? `${stats.range_start} \u2014 ${stats.range_end}`
    : `${startDate} \u2014 ${endDate}`;
  const rangePlaytime = stats?.total_seconds ?? 0;

  const dailyData = useMemo(
    () =>
      stats?.daily_totals.map((entry) => ({
        date: entry.date,
        hours: toHours(entry.seconds),
        seconds: entry.seconds,
      })) ?? [],
    [stats],
  );

  const perGameData = useMemo(
    () =>
      stats?.per_game_totals.map((entry) => ({
        id: entry.id,
        name: entry.name,
        hours: toHours(entry.seconds),
        seconds: entry.seconds,
      })) ?? [],
    [stats],
  );

  const chartGameData = perGameData.slice(0, 10);

  useEffect(() => {
    if (!perGameData.length) {
      setFocusedGameId("");
      return;
    }
    if (!focusedGameId || !perGameData.some((game) => game.id === focusedGameId)) {
      setFocusedGameId(perGameData[0].id);
    }
  }, [perGameData, focusedGameId]);

  const focusedGame = perGameData.find((game) => game.id === focusedGameId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430
          </h1>
          <p className="text-muted-foreground text-sm">
            \u0418\u0433\u0440\u043e\u0432\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c \u0438 \u0441\u0440\u0435\u0437\u044b \u043f\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430\u043c
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/70 p-2 shadow-sm">
          {rangePresets.map((preset) => (
            <Button
              key={preset.id}
              variant={rangePreset === preset.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRangePreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
          {rangePreset === "custom" && (
            <div className="flex items-center gap-2 pl-2 border-l border-border/60">
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-8 w-[140px] text-xs"
              />
              <span className="text-muted-foreground text-xs">\u2014</span>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-8 w-[140px] text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {statsError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {statsError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-card/95 to-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>\u0412\u0441\u0435\u0433\u043e \u0438\u0433\u0440</CardDescription>
              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">{totalGames}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gradient-to-br from-card/95 to-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>\u0412\u0441\u0435\u0433\u043e \u0432\u0440\u0435\u043c\u0435\u043d\u0438</CardDescription>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">
              {formatDuration(totalPlaytime)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gradient-to-br from-card/95 to-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>\u0417\u0430 \u043f\u0435\u0440\u0438\u043e\u0434</CardDescription>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">
              {formatDuration(rangePlaytime)}
            </CardTitle>
            <CardDescription className="text-xs">{rangeLabel}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="bg-gradient-to-br from-card/95 to-card shadow-sm">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  \u0418\u0433\u0440\u043e\u0432\u043e\u0435 \u0432\u0440\u0435\u043c\u044f \u043f\u043e \u0434\u043d\u044f\u043c
                </CardTitle>
                <CardDescription>{rangeLabel}</CardDescription>
              </div>
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[280px]">
              {statsLoading && !stats ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...
                </div>
              ) : dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ left: 6, right: 12 }}>
                    <defs>
                      <linearGradient id="playtimeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.25} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 12, fill: "currentColor" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value) => `${value}\u0447`}
                      tick={{ fontSize: 12, fill: "currentColor" }}
                      width={38}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        formatDuration(Math.round(value * 3600))
                      }
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                      }}
                      labelStyle={{ color: "inherit" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="hours"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#playtimeGradient)"
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  \u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card/95 to-card shadow-sm">
          <CardHeader className="pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">
                  \u0418\u0433\u0440\u044b \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434
                </CardTitle>
                <CardDescription>{rangeLabel}</CardDescription>
              </div>
              {perGameData.length > 0 && (
                <select
                  value={focusedGameId}
                  onChange={(event) => setFocusedGameId(event.target.value)}
                  className="text-sm bg-transparent border border-border/60 rounded-md px-2 py-1 text-foreground"
                >
                  {perGameData.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {focusedGame && (
              <div className="text-sm text-muted-foreground mb-4">
                <span className="font-medium text-foreground">{focusedGame.name}</span>{" "}
                \u2014 {formatDuration(focusedGame.seconds)}
              </div>
            )}
            <div className="h-[280px]">
              {statsLoading && !stats ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...
                </div>
              ) : chartGameData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartGameData}
                    layout="vertical"
                    margin={{ left: 20, right: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.25} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => `${value}\u0447`}
                      tick={{ fontSize: 12, fill: "currentColor" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      tick={{ fontSize: 12, fill: "currentColor" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        formatDuration(Math.round(value * 3600))
                      }
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                      }}
                      labelStyle={{ color: "inherit" }}
                    />
                    <Bar
                      dataKey="hours"
                      fill="var(--primary)"
                      radius={[0, 6, 6, 0]}
                      barSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  \u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445
                </div>
              )}
            </div>
            {perGameData.length > chartGameData.length && (
              <div className="mt-3 text-xs text-muted-foreground">
                \u041f\u043e\u043a\u0430\u0437\u0430\u043d\u044b \u0442\u043e\u043f {chartGameData.length} \u0438\u0437 {perGameData.length}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
