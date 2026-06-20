import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeId = "orange" | "purple" | "cyan" | "emerald" | "slate" | "slate-orange" | "beige";

export const themes: { id: ThemeId; label: string; swatch: string; className: string }[] = [
  { id: "orange", label: "Tema Laranja", swatch: "oklch(0.74 0.19 50)", className: "" },
  { id: "purple", label: "Tema Roxo", swatch: "oklch(0.65 0.25 295)", className: "theme-purple" },
  { id: "cyan", label: "Tema Ciano", swatch: "oklch(0.78 0.15 200)", className: "theme-cyan" },
  { id: "emerald", label: "Tema Esmeralda", swatch: "oklch(0.72 0.18 155)", className: "theme-emerald" },
  { id: "slate", label: "Tema Cinzento", swatch: "oklch(0.55 0.03 250)", className: "theme-slate" },
  { id: "slate-orange", label: "Tema Cinzento Laranja", swatch: "oklch(0.74 0.19 50)", className: "theme-slate-orange" },
  { id: "beige", label: "Tema Suave (claro)", swatch: "oklch(0.85 0.08 65)", className: "theme-beige" },
];

const STORAGE_KEY = "app-theme";

type Ctx = { theme: ThemeId; setTheme: (t: ThemeId) => void };
const ThemeContext = createContext<Ctx | null>(null);

function applyTheme(t: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  themes.forEach((th) => th.className && root.classList.remove(th.className));
  const cls = themes.find((th) => th.id === t)?.className;
  if (cls) root.classList.add(cls);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("orange");

  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) as ThemeId | null;
    const initial = stored && themes.some((t) => t.id === stored) ? stored : "orange";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    applyTheme(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}