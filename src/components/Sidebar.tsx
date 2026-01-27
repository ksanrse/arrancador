import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  FolderSearch,
  Gamepad2,
  Settings,
  Star,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useGames } from "@/store/GamesContext";
import { ModeToggle } from "./mode-toggle";

const navItems = [
  { title: "Библиотека", to: "/", icon: Gamepad2 },
  { title: "Сканирование", to: "/scan", icon: FolderSearch },
  { title: "Статистика", to: "/statistics", icon: BarChart2 },
  { title: "Настройки", to: "/settings", icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { favorites } = useGames();
  const location = useLocation();

  return (
    <aside
      className={cn(
        "h-screen flex flex-col border-r border-border bg-sidebar transition-all duration-200 relative z-50",
        collapsed ? "w-16" : "w-64",
        "w-[300px] lg:w-auto", // Fixed width on mobile, auto (collapsed/expanded) on desktop
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        {!collapsed && (
          <span className="font-semibold text-lg tracking-tight">
            Arrancador
          </span>
        )}
        {collapsed && <Gamepad2 className="w-6 h-6 mx-auto" />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map(({ title, to, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            (to === "/" && location.pathname.startsWith("/game/"));

          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground font-medium",
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{title}</span>}
            </NavLink>
          );
        })}

        {/* Favorites Section */}
        {favorites.length > 0 && !collapsed && (
          <div className="pt-4 mt-4 border-t border-border">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Избранное
            </div>
            {favorites.slice(0, 5).map((game) => (
              <NavLink
                key={game.id}
                to={`/game/${game.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  "hover:bg-accent hover:text-accent-foreground text-sm",
                  location.pathname === `/game/${game.id}` && "bg-accent",
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
      <div className="p-2 border-t border-border">
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "justify-between px-2",
          )}
        >
          {!collapsed && <ModeToggle />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-2 rounded-md hover:bg-accent transition-colors"
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
