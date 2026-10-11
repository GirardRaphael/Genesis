import { describe, expect, it } from "vitest";
import { analyticsCsv } from "./analyticsExport";
import type { AnalyticsSnapshot } from "./analyticsExport";
import { readSelection } from "./state";
import type { Run } from "./types";

const totals = {
  calls: 2,
  completed: 1,
  running: 1,
  errors: 0,
  retries: 0,
  input_tokens: 0,
  output_tokens: null,
  total_tokens: null,
  cost_usd: "0.000000123456789",
  usage_coverage: 0,
  cost_coverage: 0.5,
  mean_latency_ms: 0,
  latency_samples: 1,
};
const snapshot: AnalyticsSnapshot = {
  receivedAt: "2026-10-11T01:00:00.000Z",
  metrics: {
    total_runs: 250,
    fixture_runs: 200,
    live_runs: 50,
    success_rate: null,
    success_numerator: 0,
    success_denominator: 0,
    mean_duration_ms: null,
    duration_count: 0,
    total_tokens: null,
    api_cost_usd: totals.cost_usd,
    usage_coverage: 0,
    errors: 0,
    most_used_agent: null,
    slowest_agent: null,
    agents: [],
    scenario_agents: [],
    snapshot: "test-snapshot",
  },
  usage: {
    totals,
    agents: [{ ...totals, role: "planning" }],
    models: [{ ...totals, model: "model" }],
    attempts_total: 2,
  },
  runs: {
    total: 250,
    items: [
      {
        scenario_id: "S01",
        status: "succeeded",
        policy: "baseline_only",
        metrics: { fleet_cost_cad: "0" },
      },
      {
        scenario_id: "S01",
        status: "failed",
        policy: "solver_with_one_replan",
        metrics: null,
      },
    ] as Run[],
  },
};
const selection = readSelection(
  "?view=analytics&scenario=S01&agent=planning&q=private-address&run=private-run",
);
const exportAt = "2026-10-11T01:02:00.000Z";

describe("analytics CSV export", () => {
  it("exports filtered cohort and page scopes, timestamps, exact cost and coverage without private inspection fields", () => {
    const csv = analyticsCsv(snapshot, selection, exportAt, true);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain(`"export_utc","${exportAt}"`);
    expect(csv).toContain('"réception_utc","2026-10-11T01:00:00.000Z"');
    expect(csv).toContain("Dernier état conservé après échec");
    expect(csv).toContain('"scenario","sélection","S01"');
    expect(csv).toContain('"exécutions_page","2"');
    expect(csv).toContain('"exécutions_total_page","250"');
    expect(csv).toContain(
      '"coût API estimé","0.000000123456789","USD","","2","0.5"',
    );
    expect(csv).toContain(
      '"S01","coût flotte moyen estimé","0","CAD","1","2",""',
    );
    expect(csv).not.toContain("private-address");
    expect(csv).not.toContain("private-run");
  });

  it("keeps zero values separate from missing values and preserves both usage groupings", () => {
    const csv = analyticsCsv(snapshot, selection, exportAt, false);
    expect(csv).toContain('"tokens entrée","0","tokens"');
    expect(csv).toContain('"tokens sortie","","tokens"');
    expect(csv).toContain('"latence moyenne","0","ms","1","2",""');
    expect(csv).toContain('"réussite analyses","","ratio 0–1","0","0"');
    expect(csv).toContain(
      '"agents","appels filtrés · cohorte complète","planning"',
    );
    expect(csv).toContain(
      '"modèles","appels filtrés · cohorte complète","model"',
    );
  });

  it("describes matching invocations even when fixture or omitted agents have no model calls", () => {
    const csv = analyticsCsv(
      {
        ...snapshot,
        usage: {
          totals: {
            ...totals,
            calls: 0,
            completed: 0,
            running: 0,
            input_tokens: null,
            cost_usd: null,
            mean_latency_ms: null,
            latency_samples: 0,
            cost_coverage: 0,
          },
          agents: [],
          models: [],
          attempts_total: 0,
        },
      },
      selection,
      exportAt,
      false,
    );
    expect(csv).toContain(
      "invocations d’agents ou des tentatives de modèle correspondant aux filtres",
    );
    expect(csv).toContain("aucun appel (démonstration ou omission)");
    expect(csv).toContain(
      "Tous les appels correspondant aux filtres agent/modèle dans les exécutions filtrées",
    );
    expect(csv).toContain(
      '"appels total","appels filtrés · cohorte complète","","appels","0"',
    );
    expect(csv).toContain(
      '"indicateurs","cohorte complète","","exécutions","250"',
    );
  });

  it("quotes delimiters, quotes and embedded newlines, and neutralizes formula prefixes including whitespace", () => {
    for (const prefix of ["=", "+", "-", "@", " \t=", "\r", "\n", "\t"]) {
      const model = `${prefix}SUM(1,2)\n"quoted"`;
      const csv = analyticsCsv(
        {
          ...snapshot,
          usage: { ...snapshot.usage, models: [{ ...totals, model }] },
        },
        selection,
        exportAt,
        false,
      );
      expect(csv).toContain(`"'${prefix}SUM(1,2)\n""quoted"""`);
    }
  });

  it("exports an empty loaded cohort without inventing status or scenario rows", () => {
    const csv = analyticsCsv(
      { ...snapshot, runs: { items: [], total: 0 } },
      readSelection(""),
      exportAt,
      false,
    );
    expect(csv).toContain('"exécutions_page","0"');
    expect(csv).not.toContain('"statuts","page visible"');
    expect(csv).not.toContain('"scénarios","page visible"');
  });
});
