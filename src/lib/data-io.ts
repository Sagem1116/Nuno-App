import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Bump SCHEMA_VERSION whenever the JSON envelope or item shape changes in a
// non-backward-compatible way. Importers warn when reading a higher version.
export const APP_NAME = "nuno-stuff";
export const SCHEMA_VERSION = 1;

export type Envelope<T extends object = object> = {
  app: typeof APP_NAME;
  schema_version: number;
  table: string;
  exported_at: string;
} & T;

export function buildEnvelope<T extends object>(table: string, payload: T): Envelope<T> {
  return {
    app: APP_NAME,
    schema_version: SCHEMA_VERSION,
    table,
    exported_at: new Date().toISOString(),
    ...payload,
  };
}

/**
 * Validates an imported JSON envelope. Returns true if safe to proceed.
 * - Missing schema_version → treated as legacy (version 1) with a soft notice.
 * - Higher schema_version → blocks import with an error toast.
 * - Mismatched table (when expectedTable provided) → soft warning, still proceeds.
 */
export function validateEnvelope(parsed: any, expectedTable?: string): boolean {
  if (!parsed || typeof parsed !== "object") return true;
  const ver = Number((parsed as any).schema_version ?? (parsed as any).version ?? 1);
  if (!Number.isFinite(ver)) {
    toast.error("Versão de schema inválida no ficheiro");
    return false;
  }
  if (ver > SCHEMA_VERSION) {
    toast.error(`Ficheiro com schema mais recente (v${ver}). Atualiza a app para importar.`);
    return false;
  }
  if (ver < SCHEMA_VERSION) {
    toast.info(`A importar schema antigo (v${ver}). A converter para v${SCHEMA_VERSION}.`);
  }
  if (expectedTable && (parsed as any).table && (parsed as any).table !== expectedTable) {
    toast.warning(`O ficheiro indica "${(parsed as any).table}" mas esperava "${expectedTable}".`);
  }
  return true;
}

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

export type Table =
  | "notes"
  | "links"
  | "transactions"
  | "tasks"
  | "timer_categories"
  | "timer_sessions"
  | "activity_setup";

const ALLOWED_FIELDS: Record<Table, string[]> = {
  notes: ["title", "content", "tags", "is_favorite"],
  links: ["title", "url", "description", "tags", "is_favorite"],
  transactions: ["amount", "type", "category", "description", "occurred_at"],
  tasks: ["title", "description", "priority", "due_date", "status"],
  timer_categories: ["name", "color", "parent_id"],
  timer_sessions: ["category_id", "note", "started_at", "ended_at", "reminders_minutes", "paused_at", "paused_ms"],
  activity_setup: [],
};

export async function exportTable(table: Table, opts?: { silent?: boolean }) {
  if (table === "activity_setup") return exportActivitySetup(opts);
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) { if (!opts?.silent) toast.error(error.message); return null; }
  const filename = `${table}-${stamp()}.json`;
  downloadJson(filename, buildEnvelope(table, { items: data ?? [] }));
  if (!opts?.silent) toast.success(`${(data ?? []).length} item(s) exportados`);
  recordVersion(table, filename, (data ?? []).length);
  return filename;
}

export async function importTable(table: Table, userId: string) {
  const parsed = await pickJsonFile();
  if (!parsed) return;
  if (!validateEnvelope(parsed, table)) return;
  if (table === "activity_setup") {
    await importActivitySetup(userId, parsed);
    return;
  }
  const items: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.items)
      ? (parsed as any).items
      : [];
  if (!items.length) { toast.error("Sem itens para importar"); return; }
  if (table === "timer_categories") {
    const result = await importHierarchicalCategories("timer_categories", items, userId);
    toast.success(`${result.inserted} categoria(s) importadas${result.reused ? ` · ${result.reused} já existiam` : ""}`);
    if (result.skipped) toast.warning(`${result.skipped} subcategoria(s) ignoradas por falta da categoria-mãe`);
    return;
  }
  const allowed = ALLOWED_FIELDS[table];
  const rows = items.map((it) => {
    const row: Record<string, unknown> = { user_id: userId };
    for (const k of allowed) if (it[k] !== undefined && it[k] !== null) row[k] = it[k];
    return row;
  }).filter((r) => allowed.some((k) => r[k] !== undefined));
  if (!rows.length) { toast.error("Estrutura JSON não reconhecida"); return; }
  if (table === "timer_sessions") {
    const result = await replaceMatchingTimerSessions(rows, userId);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(`${result.inserted} sessão(ões) importada(s)${result.replaced ? ` · ${result.replaced} substituída(s)` : ""}`);
    return;
  }
  const { error } = await supabase.from(table).insert(rows as any);
  if (error) { toast.error(error.message); return; }
  toast.success(`${rows.length} item(s) importados`);
}

