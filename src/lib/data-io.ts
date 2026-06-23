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

export type JsonFilePick = { parsed: unknown; filename: string } | null;

export function pickJsonFileWithName(): Promise<JsonFilePick> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve({ parsed: JSON.parse(text), filename: file.name });
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
  | "activity_setup"
  | "trips";

export type ImportTable = Table | "activity_logs";


const ALLOWED_FIELDS: Record<Table, string[]> = {
  notes: ["title", "content", "tags", "is_favorite"],
  links: ["title", "url", "description", "tags", "is_favorite"],
  transactions: ["amount", "type", "category", "description", "occurred_at"],
  tasks: ["title", "description", "priority", "due_date", "status"],
  timer_categories: ["name", "color", "parent_id"],
  timer_sessions: ["category_id", "note", "started_at", "ended_at", "reminders_minutes", "paused_at", "paused_ms"],
  activity_setup: [],
  trips: [],
};

export async function exportTable(table: Table, opts?: { silent?: boolean }) {
  if (table === "activity_setup") return exportActivitySetup(opts);
  if (table === "trips") return exportAllTrips(opts);
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
  if (table === "trips") {
    await importTripsFromParsed(userId, parsed);
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
  const { rows: toInsert, skipped } = await filterExistingRows(table, rows, userId);
  if (!toInsert.length) {
    toast.info(`Nada para importar — ${skipped} item(s) já existiam`);
    return;
  }
  const { error } = await supabase.from(table).insert(toInsert as any);
  if (error) { toast.error(error.message); return; }
  toast.success(`${toInsert.length} item(s) importados${skipped ? ` · ${skipped} já existiam` : ""}`);
}

// ---------- Deduplication on import ----------
//
// To avoid creating duplicates when re-importing a backup, each table defines a
// stable "natural key" from a small subset of fields. Rows whose key matches an
// existing row for the same user are skipped on insert.
type DedupKeyFn = (row: Record<string, unknown>) => string;
const _norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const _ts = (v: unknown) => {
  const ms = Date.parse(String(v ?? ""));
  return Number.isFinite(ms) ? String(Math.round(ms / 60000)) : _norm(v);
};
const DEDUP_KEYS: Partial<Record<Table, { fields: string[]; key: DedupKeyFn }>> = {
  notes:        { fields: ["title", "content"],                                   key: (r) => `${_norm(r.title)}|${_norm(r.content)}` },
  links:        { fields: ["url", "title"],                                       key: (r) => `${_norm(r.url)}|${_norm(r.title)}` },
  transactions: { fields: ["amount", "type", "category", "occurred_at", "description"],
                  key: (r) => `${_norm(r.amount)}|${_norm(r.type)}|${_norm(r.category)}|${_ts(r.occurred_at)}|${_norm(r.description)}` },
  tasks:        { fields: ["title", "due_date", "status"],                        key: (r) => `${_norm(r.title)}|${_ts(r.due_date)}|${_norm(r.status)}` },
};

async function filterExistingRows(
  table: Table,
  rows: Record<string, unknown>[],
  userId: string,
): Promise<{ rows: Record<string, unknown>[]; skipped: number }> {
  const cfg = DEDUP_KEYS[table];
  if (!cfg) return { rows, skipped: 0 };
  const { data: existing, error } = await (supabase as any)
    .from(table)
    .select(cfg.fields.join(","))
    .eq("user_id", userId);
  if (error) return { rows, skipped: 0 };
  const seen = new Set<string>((existing ?? []).map((r: any) => cfg.key(r)));
  const out: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of rows) {
    const k = cfg.key(r);
    if (seen.has(k)) { skipped += 1; continue; }
    seen.add(k);
    out.push(r);
  }
  return { rows: out, skipped };
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
  const replaced = (existing ?? [])
    .filter((e) => importedKeys.has(sessionKey(e as Record<string, unknown>)))
    .length;
  const { error } = await supabase
    .from("timer_sessions")
    .upsert(uniqueRows as any, { onConflict: "user_id,started_at,ended_at" });
  if (error) return { ok: false, error: error.message, inserted: 0, replaced };
  return { ok: true, inserted: uniqueRows.length, replaced };
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

// Catch-up aware: fires whenever enough time has passed since `last` AND we're
// past the configured hour today. This means missing the exact day/hour does
// NOT skip the whole cycle — the export still runs next time the app opens.
function isDue(s: GlobalSchedule, now: Date): boolean {
  if (!s.enabled) return false;
  if (now.getHours() < s.hour) return false;
  const DAY = 24 * 60 * 60 * 1000;
  const interval =
    s.frequency === "daily" ? DAY :
    s.frequency === "weekly" ? 7 * DAY :
    28 * DAY;
  if (!s.last) return true;
  return now.getTime() - s.last >= interval;
}

export function getNextAutoExportAt(s: GlobalSchedule = getGlobalSchedule()): number | null {
  if (!s.enabled) return null;
  const DAY = 24 * 60 * 60 * 1000;
  const interval =
    s.frequency === "daily" ? DAY :
    s.frequency === "weekly" ? 7 * DAY :
    28 * DAY;
  const base = s.last || Date.now();
  const next = new Date(base + interval);
  next.setHours(s.hour, 0, 0, 0);
  if (!s.last) {
    const today = new Date();
    today.setHours(s.hour, 0, 0, 0);
    return today.getTime() > Date.now() ? today.getTime() : today.getTime() + interval;
  }
  return next.getTime();
}

const RESULT_KEY = "autoexport:lastresult:v1";
export type AutoExportResult = { ok: boolean; at: number; filename?: string; error?: string; count?: number };
export function getLastAutoExportResult(): AutoExportResult | null {
  try { return JSON.parse(localStorage.getItem(RESULT_KEY) || "null"); } catch { return null; }
}
function setLastAutoExportResult(r: AutoExportResult) {
  try { localStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch {}
}

// Builds a single combined JSON snapshot of every table.
export async function exportAllCombined(opts?: { silent?: boolean }): Promise<string | null> {
  const sections: Record<string, unknown> = {};
  let total = 0;
  try {
    const [n, l, ta, tr, tc, ts, ac, ap, ar, trips] = await Promise.all([
      supabase.from("notes").select("*").order("created_at", { ascending: false }),
      supabase.from("links").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("timer_categories").select("*").order("created_at", { ascending: true }),
      supabase.from("timer_sessions").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("activity_categories").select("*").order("created_at", { ascending: true }),
      (supabase as any).from("activity_projects").select("*").order("created_at", { ascending: true }),
      (supabase as any).from("activity_rules").select("*").order("priority", { ascending: false }),
      collectAllTrips(),
    ]);
    const firstErr = [n, l, ta, tr, tc, ts, ac, ap, ar].find((r) => r.error)?.error;
    if (firstErr) {
      if (!opts?.silent) toast.error(firstErr.message);
      setLastAutoExportResult({ ok: false, at: Date.now(), error: firstErr.message });
      return null;
    }
    sections.notes = n.data ?? [];
    sections.links = l.data ?? [];
    sections.tasks = ta.data ?? [];
    sections.transactions = tr.data ?? [];
    sections.timer_categories = tc.data ?? [];
    sections.timer_sessions = ts.data ?? [];
    sections.activity_setup = {
      categories: ac.data ?? [],
      projects: ap.data ?? [],
      rules: ar.data ?? [],
    };
    sections.trips = trips;
    total =
      (n.data?.length ?? 0) + (l.data?.length ?? 0) + (ta.data?.length ?? 0) +
      (tr.data?.length ?? 0) + (tc.data?.length ?? 0) + (ts.data?.length ?? 0) +
      (ac.data?.length ?? 0) + (ap.data?.length ?? 0) + (ar.data?.length ?? 0) +
      (trips?.length ?? 0);
  } catch (e: any) {
    if (!opts?.silent) toast.error(e?.message ?? "Erro a exportar");
    setLastAutoExportResult({ ok: false, at: Date.now(), error: e?.message ?? "Erro" });
    return null;
  }
  const filename = `${APP_NAME}-backup-${stamp()}.json`;
  downloadJson(filename, buildEnvelope("all", { sections }));
  if (!opts?.silent) toast.success(`Backup completo: ${total} item(s)`);
  try {
    const h = readHist();
    h.unshift({ table: "activity_setup" as Table, filename, at: Date.now(), count: total });
    writeHist(h);
  } catch {}
  setLastAutoExportResult({ ok: true, at: Date.now(), filename, count: total });
  return filename;
}

// Import a combined backup JSON (produced by exportAllCombined) and route each
// section to its proper importer. Categories/projects are deduped by name; rules
// remap to new IDs; sessions upsert by (started_at,ended_at).
export async function importAllCombined(userId: string): Promise<void> {
  const parsed: any = await pickJsonFile();
  if (!parsed) return;
  if (!validateEnvelope(parsed, "all")) return;
  const sections = parsed?.sections ?? parsed;
  if (!sections || typeof sections !== "object") {
    toast.error("Ficheiro não contém secções reconhecidas");
    return;
  }

  const counts: Record<string, number> = {};
  const errors: string[] = [];

  const insertSimple = async (table: Table, items: any[]) => {
    const allowed = ALLOWED_FIELDS[table];
    if (!allowed?.length) return 0;
    const rows = (items ?? [])
      .map((it) => {
        const row: Record<string, unknown> = { user_id: userId };
        for (const k of allowed) if (it[k] !== undefined && it[k] !== null) row[k] = it[k];
        return row;
      })
      .filter((r) => allowed.some((k) => r[k] !== undefined));
    if (!rows.length) return 0;
    const { rows: toInsert } = await filterExistingRows(table, rows, userId);
    if (!toInsert.length) return 0;
    const { error } = await (supabase as any).from(table).insert(toInsert);
    if (error) { errors.push(`${table}: ${error.message}`); return 0; }
    return toInsert.length;
  };

  try {
    counts.notes = await insertSimple("notes", sections.notes ?? []);
    counts.links = await insertSimple("links", sections.links ?? []);
    counts.tasks = await insertSimple("tasks", sections.tasks ?? []);
    counts.transactions = await insertSimple("transactions", sections.transactions ?? []);

    // timer_categories (hierarchical) + sessions
    let timerIdMap = new Map<string, string>();
    if (Array.isArray(sections.timer_categories) && sections.timer_categories.length) {
      const r = await importHierarchicalCategories("timer_categories", sections.timer_categories, userId);
      timerIdMap = r.idMap;
      counts.timer_categories = r.inserted;
    }
    if (Array.isArray(sections.timer_sessions) && sections.timer_sessions.length) {
      const rows = sections.timer_sessions
        .map((s: any) => ({
          user_id: userId,
          category_id: s.category_id ? (timerIdMap.get(String(s.category_id)) ?? s.category_id) : null,
          note: s.note ?? null,
          started_at: s.started_at,
          ended_at: s.ended_at ?? null,
          reminders_minutes: s.reminders_minutes ?? [],
          paused_at: s.paused_at ?? null,
          paused_ms: s.paused_ms ?? 0,
        }))
        .filter((s: any) => s.started_at && s.ended_at);
      if (rows.length) {
        const res = await replaceMatchingTimerSessions(rows, userId);
        if (!res.ok) errors.push(`timer_sessions: ${res.error}`);
        else counts.timer_sessions = res.inserted;
      }
    }

    // activity_setup
    if (sections.activity_setup) {
      await importActivitySetup(userId, { ...sections.activity_setup, table: "activity_setup", schema_version: SCHEMA_VERSION, app: APP_NAME });
      counts.activity_setup =
        (sections.activity_setup.categories?.length ?? 0) +
        (sections.activity_setup.projects?.length ?? 0) +
        (sections.activity_setup.rules?.length ?? 0);
    }

    if (Array.isArray(sections.trips) && sections.trips.length) {
      const r = await insertTripBundles(userId, sections.trips);
      counts.trips = r.inserted;
      if (r.errors.length) errors.push(`trips: ${r.errors.slice(0, 2).join("; ")}`);
    }

    const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
    if (errors.length) {
      toast.warning(`Importado parcialmente (${total}). Erros: ${errors.slice(0, 2).join("; ")}`);
    } else {
      toast.success(`Importação concluída: ${total} item(s)`);
    }
  } catch (e: any) {
    toast.error(e?.message ?? "Erro ao importar backup");
  }
}

async function runGlobalAutoExport() {
  const sched = getGlobalSchedule();
  if (!isDue(sched, new Date())) return;
  setGlobalSchedule({ last: Date.now() });
  try {
    const ok = await exportAllCombined({ silent: true });
    if (ok) toast.success("Auto-exportação programada concluída");
  } catch (e: any) {
    console.warn("global auto-export failed", e);
    setLastAutoExportResult({ ok: false, at: Date.now(), error: e?.message ?? "Erro" });
  }
}

// ---------- Import history (per table) ----------

const IMPORT_KEY = "imports:v1";

type ImportEntry = { table: ImportTable; filename: string; at: number };

function readImports(): ImportEntry[] {
  try { return JSON.parse(localStorage.getItem(IMPORT_KEY) || "[]"); } catch { return []; }
}

function writeImports(entries: ImportEntry[]) {
  localStorage.setItem(IMPORT_KEY, JSON.stringify(entries.slice(0, 100)));
}

export function recordImport(table: ImportTable, filename: string) {
  const entries = readImports();
  entries.unshift({ table, filename, at: Date.now() });
  writeImports(entries);
}

export function getLastImport(table: ImportTable): { filename: string; at: number } | null {
  return readImports().find((e) => e.table === table) ?? null;
}

const IMPORT_IDS_KEY = "imports:ids:v1";

type ImportIdsMap = Record<string, string[]>;

function readImportIds(): ImportIdsMap {
  try { return JSON.parse(localStorage.getItem(IMPORT_IDS_KEY) || "{}"); } catch { return {}; }
}

export function recordLastImportIds(table: ImportTable, ids: string[]) {
  const m = readImportIds();
  m[table] = ids.slice(0, 50000);
  localStorage.setItem(IMPORT_IDS_KEY, JSON.stringify(m));
}

export function getLastImportIds(table: ImportTable): string[] {
  return readImportIds()[table] ?? [];
}

// ---------- Travel Planner export/import (single trip + all trips) ----------
//
// A "trip bundle" packages a trip with every sub-page that the Travel Planner
// renders: overview (trip_items), itinerary (trip_days + trip_itinerary_items),
// reservations + expenses (subsets of itinerary), documents (trip_item_attachments
// joined with file_metadata for reference). File binaries are NOT exported —
// only metadata references are carried so existing files re-link by id when
// importing back into the same account.

export type TripBundle = {
  trip: Record<string, any>;
  items: any[];                 // trip_items (overview quick items)
  days: any[];                  // trip_days
  itinerary_items: any[];       // trip_itinerary_items (powers reservations + expenses)
  attachments: any[];           // trip_item_attachments (+ file_metadata snapshot)
};

async function loadTripBundle(tripId: string): Promise<TripBundle | null> {
  const [{ data: trip, error: tErr }, items, days, planItems, atts] = await Promise.all([
    (supabase as any).from("trips").select("*").eq("id", tripId).single(),
    (supabase as any).from("trip_items").select("*").eq("trip_id", tripId).order("created_at", { ascending: true }),
    (supabase as any).from("trip_days").select("*").eq("trip_id", tripId).order("day_order", { ascending: true }),
    (supabase as any).from("trip_itinerary_items").select("*").eq("trip_id", tripId).order("day_id", { ascending: true }).order("order_index", { ascending: true }),
    (supabase as any).from("trip_item_attachments").select("*, file_metadata(*)").eq("trip_id", tripId),
  ]);
  if (tErr || !trip) return null;
  return {
    trip,
    items: items.data ?? [],
    days: days.data ?? [],
    itinerary_items: planItems.data ?? [],
    attachments: atts.data ?? [],
  };
}

async function collectAllTrips(): Promise<TripBundle[]> {
  const { data: trips } = await (supabase as any).from("trips").select("id").order("created_at", { ascending: true });
  const out: TripBundle[] = [];
  for (const t of (trips ?? []) as Array<{ id: string }>) {
    const b = await loadTripBundle(t.id);
    if (b) out.push(b);
  }
  return out;
}

export async function exportTrip(tripId: string, opts?: { silent?: boolean }): Promise<string | null> {
  const bundle = await loadTripBundle(tripId);
  if (!bundle) { if (!opts?.silent) toast.error("Viagem não encontrada"); return null; }
  const safeName = String(bundle.trip.name || bundle.trip.destination || "viagem").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "viagem";
  const filename = `trip-${safeName}-${stamp()}.json`;
  downloadJson(filename, buildEnvelope("trip", { bundle }));
  if (!opts?.silent) {
    const total = bundle.items.length + bundle.days.length + bundle.itinerary_items.length + bundle.attachments.length;
    toast.success(`Viagem exportada (${total} sub-item(s))`);
  }
  return filename;
}

export async function exportAllTrips(opts?: { silent?: boolean }): Promise<string | null> {
  const bundles = await collectAllTrips();
  if (!bundles.length) { if (!opts?.silent) toast.error("Sem viagens para exportar"); return null; }
  const filename = `trips-${stamp()}.json`;
  downloadJson(filename, buildEnvelope("trips", { trips: bundles }));
  if (!opts?.silent) toast.success(`${bundles.length} viagem(ns) exportada(s)`);
  recordVersion("trips", filename, bundles.length);
  return filename;
}

// Insert one trip bundle into the target account. New ids are generated for
// trip / day / itinerary_item / attachment so the import is non-destructive
// (running twice creates duplicates). Public sharing fields are stripped.
async function insertTripBundle(userId: string, bundle: any): Promise<{ ok: boolean; error?: string; tripId?: string; skipped?: boolean }> {
  if (!bundle?.trip) return { ok: false, error: "Sem dados de viagem" };
  const { id: _oldId, user_id: _u, created_at: _c, updated_at: _up, public_slug: _ps, is_public: _ip, ...tripRest } = bundle.trip;
  // Skip if a trip with the same name + dates already exists for this user.
  const tripKey = `${_norm(tripRest.name)}|${_ts(tripRest.start_date)}|${_ts(tripRest.end_date)}`;
  const { data: existingTrips } = await (supabase as any)
    .from("trips").select("name,start_date,end_date").eq("user_id", userId);
  const seen = new Set<string>((existingTrips ?? []).map((t: any) => `${_norm(t.name)}|${_ts(t.start_date)}|${_ts(t.end_date)}`));
  if (seen.has(tripKey)) return { ok: true, skipped: true };
  const { data: newTrip, error: tErr } = await (supabase as any).from("trips").insert({ ...tripRest, user_id: userId, public_slug: null, is_public: false }).select("id").single();
  if (tErr || !newTrip) return { ok: false, error: tErr?.message ?? "Falha ao criar viagem" };
  const newTripId = newTrip.id as string;

  if (Array.isArray(bundle.items) && bundle.items.length) {
    const rows = bundle.items.map((it: any) => ({
      trip_id: newTripId, user_id: userId,
      kind: it.kind, label: it.label, url: it.url ?? null,
      price: it.price ?? null, done: !!it.done,
    }));
    await (supabase as any).from("trip_items").insert(rows);
  }

  const dayIdMap = new Map<string, string>();
  if (Array.isArray(bundle.days) && bundle.days.length) {
    const dayRows = bundle.days.map((d: any) => ({
      trip_id: newTripId, user_id: userId,
      day_order: d.day_order ?? 0, day_date: d.day_date ?? null,
      title: d.title ?? "", notes: d.notes ?? "",
    }));
    const { data: insDays } = await (supabase as any).from("trip_days").insert(dayRows).select("id");
    (insDays ?? []).forEach((row: any, i: number) => {
      const oldId = bundle.days[i]?.id;
      if (oldId) dayIdMap.set(String(oldId), String(row.id));
    });
  }

  const itemIdMap = new Map<string, string>();
  if (Array.isArray(bundle.itinerary_items) && bundle.itinerary_items.length) {
    const planRows: any[] = [];
    const sourceOrder: string[] = [];
    for (const it of bundle.itinerary_items) {
      const newDayId = dayIdMap.get(String(it.day_id));
      if (!newDayId) continue;
      planRows.push({
        trip_id: newTripId, day_id: newDayId, user_id: userId,
        item_type: it.item_type, title: it.title ?? "",
        description: it.description ?? "", scheduled_at: it.scheduled_at ?? null,
        location: it.location ?? "", notes: it.notes ?? "",
        order_index: it.order_index ?? 0,
        amount: it.amount ?? null, currency: it.currency ?? "EUR",
      });
      sourceOrder.push(String(it.id));
    }
    if (planRows.length) {
      const { data: insItems } = await (supabase as any).from("trip_itinerary_items").insert(planRows).select("id");
      (insItems ?? []).forEach((row: any, i: number) => {
        const oldId = sourceOrder[i];
        if (oldId) itemIdMap.set(oldId, String(row.id));
      });
    }
  }

  if (Array.isArray(bundle.attachments) && bundle.attachments.length) {
    // Only re-link attachments where the underlying file_metadata id still
    // exists for this user; we don't recreate files on storage from JSON.
    const fmIds = Array.from(new Set(bundle.attachments.map((a: any) => a.file_metadata_id).filter(Boolean)));
    const { data: existing } = fmIds.length
      ? await (supabase as any).from("file_metadata").select("id").in("id", fmIds).eq("user_id", userId)
      : { data: [] as any[] };
    const existingIds = new Set((existing ?? []).map((r: any) => String(r.id)));
    const rows = bundle.attachments
      .filter((a: any) => existingIds.has(String(a.file_metadata_id)))
      .map((a: any) => {
        const newItemId = itemIdMap.get(String(a.item_id));
        const newDayId = dayIdMap.get(String(a.day_id));
        if (!newItemId || !newDayId) return null;
        return {
          trip_id: newTripId, day_id: newDayId, item_id: newItemId,
          user_id: userId, file_metadata_id: a.file_metadata_id,
        };
      })
      .filter(Boolean);
    if (rows.length) await (supabase as any).from("trip_item_attachments").insert(rows);
  }

  return { ok: true, tripId: newTripId };
}

async function insertTripBundles(userId: string, raw: any[]): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];
  for (const b of raw) {
    const r = await insertTripBundle(userId, b);
    if (r.ok) inserted += 1;
    else if (r.error) errors.push(r.error);
  }
  return { inserted, errors };
}

async function importTripsFromParsed(userId: string, parsed: any): Promise<void> {
  // Accept either a single trip envelope ({bundle}), a multi-trip envelope
  // ({trips: [bundle, ...]}), or a bare array of bundles.
  const list: any[] = Array.isArray(parsed?.trips)
    ? parsed.trips
    : parsed?.bundle
      ? [parsed.bundle]
      : Array.isArray(parsed)
        ? parsed
        : [];
  if (!list.length) { toast.error("Sem viagens reconhecidas no ficheiro"); return; }
  const r = await insertTripBundles(userId, list);
  if (r.inserted) toast.success(`${r.inserted} viagem(ns) importada(s)`);
  if (r.errors.length) toast.warning(`Erros: ${r.errors.slice(0, 2).join("; ")}`);
  if (!r.inserted && !r.errors.length) toast.error("Nenhuma viagem importada");
}

export async function importTripsFromFile(userId: string): Promise<void> {
  const parsed = await pickJsonFile();
  if (!parsed) return;
  await importTripsFromParsed(userId, parsed);
}

