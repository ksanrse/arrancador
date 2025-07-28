import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Home as HomeIcon, Search as SearchIcon } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

export function AppSidebar() {
  const navMain = [
    { title: "Home", to: "/", icon: HomeIcon },
    { title: "Search", to: "/search", icon: SearchIcon },
  ];

  return (
    <SidebarProvider defaultOpen className="w-auto">
      <Sidebar variant="inset" collapsible="icon">
        <SidebarContent className=" pt-6">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navMain.map(({ title, to, icon: Icon }) => (
                  <SidebarMenuItem key={title}>
                    <SidebarMenuButton asChild tooltip={title}>
                      <NavLink
                        to={to}
                        className={({ isActive }) =>
                          "flex items-center gap-2 px-3 py-2 rounded-md " +
                          (isActive
                            ? "bg-secondary text-secondary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground")
                        }
                      >
                        <Icon />
                        <span>{title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <ModeToggle />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
}