type TimerSessionImportResult =
  | { ok: true; inserted: number; replaced: number }
  | { ok: false; error: string; inserted: number; replaced: number };

async function replaceMatchingTimerSessions(rows: Record<string, unknown>[], userId: string): Promise<TimerSessionImportResult> {
  const validRows = rows.filter((s) => s.started_at && s.ended_at);
  if (!validRows.length) return { ok: true, inserted: 0, replaced: 0 };
  const timestampKey = (value: unknown) => {
    const ms = Date.parse(String(value ?? ""));
    return Number.isFinite(ms) ? String(Math.round(ms / 1000)) : String(value ?? "").trim();
  };
  const durationKey = (s: Record<string, unknown>) => {
    const started = Date.parse(String(s.started_at ?? ""));
    const ended = Date.parse(String(s.ended_at ?? ""));
    const paused = Number(s.paused_ms ?? 0) || 0;
    return Number.isFinite(started) && Number.isFinite(ended)
      ? String(Math.max(0, Math.round((ended - started - paused) / 1000)))
      : "";
  };
  const sessionKey = (s: Record<string, unknown>) => `${timestampKey(s.started_at)}|${timestampKey(s.ended_at)}|${durationKey(s)}`;
  const uniqueRows = Array.from(new Map(validRows.map((r) => [sessionKey(r), r])).values());
  const { data: existing, error: existingError } = await supabase
    .from("timer_sessions")
    .select("id,started_at,ended_at,paused_ms")
    .eq("user_id", userId);
  if (existingError) return { ok: false, error: existingError.message, inserted: 0, replaced: 0 };
  const importedKeys = new Set(uniqueRows.map(sessionKey));
  const toDelete = (existing ?? [])
    .filter((e) => importedKeys.has(sessionKey(e as Record<string, unknown>)))
    .map((e) => e.id);
  if (toDelete.length) {
    const { error } = await supabase.from("timer_sessions").delete().in("id", toDelete);
    if (error) return { ok: false, error: error.message, inserted: 0, replaced: 0 };
  }
  const { error } = await supabase.from("timer_sessions").insert(uniqueRows as any);
  if (error) return { ok: false, error: error.message, inserted: 0, replaced: toDelete.length };
  return { ok: true, inserted: uniqueRows.length, replaced: toDelete.length };
}

export async function importHierarchicalCategories(
  table: "timer_categories" | "activity_categories",
  items: any[],
  userId: string,
) {
  const source = items.filter((c) => String(c?.name ?? "").trim());
  const { data: existingData, error: existingError } = await (supabase as any)
    .from(table)
    .select("id,name,color,parent_id");
  if (existingError) throw existingError;

  const existing = (existingData ?? []) as Array<{ id: string; name: string; color: string; parent_id: string | null }>;
  const idMap = new Map<string, string>();
  const parentByName = new Map<string, string>();
  const subByParentAndName = new Map<string, string>();
  let inserted = 0;
  let reused = 0;
  let skipped = 0;

  const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
  for (const c of existing) {
    if (c.parent_id) subByParentAndName.set(`${c.parent_id}::${key(c.name)}`, c.id);
    else parentByName.set(key(c.name), c.id);
  }

  const parents = source.filter((c) => !c.parent_id);
  const children = source.filter((c) => c.parent_id);

  for (const c of parents) {
    const name = String(c.name).trim();
    const oldId = String(c.id ?? "");
    let newId = parentByName.get(key(name));
    if (newId) {
      reused += 1;
    } else {
      const { data, error } = await (supabase as any)
        .from(table)
        .insert({ user_id: userId, name, color: c.color ?? "#888", parent_id: null })
        .select("id")
        .single();
      if (error) throw error;
      newId = String(data?.id ?? "");
      if (!newId) throw new Error("Não foi possível criar a categoria");
      parentByName.set(key(name), newId);
      inserted += 1;
    }
    if (oldId && newId) idMap.set(oldId, newId);
  }

  for (const c of children) {
    const name = String(c.name).trim();
    const oldId = String(c.id ?? "");
    const oldParentId = String(c.parent_id ?? "");
    const parentNewId = idMap.get(oldParentId);
    if (!parentNewId) {
      skipped += 1;
      continue;
    }
    const childKey = `${parentNewId}::${key(name)}`;
    let newId = subByParentAndName.get(childKey);
    if (newId) {
      reused += 1;
    } else {
      const { data, error } = await (supabase as any)
        .from(table)
        .insert({ user_id: userId, name, color: c.color ?? "#888", parent_id: parentNewId })
        .select("id")
        .single();
      if (error) throw error;
      newId = String(data?.id ?? "");
      if (!newId) throw new Error("Não foi possível criar a subcategoria");
      subByParentAndName.set(childKey, newId);
      inserted += 1;
    }
    if (oldId && newId) idMap.set(oldId, newId);
  }

  return { idMap, inserted, reused, skipped };
}

