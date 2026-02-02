import {
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Monitor,
  RefreshCw,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { systemApi } from "@/lib/api";
import type { DiskSpeedResult, SystemInfo } from "@/types";

const STORAGE_KEY = "arrancador_system_info_snapshot";
const STORAGE_CHECKED_KEY = "arrancador_system_info_checked_at";

const formatBytes = (value: number) => {
  if (!value || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
};

const formatSpeed = (value: number) => `${Math.round(value)} MB/s`;

const formatUptime = (seconds: number) => {
  if (!seconds || seconds <= 0) {
    return "\u2014";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} \u0434`);
  if (hours > 0 || days > 0) parts.push(`${hours} \u0447`);
  parts.push(`${minutes} \u043c\u0438\u043d`);

  return parts.join(" ");
};

const formatCheckedAt = (value: string | null) => {
  if (!value) return "\u2014";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "\u2014";
  return parsed.toLocaleString("ru-RU");
};

const formatCoreLabel = (physical: number | null, logical: number) => {
  if (!logical) {
    return "\u2014";
  }
  if (physical) {
    return `${physical} \u0444\u0438\u0437. / ${logical} \u043b\u043e\u0433.`;
  }
  return `${logical} \u043b\u043e\u0433.`;
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right break-words">{value}</span>
  </div>
);

export default function SystemInfoPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diskTests, setDiskTests] = useState<
    Record<
      string,
      { loading: boolean; result?: DiskSpeedResult; error?: string }
    >
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cached = window.localStorage.getItem(STORAGE_KEY);
    const cachedCheckedAt = window.localStorage.getItem(STORAGE_CHECKED_KEY);

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as SystemInfo;
        setInfo(parsed);
      } catch (err) {
        console.warn("Failed to parse cached system info:", err);
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    if (cachedCheckedAt) {
      setCheckedAt(cachedCheckedAt);
    }
  }, []);

  const handleRefresh = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await systemApi.getInfo();
      const timestamp = new Date().toISOString();
      setInfo(data);
      setCheckedAt(timestamp);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        window.localStorage.setItem(STORAGE_CHECKED_KEY, timestamp);
      }
    } catch (err) {
      console.error("Failed to load system info:", err);
      setError(
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u043e \u0441\u0438\u0441\u0442\u0435\u043c\u0435",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDiskTest = async (mountPoint: string) => {
    setDiskTests((prev) => ({
      ...prev,
      [mountPoint]: { loading: true },
    }));

    try {
      const result = await systemApi.testDiskSpeed(mountPoint);
      setDiskTests((prev) => ({
        ...prev,
        [mountPoint]: { loading: false, result },
      }));
    } catch (err) {
      console.error("Failed to test disk speed:", err);
      setDiskTests((prev) => ({
        ...prev,
        [mountPoint]: {
          loading: false,
          error:
            "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0441\u0442\u0438 \u0442\u0435\u0441\u0442",
        },
      }));
    }
  };

  const memoryUsagePercent = useMemo(() => {
    if (!info || info.memory.total_bytes <= 0) return 0;
    return Math.min(
      100,
      (info.memory.used_bytes / info.memory.total_bytes) * 100,
    );
  }, [info]);

  const diskCards = useMemo(() => {
    if (!info) return [];
    return info.disks.map((disk, index) => {
      const usedBytes = Math.max(0, disk.total_bytes - disk.available_bytes);
      const percent =
        disk.total_bytes > 0
          ? Math.min(100, (usedBytes / disk.total_bytes) * 100)
          : 0;
      const model = disk.model || disk.name || "\u2014";
      const typeLabel = disk.media_type || disk.kind || "\u2014";

      return {
        key: `${disk.mount_point}-${index}`,
        mountPoint: disk.mount_point,
        model,
        typeLabel,
        used: formatBytes(usedBytes),
        total: formatBytes(disk.total_bytes),
        free: disk.available_bytes
          ? formatBytes(disk.available_bytes)
          : "\u2014",
        percent,
        isRemovable: disk.is_removable,
      };
    });
  }, [info]);

  const gpuItems = useMemo(() => {
    if (!info) return [];
    return info.gpus.map((gpu, index) => ({
      key: `${gpu.device_name}-${index}`,
      name:
        gpu.name ||
        "\u0412\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442\u0430",
      isPrimary: gpu.is_primary,
    }));
  }, [info]);

  const monitorItems = useMemo(() => {
    if (!info) return [];
    return info.monitors.map((monitor, index) => {
      const name =
        monitor.name ||
        monitor.device_name ||
        `\u041c\u043e\u043d\u0438\u0442\u043e\u0440 ${index + 1}`;
      const resolution =
        monitor.width && monitor.height
          ? `${monitor.width}\u00d7${monitor.height}`
          : "\u2014";
      const refresh = monitor.refresh_rate
        ? `${monitor.refresh_rate} \u0413\u0446`
        : "";
      return {
        key: `${monitor.device_name}-${index}`,
        name,
        resolution,
        refresh,
        isPrimary: monitor.is_primary,
      };
    });
  }, [info]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {"\u0421\u0438\u0441\u0442\u0435\u043c\u0430"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {
              "\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b \u0432\u0430\u0448\u0435\u0433\u043e \u041f\u041a"
            }
          </p>
          <p className="text-xs text-muted-foreground">
            {`\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0430: ${formatCheckedAt(checkedAt)}`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {
            "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u043d\u043e\u0432\u0430"
          }
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {!info && !loading ? (
        <Card className="bg-card/60">
          <CardContent className="py-6 text-sm text-muted-foreground">
            {
              "\u0414\u0430\u043d\u043d\u044b\u0445 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u043d\u043e\u0432\u0430\u00bb, \u0447\u0442\u043e\u0431\u044b \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u0438."
            }
          </CardContent>
        </Card>
      ) : null}

      {info ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  {"\u041f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440"}
                </CardTitle>
                <CardDescription>
                  {info.cpu.vendor_id || "\u2014"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label={"\u041c\u043e\u0434\u0435\u043b\u044c"}
                  value={info.cpu.brand || "\u2014"}
                />
                <InfoRow
                  label={"\u042f\u0434\u0440\u0430"}
                  value={formatCoreLabel(
                    info.cpu.physical_cores,
                    info.cpu.logical_cores,
                  )}
                />
                <InfoRow
                  label={"\u0427\u0430\u0441\u0442\u043e\u0442\u0430"}
                  value={
                    info.cpu.frequency_mhz
                      ? `${info.cpu.frequency_mhz} MHz`
                      : "\u2014"
                  }
                />
              </CardContent>
            </Card>

            <Card className="bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  {
                    "\u0412\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442\u0430"
                  }
                </CardTitle>
                <CardDescription>
                  {gpuItems.length > 1
                    ? `\u041d\u0430\u0439\u0434\u0435\u043d\u043e ${gpuItems.length}`
                    : "\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u0430\u0434\u0430\u043f\u0442\u0435\u0440"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {gpuItems.length > 0 ? (
                  gpuItems.map((gpu) => (
                    <div
                      key={gpu.key}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="font-medium">{gpu.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {gpu.isPrimary
                          ? "\u041e\u0441\u043d\u043e\u0432\u043d\u0430\u044f"
                          : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {"\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  {"\u041e\u0417\u0423"}
                </CardTitle>
                <CardDescription>
                  {
                    "\u041e\u0431\u044a\u0435\u043c \u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043f\u0430\u043c\u044f\u0442\u0438"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {
                        "\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f"
                      }
                    </span>
                    <span className="font-medium">
                      {`${formatBytes(info.memory.used_bytes)} / ${formatBytes(
                        info.memory.total_bytes,
                      )}`}
                    </span>
                  </div>
                  <Progress value={memoryUsagePercent} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {`\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e ${formatBytes(
                        info.memory.available_bytes,
                      )}`}
                    </span>
                    <span>
                      {`\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u043e ${formatBytes(
                        info.memory.free_bytes,
                      )}`}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <div className="text-xs text-muted-foreground">
                      {"Swap \u0432\u0441\u0435\u0433\u043e"}
                    </div>
                    <div className="text-sm font-semibold">
                      {formatBytes(info.memory.total_swap_bytes)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <div className="text-xs text-muted-foreground">
                      {
                        "Swap \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f"
                      }
                    </div>
                    <div className="text-sm font-semibold">
                      {formatBytes(info.memory.used_swap_bytes)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">
                {"\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u044b"}
              </div>
              <div className="text-xs text-muted-foreground">
                {monitorItems.length > 0
                  ? `\u041d\u0430\u0439\u0434\u0435\u043d\u043e ${monitorItems.length}`
                  : "\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {monitorItems.length > 0 ? (
                monitorItems.map((monitor) => (
                  <Card key={monitor.key} className="bg-card/60">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        {monitor.name}
                      </CardTitle>
                      <CardDescription>
                        {monitor.isPrimary
                          ? "\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u044d\u043a\u0440\u0430\u043d"
                          : "\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0439"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <InfoRow
                        label={
                          "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0435"
                        }
                        value={monitor.resolution}
                      />
                      <InfoRow
                        label={"\u0427\u0430\u0441\u0442\u043e\u0442\u0430"}
                        value={monitor.refresh || "\u2014"}
                      />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="bg-card/60">
                  <CardContent className="py-4 text-sm text-muted-foreground">
                    {
                      "\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u044b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b"
                    }
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  {"\u0421\u0438\u0441\u0442\u0435\u043c\u0430"}
                </CardTitle>
                <CardDescription>
                  {
                    "\u041e\u0421 \u0438 \u0432\u0440\u0435\u043c\u044f \u0440\u0430\u0431\u043e\u0442\u044b"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label={"\u041e\u0421"}
                  value={
                    [info.os_name, info.os_version].filter(Boolean).join(" ") ||
                    "\u2014"
                  }
                />
                <InfoRow
                  label={"\u042f\u0434\u0440\u043e"}
                  value={info.kernel_version || "\u2014"}
                />
                <InfoRow
                  label={
                    "\u0412\u0440\u0435\u043c\u044f \u0440\u0430\u0431\u043e\u0442\u044b"
                  }
                  value={formatUptime(info.uptime_seconds)}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">
                {"\u0414\u0438\u0441\u043a\u0438"}
              </div>
              <div className="text-xs text-muted-foreground">
                {diskCards.length > 0
                  ? `\u041d\u0430\u0439\u0434\u0435\u043d\u043e ${diskCards.length}`
                  : "\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {diskCards.length > 0 ? (
                diskCards.map((disk) => {
                  const testState = diskTests[disk.mountPoint];
                  return (
                    <Card key={disk.key} className="bg-card/60">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                          {disk.model}
                        </CardTitle>
                        <CardDescription>
                          {`${disk.mountPoint} \u2022 ${disk.typeLabel}`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <InfoRow
                          label={
                            "\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043e"
                          }
                          value={`${disk.used} / ${disk.total}`}
                        />
                        <Progress value={disk.percent} />
                        <InfoRow
                          label={
                            "\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u043e"
                          }
                          value={disk.free}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDiskTest(disk.mountPoint)}
                            disabled={testState?.loading || disk.isRemovable}
                          >
                            {testState?.loading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {
                              "\u0422\u0435\u0441\u0442 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438"
                            }
                          </Button>
                          {disk.isRemovable ? (
                            <span className="text-xs text-muted-foreground">
                              {
                                "\u0421\u044a\u0435\u043c\u043d\u044b\u0439 \u043d\u043e\u0441\u0438\u0442\u0435\u043b\u044c"
                              }
                            </span>
                          ) : null}
                        </div>
                        {testState?.result ? (
                          <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                {"\u0417\u0430\u043f\u0438\u0441\u044c"}
                              </span>
                              <span className="font-medium">
                                {formatSpeed(testState.result.write_mbps)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                {"\u0427\u0442\u0435\u043d\u0438\u0435"}
                              </span>
                              <span className="font-medium">
                                {formatSpeed(testState.result.read_mbps)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                        {testState?.error ? (
                          <div className="text-xs text-destructive">
                            {testState.error}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card className="bg-card/60">
                  <CardContent className="py-4 text-sm text-muted-foreground">
                    {
                      "\u0414\u0438\u0441\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b"
                    }
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
