import { createBrowserRouter } from "react-router-dom";
import Layout from "@/pages/Layout";
import Home from "@/pages/Home";
import Search from "@/pages/Search";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "search", element: <Search /> },
    ],
  },
]);