async function exportActivitySetup(opts?: { silent?: boolean }) {
  const [{ data: categories, error: cErr }, { data: projects, error: pErr }, { data: rules, error: rErr }] = await Promise.all([
    (supabase as any).from("activity_categories").select("*").order("created_at", { ascending: true }),
    (supabase as any).from("activity_projects").select("*").order("created_at", { ascending: true }),
    (supabase as any).from("activity_rules").select("*").order("priority", { ascending: false }),
  ]);
  const error = cErr || pErr || rErr;
  if (error) { if (!opts?.silent) toast.error(error.message); return null; }
  const filename = `activity-setup-${stamp()}.json`;
  downloadJson(filename, buildEnvelope("activity_setup", {
    categories: categories ?? [],
    projects: projects ?? [],
    rules: rules ?? [],
  }));
  const count = (categories ?? []).length + (projects ?? []).length + (rules ?? []).length;
  if (!opts?.silent) toast.success(`${count} item(s) de Activity exportados`);
  recordVersion("activity_setup", filename, count);
  return filename;
}

async function importActivitySetup(userId: string, parsed: any) {
  if (!validateEnvelope(parsed, "activity_setup")) return;
  const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
  const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
  if (!categories.length && !projects.length && !rules.length) {
    toast.error("JSON de Activity sem categorias, projetos ou regras");
    return;
  }

  try {
    const catResult = categories.length
      ? await importHierarchicalCategories("activity_categories", categories, userId)
      : { idMap: new Map<string, string>(), inserted: 0, reused: 0, skipped: 0 };

    const { data: existingProjects, error: pErr } = await (supabase as any)
      .from("activity_projects")
      .select("id,name,color");
    if (pErr) throw pErr;
    const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
    const projectByName = new Map<string, string>((existingProjects ?? []).map((p: any) => [key(p.name), p.id]));
    const projectIdMap = new Map<string, string>();
    let projectsInserted = 0;
    let projectsReused = 0;
    for (const p of projects.filter((p: any) => String(p?.name ?? "").trim())) {
      const name = String(p.name).trim();
      let id = projectByName.get(key(name));
      if (id) {
        projectsReused += 1;
      } else {
        const { data, error } = await (supabase as any)
          .from("activity_projects")
          .insert({ user_id: userId, name, color: p.color ?? "#10b981" })
          .select("id")
          .single();
        if (error) throw error;
        id = String(data?.id ?? "");
        if (!id) throw new Error("Não foi possível criar o projeto");
        projectByName.set(key(name), id);
        projectsInserted += 1;
      }
      if (p.id && id) projectIdMap.set(String(p.id), id);
    }

    const { data: existingRules, error: rErr } = await (supabase as any)
      .from("activity_rules")
      .select("rule_type,pattern,category_id,project_id");
    if (rErr) throw rErr;
    const ruleKey = (r: any) => `${r.rule_type}::${key(r.pattern)}::${r.category_id ?? ""}::${r.project_id ?? ""}`;
    const existingRuleKeys = new Set((existingRules ?? []).map(ruleKey));
    const rows = rules
      .filter((r: any) => r?.rule_type && String(r?.pattern ?? "").trim())
      .map((r: any) => ({
        user_id: userId,
        rule_type: r.rule_type,
        pattern: String(r.pattern).trim(),
        category_id: r.category_id ? catResult.idMap.get(String(r.category_id)) ?? null : null,
        project_id: r.project_id ? projectIdMap.get(String(r.project_id)) ?? null : null,
        priority: Number(r.priority) || (r.rule_type === "app_name" ? 10 : 5),
      }))
      .filter((r: any) => !existingRuleKeys.has(ruleKey(r)));
    if (rows.length) {
      const { error } = await (supabase as any).from("activity_rules").insert(rows);
      if (error) throw error;
    }

    toast.success(
      `Activity importado: ${catResult.inserted} categoria(s), ${projectsInserted} projeto(s), ${rows.length} regra(s)`,
    );
    if (catResult.reused || projectsReused) toast.info(`${catResult.reused + projectsReused} item(s) já existiam`);
    if (catResult.skipped) toast.warning(`${catResult.skipped} subcategoria(s) ignoradas por falta da categoria-mãe`);
  } catch (e: any) {
    toast.error(e.message ?? "Erro ao importar Activity");
  }
}

