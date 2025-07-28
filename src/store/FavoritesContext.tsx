import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { ExeEntry } from "@/store/ScanContext";

type Ctx = {
  keeps: ExeEntry[];
  toggle: (e: ExeEntry) => void;
};

const FAVORITES_KEY = "arrancador.keeps";

const Ctx = createContext<Ctx | null>(null);
export const useFavs = () => useContext(Ctx)!;

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [keeps, setKeeps] = useState<ExeEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) setKeeps(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(keeps));
    } catch {}
  }, [keeps]);

  const toggle = (exe: ExeEntry) =>
    setKeeps((prev) =>
      prev.some((x) => x.path === exe.path)
        ? prev.filter((x) => x.path !== exe.path)
        : [...prev, exe]
    );

  return <Ctx.Provider value={{ keeps, toggle }}>{children}</Ctx.Provider>;
}
