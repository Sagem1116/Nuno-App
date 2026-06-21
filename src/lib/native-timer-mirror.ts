// Mirror the active timer to Capacitor Preferences so the native home-screen
// widget (Android AppWidget / iOS WidgetKit) can read it. On web this is a no-op
// fallback to localStorage.
import { useEffect } from "react";

type Payload =
  | { active: false }
  | {
      active: true;
      sessionId: string;
      categoryName: string;
      categoryColor: string;
      note: string;
      startedAt: number;
      reminders: number[];
    };

export function useNativeTimerMirror(payload: Payload) {
  useEffect(() => {
    const value = payload.active ? JSON.stringify(payload) : "";
    (async () => {
      try {
        const mod = await import("@capacitor/preferences").catch(() => null);
        if (mod?.Preferences) {
          if (value) await mod.Preferences.set({ key: "active_timer", value });
          else await mod.Preferences.remove({ key: "active_timer" });
          return;
        }
      } catch {}
      try {
        if (value) window.localStorage.setItem("active_timer", value);
        else window.localStorage.removeItem("active_timer");
      } catch {}
    })();
  }, [JSON.stringify(payload)]);
}
