import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const runUpdateCheck = async () => {
      if (!isTauri()) {
        return;
      }
      try {
        await check();
      } catch (error) {
        console.error("Updater check failed:", error);
      }
    };

    runUpdateCheck();
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="arrancador-theme">
      {children}
    </ThemeProvider>
  );
}
