import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  FolderSearch,
  Gamepad2,
  Monitor,
  Settings,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useGamesState } from "@/store/GamesContext";
import { ModeToggle } from "./mode-toggle";

const SIDEBAR_STORAGE_KEY = "arrancador_sidebar_collapsed";

const navItems = [
  { title: "Библиотека", to: "/", icon: Gamepad2 },
  { title: "Сканирование", to: "/scan", icon: FolderSearch },
  { title: "SQOBA", to: "/sqoba", icon: Sparkles },
  { title: "Статистика", to: "/statistics", icon: BarChart2 },
  { title: "Система", to: "/system", icon: Monitor },
  { title: "Настройки", to: "/settings", icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });
  const { favorites } = useGamesState();
  const location = useLocation();
  const sidebarWidthClass = collapsed
    ? "lg:w-[72px] lg:min-w-[72px]"
    : "lg:w-[260px] lg:min-w-[260px]";
  const navItemLayoutClass = collapsed
    ? "lg:justify-center lg:px-2"
    : "lg:px-3";

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "h-screen flex flex-col border-r border-border/60 bg-sidebar/95 text-sidebar-foreground flex-none",
        "supports-[backdrop-filter]:bg-sidebar/80 backdrop-blur-xl",
        "transition-[width] duration-200 ease-out relative z-50 shadow-[0_20px_50px_rgba(8,12,24,0.2)]",
        "w-[280px] sm:w-[320px]",
        sidebarWidthClass,
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "h-14 flex items-center gap-3 border-b border-border/60 px-4",
          collapsed && "lg:justify-center lg:gap-0 lg:px-2",
        )}
      >
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent/70 text-sidebar-foreground",
            "shadow-[0_8px_20px_rgba(8,12,24,0.18)]",
            collapsed && "shadow-none",
          )}
        >
          <Gamepad2 className="w-5 h-5" />
        </div>
        <span
          className={cn(
            "font-semibold text-base tracking-tight",
            collapsed && "lg:sr-only",
          )}
        >
          Arrancador
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto scrollbar-stable">
        {navItems.map(({ title, to, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            (to === "/" && location.pathname.startsWith("/game/"));

          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? title : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-w-0",
                navItemLayoutClass,
                "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                isActive &&
                  "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_10px_24px_rgba(8,12,24,0.15)]",
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className={cn("truncate", collapsed && "lg:hidden")}>
                {title}
              </span>
            </NavLink>
          );
        })}

        {/* Favorites Section */}
        {favorites.length > 0 && (
          <div
            className={cn(
              "pt-4 mt-4 border-t border-border/60",
              collapsed && "lg:hidden",
            )}
          >
            <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Избранное
            </div>
            {favorites.slice(0, 5).map((game) => (
              <NavLink
                key={game.id}
                to={`/game/${game.id}`}
                title={game.name}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors min-w-0",
                  "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                  location.pathname === `/game/${game.id}` &&
                    "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_8px_20px_rgba(8,12,24,0.12)]",
                )}
              >
                <Star className="w-4 h-4 flex-shrink-0 text-yellow-500" />
                <span className="truncate">{game.name}</span>
              </NavLink>
            ))}
            {favorites.length > 5 && (
              <div className="px-3 py-1 text-xs text-muted-foreground">
                +{favorites.length - 5} еще
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border/60">
        <div
          className={cn(
            "flex items-center gap-2 justify-between px-1",
            collapsed && "lg:flex-col lg:justify-center lg:px-0",
          )}
        >
          <div className={cn(collapsed && "lg:hidden")}>
            <ModeToggle />
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent/60 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            title={collapsed ? "Развернуть" : "Свернуть"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
