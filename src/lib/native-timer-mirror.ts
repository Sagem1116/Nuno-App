// Mirror the active timer to Capacitor Preferences so the native home-screen
// widget (Android AppWidget / iOS WidgetKit) can read it. On web this is a no-op
// fallback to localStorage.
import { useEffect } from "react";

export type ActiveTimerPayload =
  | { active: false }
  | {
      active: true;
      sessionId: string;
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      note: string;
      startedAt: number;     // ms epoch of original start
      pausedAt: number | null; // ms epoch when paused, or null
      pausedMs: number;      // accumulated paused ms before current pause
      reminders: number[];
    };

export function useNativeTimerMirror(payload: ActiveTimerPayload) {
  useEffect(() => {
    const value = payload.active ? JSON.stringify(payload) : "";
    try {
      if (value) window.localStorage.setItem("active_timer", value);
      else window.localStorage.removeItem("active_timer");
      // Notify same-tab listeners (storage event only fires cross-tab).
      window.dispatchEvent(new Event("active-timer:change"));
    } catch {}
    (async () => {
      try {
        const mod = await import("@capacitor/preferences").catch(() => null);
        if (mod?.Preferences) {
          if (value) await mod.Preferences.set({ key: "active_timer", value });
          else await mod.Preferences.remove({ key: "active_timer" });
        }
      } catch {}
    })();
  }, [JSON.stringify(payload)]);
}
