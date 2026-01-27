import { ThemeProvider } from "@/components/theme-provider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="arrancador-theme">
      {children}
    </ThemeProvider>
  );
}
