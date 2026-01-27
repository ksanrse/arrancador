import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart3, Clock, Gamepad2, Loader2 } from "lucide-react";
import { statsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PlaytimeStats } from "@/types";

const toHours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const addDays = (value: Date, amount: number) => {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const formatDuration = (seconds: number) => {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} \u043c\u0438\u043d`;
  }

  return `${hours} \u0447 ${minutes} \u043c\u0438\u043d`;
};

const formatDateShort = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
};

const formatDateLong = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
  });
};

const formatGameName = (name: string) =>
  name.length > 20 ? `${name.slice(0, 18)}\u2026` : name;

const rangePresets = [
  { id: "7d", label: `7 \u0434\u043d\u0435\u0439`, days: 7 },
  { id: "30d", label: `30 \u0434\u043d\u0435\u0439`, days: 30 },
  { id: "90d", label: `90 \u0434\u043d\u0435\u0439`, days: 90 },
];

const tooltipContentStyle = {
  backgroundColor: "hsl(var(--popover))",
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
};

const tooltipLabelStyle = {
  color: "hsl(var(--muted-foreground))",
  fontSize: 12,
};

const tooltipItemStyle = {
  color: "hsl(var(--foreground))",
};

export default function Statistics() {
  const today = new Date();
  const defaultEnd = toIsoDate(today);
  const defaultStart = toIsoDate(addDays(today, -29));

  const [stats, setStats] = useState<PlaytimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState("30d");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  useEffect(() => {
    let isActive = true;

    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await statsApi.getPlaytimeStats(startDate, endDate);
        if (!isActive) return;
        setStats(response);
      } catch (err) {
        console.error("Failed to load playtime stats:", err);
        if (!isActive) return;
        setError(
          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0443"
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      isActive = false;
    };
  }, [startDate, endDate]);

  const dailyData = useMemo(
    () =>
      stats?.daily_totals.map((entry) => ({
        date: entry.date,
        hours: toHours(entry.seconds),
        seconds: entry.seconds,
      })) ?? [],
    [stats]
  );

  const perGameData = useMemo(
    () =>
      stats?.per_game_totals.slice(0, 8).map((entry) => ({
        ...entry,
        hours: toHours(entry.seconds),
      })) ?? [],
    [stats]
  );

  const totalDays = stats?.daily_totals.length ?? 0;
  const activeDays =
    stats?.daily_totals.filter((entry) => entry.seconds > 0).length ?? 0;
  const averageSeconds =
    stats && totalDays > 0 ? Math.round(stats.total_seconds / totalDays) : 0;
  const rangeLabel = stats
    ? `${formatDateLong(stats.range_start)} \u2014 ${formatDateLong(
        stats.range_end
      )}`
    : "";
  const topGame = stats?.per_game_totals[0];
  const hasDailyData = (stats?.total_seconds ?? 0) > 0;
  const hasPerGameData = perGameData.length > 0;
  const hasMoreGames = stats && stats.per_game_totals.length > perGameData.length;

  const handlePresetClick = (days: number, presetId: string) => {
    const now = new Date();
    const nextEnd = toIsoDate(now);
    const nextStart = toIsoDate(addDays(now, -(days - 1)));
    setRangePreset(presetId);
    setStartDate(nextStart);
    setEndDate(nextEnd);
  };

  const handleStartDateChange = (value: string) => {
    setRangePreset("custom");
    setStartDate(value);
    if (value && value > endDate) {
      setEndDate(value);
    }
  };

  const handleEndDateChange = (value: string) => {
    setRangePreset("custom");
    setEndDate(value);
    if (value && value < startDate) {
      setStartDate(value);
    }
  };

  if (loading && !stats) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats && error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  const tooltipFormatter = (
    _value: number,
    _name: string,
    props: { payload?: { seconds?: number } }
  ) => [
    formatDuration(props.payload?.seconds ?? 0),
    "\u0412\u0440\u0435\u043c\u044f",
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {"\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {
            "\u041e\u0431\u0437\u043e\u0440 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 \u0437\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434"
          }
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {"\u041f\u0435\u0440\u0438\u043e\u0434"}
          </CardTitle>
          <CardDescription>
            {rangeLabel ||
              "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d \u0434\u043b\u044f \u043e\u0442\u0447\u0435\u0442\u0430"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {rangePresets.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant={rangePreset === preset.id ? "secondary" : "outline"}
                className="rounded-full"
                onClick={() => handlePresetClick(preset.days, preset.id)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {"\u0421"}
              </span>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {"\u041f\u043e"}
              </span>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => handleEndDateChange(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {"\u0412\u0441\u0435\u0433\u043e \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434"}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {stats ? formatDuration(stats.total_seconds) : "\u2014"}
            </div>
            <p className="text-xs text-muted-foreground">
              {rangeLabel ||
                "\u0417\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043f\u0435\u0440\u0438\u043e\u0434"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {"\u0421\u0440\u0435\u0434\u043d\u0435\u0435 \u0432 \u0434\u0435\u043d\u044c"}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {stats ? formatDuration(averageSeconds) : "\u2014"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats
                ? `${activeDays} \u0438\u0437 ${totalDays} \u0434\u043d\u0435\u0439 \u0431\u044b\u043b\u0438 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u043c\u0438`
                : "\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {"\u0418\u0433\u0440\u044b \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434"}
            </CardTitle>
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {stats ? stats.per_game_totals.length : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {topGame
                ? `\u0422\u043e\u043f: ${topGame.name} \u2014 ${formatDuration(
                    topGame.seconds
                  )}`
                : "\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <Card className="bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              {"\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u043f\u043e \u0434\u043d\u044f\u043c"}
            </CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {hasDailyData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="dailyGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(value: number) => `${value} \u0447`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    cursor={{ fill: "transparent" }}
                    formatter={tooltipFormatter}
                    labelFormatter={formatDateLong}
                  />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#dailyGradient)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {"\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
              {"\u0420\u0430\u0437\u0431\u0438\u0432\u043a\u0430 \u043f\u043e \u0438\u0433\u0440\u0430\u043c"}
            </CardTitle>
            <CardDescription>
              {hasMoreGames
                ? "\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u044b \u0442\u043e\u043f-8"
                : "\u0417\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {hasPerGameData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={perGameData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(value: number) => `${value} \u0447`}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tickFormatter={formatGameName}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    cursor={{ fill: "transparent" }}
                    formatter={tooltipFormatter}
                  />
                  <Bar
                    dataKey="hours"
                    fill="hsl(var(--primary))"
                    radius={[0, 6, 6, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {"\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u043e \u0438\u0433\u0440\u0430\u043c"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
