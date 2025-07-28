import { ThemeProvider } from "@/components/theme-provider";
import { FavoritesProvider } from "@/store/FavoritesContext";
import { ScanProvider } from "@/store/ScanContext"; // ← импортируем

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <FavoritesProvider>
        <ScanProvider>{children}</ScanProvider>
      </FavoritesProvider>
    </ThemeProvider>
  );
}
