import { createBrowserRouter } from "react-router-dom";
import Layout from "@/pages/Layout";
import Library from "@/pages/Library";
import GameDetail from "@/pages/GameDetail";
import Scan from "@/pages/Scan";
import Settings from "@/pages/Settings";
import Statistics from "@/pages/Statistics";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Library /> },
      { path: "game/:id", element: <GameDetail /> },
      { path: "scan", element: <Scan /> },
      { path: "statistics", element: <Statistics /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);
