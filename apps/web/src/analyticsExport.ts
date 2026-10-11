import type { Selection } from "./state";
import type { Cohort } from "./types";
import { requestStatus, scenarioRows } from "./analyticsData";
import type { RunPage, Usage, UsageTotals } from "./analyticsData";

export type AnalyticsSnapshot = {
  metrics: Cohort;
  usage: Usage;
  runs: RunPage;
  receivedAt: string;
};
type Cell = string | number | null | undefined;

function csvCell(value: Cell) {
  if (value == null) return '""';
  // Quoting alone does not stop Excel from evaluating untrusted text as a formula.
  const safe =
    typeof value === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(value)
      ? `'${value}`
      : String(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

export function analyticsCsv(
  snapshot: AnalyticsSnapshot,
  selection: Selection,
  exportedAt: string,
  stale: boolean,
) {
  const rows: Cell[][] = [
    [
      "section",
      "portée",
      "identifiant",
      "mesure",
      "valeur",
      "unité",
      "échantillons",
      "dénominateur",
      "couverture (ratio 0–1)",
    ],
  ];
  const metadata: Record<string, Cell> = {
    export_utc: exportedAt,
    réception_utc: snapshot.receivedAt,
    actualisation_metrics_utc: snapshot.metrics.refreshed_at,
    snapshot_metrics: snapshot.metrics.snapshot,
    état: stale
      ? "Dernier état conservé après échec d’actualisation"
      : "Dernier état reçu",
    période: "Toutes les dates disponibles ; aucun filtre temporel appliqué",
    horloge: "Exécutions et latence : temps réel ; flotte : simulation",
    lecture:
      "Trois réponses lues ensemble ; cohérence transactionnelle entre endpoints non garantie",
    valeurs_absentes: "Cellule vide = indisponible ; 0 = zéro déclaré",
    texte:
      "Préfixe apostrophe pour les textes susceptibles d’être interprétés comme des formules",
    coût: "API estimée en USD ; flotte synthétique estimée en CAD ; ni factures ni gain causal",
    portée_appels:
      "Tous les appels correspondant aux filtres agent/modèle dans les exécutions filtrées",
    portée_exécutions:
      "Exécutions contenant des invocations d’agents ou des tentatives de modèle correspondant aux filtres ; une invocation peut n’avoir aucun appel (démonstration ou omission)",
    portée_tables:
      "Statuts et scénarios : page des 200 exécutions les plus récentes au maximum",
    exécutions_page: snapshot.runs.items.length,
    exécutions_total_page: snapshot.runs.total,
  };
  for (const [key, value] of Object.entries(metadata))
    rows.push(["métadonnées", "export", "", key, value]);
  for (const key of ["scenario", "status", "policy", "agent", "model"] as const)
    rows.push([
      "filtres",
      "cohorte",
      key,
      "sélection",
      selection[key] || "Tous",
    ]);
  const { metrics } = snapshot;
  rows.push(
    [
      "indicateurs",
      "cohorte complète",
      "",
      "exécutions",
      metrics.total_runs,
      "exécutions",
    ],
    [
      "indicateurs",
      "cohorte complète",
      "",
      "exécutions directes",
      metrics.live_runs,
      "exécutions",
    ],
    [
      "indicateurs",
      "cohorte complète",
      "",
      "démonstrations",
      metrics.fixture_runs,
      "exécutions",
    ],
    [
      "indicateurs",
      "cohorte complète",
      "",
      "réussite analyses",
      metrics.success_rate,
      "ratio 0–1",
      metrics.success_numerator,
      metrics.success_denominator,
    ],
  );
  const usageRows = (section: string, key: string, values: UsageTotals) => {
    for (const [metric, value, unit, samples, denominator, coverage] of [
      ["appels", values.calls, "appels"],
      ["appels terminés", values.completed, "appels"],
      ["appels en cours", values.running, "appels"],
      ["erreurs", values.errors, "tentatives"],
      ["reprises", values.retries, "reprises"],
      [
        "coût API estimé",
        values.cost_usd,
        "USD",
        null,
        values.calls,
        values.cost_coverage,
      ],
      [
        "tokens entrée",
        values.input_tokens,
        "tokens",
        null,
        values.calls,
        values.usage_coverage,
      ],
      [
        "tokens sortie",
        values.output_tokens,
        "tokens",
        null,
        values.calls,
        values.usage_coverage,
      ],
      [
        "tokens total",
        values.total_tokens,
        "tokens",
        null,
        values.calls,
        values.usage_coverage,
      ],
      [
        "latence moyenne",
        values.mean_latency_ms,
        "ms",
        values.latency_samples,
        values.calls,
      ],
    ] as Cell[][])
      rows.push([
        section,
        "appels filtrés · cohorte complète",
        key,
        metric,
        value,
        unit,
        samples,
        denominator,
        coverage,
      ]);
  };
  usageRows("appels total", "", snapshot.usage.totals);
  for (const group of snapshot.usage.agents)
    usageRows("agents", group.role, group);
  for (const group of snapshot.usage.models)
    usageRows("modèles", group.model, group);
  for (const status of requestStatus(snapshot.runs.items))
    rows.push([
      "statuts",
      "page visible",
      status.name,
      "exécutions",
      status.value,
      "exécutions",
      null,
      snapshot.runs.items.length,
    ]);
  for (const scenario of scenarioRows(snapshot.runs.items)) {
    rows.push(
      [
        "scénarios",
        "page visible",
        scenario.scenario,
        "exécutions",
        scenario.runs,
        "exécutions",
      ],
      [
        "scénarios",
        "page visible",
        scenario.scenario,
        "analyses réussies",
        scenario.completed,
        "exécutions",
        null,
        scenario.runs,
      ],
      [
        "scénarios",
        "page visible",
        scenario.scenario,
        "politiques présentes",
        scenario.policies.join(" · "),
      ],
      [
        "scénarios",
        "page visible",
        scenario.scenario,
        "coût flotte moyen estimé",
        scenario.meanFleetCostCad,
        "CAD",
        scenario.fleetCostSamples,
        scenario.runs,
      ],
    );
  }
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        Array.from({ length: 9 }, (_, i) => csvCell(row[i])).join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
