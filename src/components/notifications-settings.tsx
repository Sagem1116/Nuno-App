import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Send, Smartphone, Loader2 } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  getPermissionState,
  loadSettings,
  notify,
  requestPermission,
  saveSettings,
  type NotificationPermissionState,
  type NotificationSettings,
} from "@/lib/notifications";
import {
  disableMobilePush,
  enableMobilePush,
  getRegisteredToken,
  isPushSupported,
  syncPreferencesToServer,
} from "@/lib/push";

export function NotificationsSettings() {
  const [perm, setPerm] = useState<NotificationPermissionState>("default");
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    setPerm(getPermissionState());
    setSettings(loadSettings());
    (async () => {
      const sup = await isPushSupported();
      setPushSupported(sup);
      if (sup) setPushActive(!!(await getRegisteredToken()));
    })();
  }, []);

  const update = (patch: Partial<NotificationSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    // Best-effort sync to server so push-tick respects user prefs.
    void syncPreferencesToServer(next);
  };

  const askPermission = async () => {
    const res = await requestPermission();
    setPerm(res);
    if (res === "granted") update({ enabled: true });
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushActive) {
        await disableMobilePush();
        setPushActive(false);
        setPushMsg("Notificações no telemóvel desativadas.");
      } else {
        const res = await enableMobilePush();
        if (res.ok) {
          setPushActive(true);
          setPushMsg("Pronto! Vais receber notificações no telemóvel.");
        } else {
          setPushMsg(res.reason || "Falhou.");
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const unsupported = perm === "unsupported";

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium">Notificações desktop</h3>
          <p className="text-xs text-muted-foreground">
            Recebe avisos no PC quando a Nuno App está aberta (ou minimizada após instalar).
          </p>
        </div>
      </div>

      {unsupported && (
        <p className="text-xs text-amber-500/90 flex items-center gap-2">
          <BellOff className="h-3.5 w-3.5" /> Este browser não suporta notificações.
        </p>
      )}

      {!unsupported && perm !== "granted" && (
        <button
          type="button"
          onClick={askPermission}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {perm === "denied" ? "Permissão bloqueada — ativa nas definições do browser" : "Ativar notificações"}
        </button>
      )}

      {!unsupported && perm === "granted" && (
        <>
          <div className="flex items-center gap-2 text-xs text-emerald-500">
            <Check className="h-3.5 w-3.5" /> Notificações ativas neste dispositivo
          </div>

          <Toggle
            label="Mestre — receber notificações"
            hint="Desliga tudo de uma vez."
            checked={settings.enabled}
            onChange={(v) => update({ enabled: v })}
          />

          <Toggle
            label="Só prioridade alta"
            hint="Ignora tarefas de prioridade baixa e média."
            checked={settings.priorityHighOnly}
            onChange={(v) => update({ priorityHighOnly: v })}
          />

          <Toggle
            label="Tarefas com prazo a chegar"
            hint="Aviso uma vez por tarefa."
            checked={settings.tasksEnabled}
            onChange={(v) => update({ tasksEnabled: v })}
          />
          <Row label="Antecedência" disabled={!settings.tasksEnabled}>
            <select
              value={settings.tasksWindowHours}
              onChange={(e) => update({ tasksWindowHours: Number(e.target.value) })}
              className="text-xs rounded-md bg-input/60 border border-border/60 px-2 py-1"
              disabled={!settings.tasksEnabled}
            >
              <option value={1}>1 hora antes</option>
              <option value={24}>1 dia antes</option>
              <option value={72}>3 dias antes</option>
            </select>
          </Row>

          <Toggle
            label="Avisar ao começar tarefa"
            hint="Quando bate a hora de início definida."
            checked={settings.taskStartEnabled}
            onChange={(v) => update({ taskStartEnabled: v })}
          />
          <Row label="Pré-aviso antes de começar" disabled={!settings.taskStartEnabled}>
            <select
              value={settings.startLeadMinutes}
              onChange={(e) => update({ startLeadMinutes: Number(e.target.value) })}
              className="text-xs rounded-md bg-input/60 border border-border/60 px-2 py-1"
              disabled={!settings.taskStartEnabled}
            >
              <option value={0}>No momento</option>
              <option value={5}>5 minutos antes</option>
              <option value={10}>10 minutos antes</option>
              <option value={15}>15 minutos antes</option>
            </select>
          </Row>

          <Toggle
            label="Avisar ao terminar tarefa"
            hint="Quando bate a hora de fim definida."
            checked={settings.taskEndEnabled}
            onChange={(v) => update({ taskEndEnabled: v })}
          />

          <Toggle
            label="Resumo diário"
            hint="Uma notificação por dia."
            checked={settings.dailyEnabled}
            onChange={(v) => update({ dailyEnabled: v })}
          />
          <Row label="Hora" disabled={!settings.dailyEnabled}>
            <select
              value={settings.dailyHour}
              onChange={(e) => update({ dailyHour: Number(e.target.value) })}
              className="text-xs rounded-md bg-input/60 border border-border/60 px-2 py-1"
              disabled={!settings.dailyEnabled}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </Row>

          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
            Dica: clica numa notificação para abrir as tarefas — a app oferece-te adiar 10 min.
          </p>

          <button
            type="button"
            onClick={() =>
              notify("Notificação de teste", {
                body: "Está tudo a funcionar 🎉",
                tag: "test",
                url: "/dashboard",
              })
            }
            className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-input/60 hover:bg-input transition-colors"
          >
            <Send className="h-3.5 w-3.5" /> Enviar notificação de teste
          </button>
        </>
      )}


      <div className="pt-4 mt-2 border-t border-border/40 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center">
            <Smartphone className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium">Notificações no telemóvel</h3>
            <p className="text-xs text-muted-foreground">
              Push via FCM — recebes avisos mesmo com a app fechada. iOS: instala a app (Adicionar ao Ecrã Principal) primeiro.
            </p>
          </div>
        </div>

        {!pushSupported && (
          <p className="text-xs text-amber-500/90 flex items-center gap-2">
            <BellOff className="h-3.5 w-3.5" /> Este browser/dispositivo não suporta push web.
          </p>
        )}

        {pushSupported && (
          <button
            type="button"
            onClick={togglePush}
            disabled={pushBusy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {pushActive ? "Desativar push no telemóvel" : "Ativar push no telemóvel"}
          </button>
        )}

        {pushActive && (
          <div className="flex items-center gap-2 text-xs text-emerald-500">
            <Check className="h-3.5 w-3.5" /> Push ativo neste dispositivo
          </div>
        )}

        {pushMsg && <p className="text-xs text-muted-foreground">{pushMsg}</p>}
      </div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 border-t border-border/40">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}

function Row({ label, disabled, children }: { label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className={["flex items-center justify-between gap-3 pl-1", disabled ? "opacity-50" : ""].join(" ")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
