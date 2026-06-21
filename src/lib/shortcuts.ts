// Centralized keyboard shortcuts (Alt + key) for app navigation.
// Alt is used (not Ctrl) because Ctrl+1..9 are reserved by browsers for tab switching.
export interface Shortcut {
  combo: string;       // human-readable label
  key: string;         // e.key value (lowercased)
  to: string;          // route path
  label: string;       // page name
}

export const SHORTCUTS: Shortcut[] = [
  { combo: "Alt + D", key: "d", to: "/dashboard", label: "Dashboard" },
  { combo: "Alt + N", key: "n", to: "/notas", label: "Notas" },
  { combo: "Alt + R", key: "r", to: "/drive", label: "Drive" },
  { combo: "Alt + L", key: "l", to: "/links", label: "Links" },
  { combo: "Alt + T", key: "t", to: "/tarefas", label: "Tarefas" },
  { combo: "Alt + F", key: "f", to: "/financas", label: "Finanças" },
  { combo: "Alt + V", key: "v", to: "/viagens", label: "Travel Planner" },
  { combo: "Alt + C", key: "c", to: "/cronometro", label: "Cronómetro" },
  { combo: "Alt + M", key: "m", to: "/mundial", label: "Mundial" },
  { combo: "Alt + W", key: "w", to: "/noticias", label: "Notícias" },
  { combo: "Alt + E", key: "e", to: "/email", label: "Email" },
  { combo: "Alt + P", key: "p", to: "/apps", label: "Apps" },
  { combo: "Alt + I", key: "i", to: "/ai", label: "Nuno AI" },
  { combo: "Alt + A", key: "a", to: "/atalhos", label: "Atalhos" },
  { combo: "Alt + Y", key: "y", to: "/activity", label: "Activity" },
];
