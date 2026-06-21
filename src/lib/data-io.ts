import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function pickJsonFile(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve(JSON.parse(text));
      } catch (e) {
        toast.error("Ficheiro JSON inválido");
        resolve(null);
      }
    };
    input.click();
  });
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export type Table = "notes" | "links" | "transactions" | "tasks" | "timer_categories" | "timer_sessions";

const ALLOWED_FIELDS: Record<Table, string[]> = {
  notes: ["title", "content", "tags", "is_favorite"],
  links: ["title", "url", "description", "tags", "is_favorite"],
  transactions: ["amount", "type", "category", "description", "occurred_at"],
  tasks: ["title", "description", "priority", "due_date", "status"],
  timer_categories: ["name", "color"],
  timer_sessions: ["category_id", "note", "started_at", "ended_at", "reminders_minutes"],
};

export async function exportTable(table: Table, opts?: { silent?: boolean }) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) { if (!opts?.silent) toast.error(error.message); return null; }
  const filename = `${table}-${stamp()}.json`;
  downloadJson(filename, { version: 1, table, exported_at: new Date().toISOString(), items: data ?? [] });
  if (!opts?.silent) toast.success(`${(data ?? []).length} item(s) exportados`);
  recordVersion(table, filename, (data ?? []).length);
  return filename;
}

export async function importTable(table: Table, userId: string) {
  const parsed = await pickJsonFile();
  if (!parsed) return;
  const items: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.items)
      ? (parsed as any).items
      : [];
  if (!items.length) { toast.error("Sem itens para importar"); return; }
  const allowed = ALLOWED_FIELDS[table];
  const rows = items.map((it) => {
    const row: Record<string, unknown> = { user_id: userId };
    for (const k of allowed) if (it[k] !== undefined && it[k] !== null) row[k] = it[k];
    return row;
  }).filter((r) => allowed.some((k) => r[k] !== undefined));
  if (!rows.length) { toast.error("Estrutura JSON não reconhecida"); return; }
  const { error } = await supabase.from(table).insert(rows as any);
  if (error) { toast.error(error.message); return; }
  toast.success(`${rows.length} item(s) importados`);
}

export function exportData(filename: string, data: unknown) {
  downloadJson(`${filename}-${stamp()}.json`, data);
}

// ---------- Auto-export (weekly) ----------

const AUTO_KEY = "autoexport:v1";
const HIST_KEY = "autoexport:history:v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type AutoMap = Record<string, { enabled: boolean; last: number }>;
type HistEntry = { table: Table; filename: string; at: number; count: number };

function readMap(): AutoMap {
  try { return JSON.parse(localStorage.getItem(AUTO_KEY) || "{}"); } catch { return {}; }
}
function writeMap(m: AutoMap) { localStorage.setItem(AUTO_KEY, JSON.stringify(m)); }
function readHist(): HistEntry[] {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { return []; }
}
function writeHist(h: HistEntry[]) { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 50))); }

export function getAutoExport(table: Table): { enabled: boolean; last: number } {
  return readMap()[table] ?? { enabled: false, last: 0 };
}

export function setAutoExport(table: Table, enabled: boolean) {
  const m = readMap();
  m[table] = { enabled, last: m[table]?.last ?? 0 };
  writeMap(m);
}

function recordVersion(table: Table, filename: string, count: number) {
  const h = readHist();
  h.unshift({ table: table as Table, filename, at: Date.now(), count });
  writeHist(h);
  const m = readMap();
  if (m[table]) { m[table].last = Date.now(); writeMap(m); }
}

export function getVersionHistory(table: Table): HistEntry[] {
  return readHist().filter((e) => e.table === table);
}

export async function runWeeklyAutoExports() {
  const m = readMap();
  const now = Date.now();
  for (const [table, cfg] of Object.entries(m)) {
    if (!cfg.enabled) continue;
    if (now - (cfg.last || 0) < WEEK_MS) continue;
    try {
      await exportTable(table as Table, { silent: true });
      toast.success(`Auto-exportação semanal: ${table}`);
    } catch (e) {
      console.warn("auto-export failed", table, e);
    }
  }
}
