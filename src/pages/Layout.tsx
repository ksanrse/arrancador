import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { GamesProvider } from "@/store/GamesContext";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <GamesProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 border-b bg-background/80 backdrop-blur-md z-50 flex items-center justify-between px-4">
          <span className="font-bold text-lg tracking-tight">Arrancador</span>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 hover:bg-accent rounded-md transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Sidebar wrapper for responsiveness */}
        <div
          className={cn(
            "fixed inset-0 z-40 lg:static lg:z-auto transition-transform duration-300 lg:translate-x-0 shrink-0",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Backdrop for mobile */}
          <div 
            className={cn(
              "absolute inset-0 bg-background/80 backdrop-blur-sm lg:hidden transition-opacity duration-300",
              isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <Sidebar />
        </div>

        <main className="flex-1 min-w-0 overflow-auto pt-14 lg:pt-0 scrollbar-stable">
          <div className="min-h-full max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </GamesProvider>
  );
}
