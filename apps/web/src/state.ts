import type { Run, TraceEvent } from "./types";
export type View =
  | "overview"
  | "fleet"
  | "runs"
  | "compare"
  | "observatory"
  | "analytics"
  | "dispatch";
export type Selection = {
  view: View;
  run: string;
  left: string;
  right: string;
  scenario: string;
  status: string;
  policy: string;
  agent: string;
  model: string;
  query: string;
};
export function readSelection(search: string): Selection {
  const p = new URLSearchParams(search);
  const view = p.get("view");
  return {
    view: [
      "overview",
      "fleet",
      "runs",
      "compare",
      "observatory",
      "analytics",
      "dispatch",
    ].includes(view || "")
      ? (view as View)
      : "overview",
    run: p.get("run") || "",
    left: p.get("left") || "",
    right: p.get("right") || "",
    scenario: p.get("scenario") || "",
    status: p.get("status") || "",
    policy: p.get("policy") || "",
    agent: p.get("agent") || "",
    model: p.get("model") || "",
    query: p.get("q") || "",
  };
}
export function selectionSearch(s: Selection) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(s))
    if (value) p.set(key === "query" ? "q" : key, value);
  return "?" + p.toString();
}
export function filterRuns(runs: Run[], s: Selection) {
  return runs.filter(
    (r) =>
      (!s.scenario || r.scenario_id === s.scenario) &&
      (!s.status || r.status === s.status) &&
      (!s.policy || r.policy === s.policy) &&
      (!s.query ||
        `${r.id} ${r.scenario_label}`
          .toLowerCase()
          .includes(s.query.toLowerCase())),
  );
}
export function mergeEvents(current: TraceEvent[], incoming: TraceEvent[]) {
  const map = new Map(current.map((e) => [e.run_seq, e]));
  for (const e of incoming) if (!map.has(e.run_seq)) map.set(e.run_seq, e);
  return [...map.values()].sort((a, b) => a.run_seq - b.run_seq).slice(-1000);
}
export function comparable(a: Run, b: Run) {
  return (
    a.workflow_kind !== "broker" &&
    b.workflow_kind !== "broker" &&
    a.scenario_id === b.scenario_id &&
    a.seed === b.seed &&
    a.provenance === b.provenance
  );
}
export function delta(a: number, b: number) {
  return { absolute: b - a, percent: a === 0 ? null : ((b - a) / a) * 100 };
}
export const num = (v: number | null | undefined, d = 1) =>
  v == null
    ? "Indisponible"
    : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: d }).format(v);
export const money = (
  v: string | number | null | undefined,
  currency = "CAD",
) =>
  v == null
    ? "Indisponible"
    : new Intl.NumberFormat("fr-CA", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "USD" ? 6 : 2,
      }).format(Number(v));
export const clock = (seconds: number) =>
  `${String(8 + Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
export const statusLabel = (status: string) =>
  ({
    succeeded: "Terminée",
    failed: "Échec",
    running: "En cours",
    queued: "En attente",
    cancelled: "Annulée",
    timed_out: "Délai dépassé",
    budget_exceeded: "Budget dépassé",
    completed: "Terminé",
  })[status] || status;
