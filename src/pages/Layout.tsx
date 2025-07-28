import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";

export default function Layout() {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto bg-background h-full">
        <Outlet />
      </main>
    </div>
  );
}
