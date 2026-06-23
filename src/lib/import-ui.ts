// Lightweight pub/sub store for import progress + conflict resolution UI.
// Imports in data-io.ts call these helpers; the <ImportProgressHost /> renders
// the overlay + modal anywhere in the app.

export type ImportStepSummary = {
  label: string;
  inserted: number;
  skipped: number;
  updated: number;
  errors: number;
};

export type ConflictRow = {
  table: string;
  label: string;
  // Fields where incoming != existing. Excludes the dedup-key fields.
  diffs: { field: string; existing: unknown; incoming: unknown }[];
  existingId: string;
  incoming: Record<string, unknown>;
};

export type ConflictDecision = "keep" | "update";

type ProgressState = {
  open: boolean;
  title: string;
  step: number;
  total: number;
  currentLabel: string;
  done: boolean;
  steps: ImportStepSummary[];
  error: string | null;
};

const initial: ProgressState = {
  open: false, title: "", step: 0, total: 0, currentLabel: "",
  done: false, steps: [], error: null,
};

let state: ProgressState = { ...initial };
const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }

export function subscribeProgress(l: () => void): () => void {
  listeners.add(l); return () => { listeners.delete(l); };
}
export function getProgress(): ProgressState { return state; }

export const importProgress = {
  start(title: string, total: number) {
    state = { open: true, title, step: 0, total, currentLabel: "", done: false, steps: [], error: null };
    emit();
  },
  setLabel(label: string) {
    state = { ...state, currentLabel: label };
    emit();
  },
  completeStep(s: ImportStepSummary) {
    state = { ...state, step: state.step + 1, steps: [...state.steps, s], currentLabel: "" };
    emit();
  },
  finish(error?: string | null) {
    state = { ...state, done: true, error: error ?? null, currentLabel: "" };
    emit();
  },
  close() {
    state = { ...initial };
    emit();
  },
};

// --- Conflicts modal ---
type ConflictState = {
  open: boolean;
  rows: ConflictRow[];
  resolve: ((decisions: ConflictDecision[]) => void) | null;
};
let conflictState: ConflictState = { open: false, rows: [], resolve: null };
const cListeners = new Set<() => void>();
function cEmit() { for (const l of cListeners) l(); }

export function subscribeConflicts(l: () => void): () => void {
  cListeners.add(l); return () => { cListeners.delete(l); };
}
export function getConflicts(): ConflictState { return conflictState; }

export function askConflictResolution(rows: ConflictRow[]): Promise<ConflictDecision[]> {
  if (!rows.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    conflictState = { open: true, rows, resolve };
    cEmit();
  });
}

export function resolveConflicts(decisions: ConflictDecision[]) {
  const r = conflictState.resolve;
  conflictState = { open: false, rows: [], resolve: null };
  cEmit();
  r?.(decisions);
}
