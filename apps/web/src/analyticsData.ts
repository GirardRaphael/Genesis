import type { Run } from "./types";

export type UsageTotals = {
  calls: number;
  completed: number;
  running: number;
  errors: number;
  retries: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: string | null;
  usage_coverage: number;
  cost_coverage: number;
  mean_latency_ms: number | null;
  latency_samples: number;
};
export type UsageGroup = UsageTotals & { role?: string; model?: string };
export type Usage = {
  totals: UsageTotals;
  agents: (UsageGroup & { role: string })[];
  models: (UsageGroup & { model: string })[];
  attempts_total: number;
};
export type RunPage = { items: Run[]; total: number };

export function share(rows: UsageGroup[], key: "role" | "model") {
  return rows
    .filter((row) => row.cost_usd !== null && Number(row.cost_usd) > 0)
    .map((row) => ({
      name: row[key] || "Indisponible",
      key: row[key] || "",
      value: Number(row.cost_usd),
    }));
}

export function tokensByRole(rows: (UsageGroup & { role: string })[]) {
  return rows
    .filter((row) => row.calls > 0)
    .map((row) => ({
      role: row.role,
      input: row.input_tokens,
      output: row.output_tokens,
      coverage: row.usage_coverage,
      calls: row.calls,
    }));
}

export function requestStatus(runs: Run[]) {
  const statuses = new Map<string, number>();
  for (const run of runs)
    statuses.set(run.status, (statuses.get(run.status) || 0) + 1);
  return [...statuses].map(([name, value]) => ({ name, value }));
}

export function scenarioRows(runs: Run[]) {
  const groups = new Map<string, Run[]>();
  for (const run of runs)
    groups.set(run.scenario_id, [...(groups.get(run.scenario_id) || []), run]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([scenario, items]) => {
      const costs = items
        .map((run) => run.metrics?.fleet_cost_cad)
        .filter((cost): cost is string => cost != null);
      const known = costs.map(Number).filter(Number.isFinite);
      return {
        scenario,
        runs: items.length,
        completed: items.filter((run) => run.status === "succeeded").length,
        policies: [...new Set(items.map((run) => run.policy))],
        meanFleetCostCad: known.length
          ? known.reduce((sum, cost) => sum + cost, 0) / known.length
          : null,
        fleetCostSamples: known.length,
      };
    });
}
