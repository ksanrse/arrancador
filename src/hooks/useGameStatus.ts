import { useEffect, useState } from "react";
import { gamesApi } from "@/lib/api";

export function useGameStatus(gameId?: string, exePath?: string) {
  const [isInstalled, setIsInstalled] = useState(true);
  const [checkingInstalled, setCheckingInstalled] = useState(false);
  const [runningCount, setRunningCount] = useState(0);
  const [checkingRunning, setCheckingRunning] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    let mounted = true;
    setCheckingInstalled(true);
    gamesApi
      .isInstalled(gameId)
      .then((installed) => {
        if (mounted) setIsInstalled(installed);
      })
      .catch((e) => {
        console.error("Failed to check install status:", e);
        if (mounted) setIsInstalled(true);
      })
      .finally(() => {
        if (mounted) setCheckingInstalled(false);
      });

    return () => {
      mounted = false;
    };
  }, [gameId, exePath]);

  useEffect(() => {
    if (!gameId) return;
    let mounted = true;
    const updateRunning = async () => {
      try {
        setCheckingRunning(true);
        const count = await gamesApi.getRunningInstances(gameId);
        if (mounted) setRunningCount(count);
      } catch (e) {
        console.error("Failed to check running instances:", e);
      } finally {
        if (mounted) setCheckingRunning(false);
      }
    };
    updateRunning();
    const id = setInterval(updateRunning, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [gameId]);

  return {
    isInstalled,
    checkingInstalled,
    runningCount,
    checkingRunning,
    setRunningCount,
  };
}