export function exportData(filename: string, data: unknown) {
  // Wrap arbitrary payloads in a versioned envelope. If the caller already
  // provided one (has app + schema_version), keep it as-is.
  const isEnvelope = data && typeof data === "object"
    && (data as any).app === APP_NAME
    && typeof (data as any).schema_version === "number";
  const payload = isEnvelope
    ? data
    : buildEnvelope(filename, (data && typeof data === "object" ? (data as object) : { value: data }));
  downloadJson(`${filename}-${stamp()}.json`, payload);
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
  await runGlobalAutoExport();
}

// ---------- Global schedule (all tables) ----------

const SCHED_KEY = "autoexport:schedule:v1";

export type Frequency = "daily" | "weekly" | "monthly";
export type GlobalSchedule = {
  enabled: boolean;
  frequency: Frequency;
  dayOfWeek: number; // 0=Sun..6=Sat
  dayOfMonth: number; // 1..28
  hour: number; // 0..23
  last: number;
};

const DEFAULT_SCHED: GlobalSchedule = {
  enabled: false,
  frequency: "weekly",
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 9,
  last: 0,
};

export function getGlobalSchedule(): GlobalSchedule {
  try {
    const raw = localStorage.getItem(SCHED_KEY);
    if (!raw) return { ...DEFAULT_SCHED };
    return { ...DEFAULT_SCHED, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_SCHED }; }
}

export function setGlobalSchedule(patch: Partial<GlobalSchedule>) {
  const cur = getGlobalSchedule();
  const next = { ...cur, ...patch };
  localStorage.setItem(SCHED_KEY, JSON.stringify(next));
  return next;
}

function isDue(s: GlobalSchedule, now: Date): boolean {
  if (!s.enabled) return false;
  if (now.getHours() < s.hour) return false;
  const last = s.last ? new Date(s.last) : null;
  const sameDay = last
    && last.getFullYear() === now.getFullYear()
    && last.getMonth() === now.getMonth()
    && last.getDate() === now.getDate();
  if (sameDay) return false;
  if (s.frequency === "daily") return true;
  if (s.frequency === "weekly") return now.getDay() === s.dayOfWeek;
  if (s.frequency === "monthly") return now.getDate() === s.dayOfMonth;
  return false;
}

const ALL_TABLES: Table[] = ["notes", "links", "tasks", "transactions", "timer_categories", "timer_sessions", "activity_setup"];

async function runGlobalAutoExport() {
  const sched = getGlobalSchedule();
  if (!isDue(sched, new Date())) return;
  try {
    for (const t of ALL_TABLES) {
      await exportTable(t, { silent: true });
    }
    setGlobalSchedule({ last: Date.now() });
    toast.success("Auto-exportação programada concluída");
  } catch (e) {
    console.warn("global auto-export failed", e);
  }
}
