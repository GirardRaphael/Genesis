import { useEffect, useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { Chart, palette } from "./Chart";
import { api } from "./api";
import { money, num, statusLabel } from "./state";
import type { Selection } from "./state";
import type { Cohort } from "./types";
import { roleName } from "./Observability";
import {
  requestStatus,
  scenarioRows,
  share,
  tokensByRole,
} from "./analyticsData";
import type { RunPage, Usage, UsageGroup } from "./analyticsData";
import "./Analytics.css";

type Snapshot = { metrics: Cohort; usage: Usage; runs: RunPage };
type Group = "agents" | "models";
type Measure = "cost" | "tokens" | "latency";

const shortPolicy = (policy: string) =>
  policy === "baseline_only"
    ? "Référence"
    : policy === "solver_with_one_replan"
      ? "Solveur + replan."
      : policy;

export function Analytics({
  selection,
  onFilter,
}: {
  selection: Selection;
  onFilter: (change: Partial<Selection>) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<Group>("agents");
  const [measure, setMeasure] = useState<Measure>("cost");
  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      scenario_id: selection.scenario,
      status: selection.status,
      policy: selection.policy,
      agent: selection.agent,
      model: selection.model,
    }))
      if (value) params.set(key, value);
    return params.toString();
  }, [
    selection.scenario,
    selection.status,
    selection.policy,
    selection.agent,
    selection.model,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    setSnapshot(null);
    setError("");
    const suffix = query ? `?${query}` : "";
    const runQuery = `${query ? `${query}&` : ""}limit=200`;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [metrics, usage, runs] = await Promise.all([
          api<Cohort>(`/metrics${suffix}`, controller.signal),
          api<Usage>(`/usage${suffix}`, controller.signal),
          api<RunPage>(`/runs?${runQuery}`, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setSnapshot({ metrics, usage, runs });
          setError("");
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "Requête impossible",
          );
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [query]);

  const rows = snapshot?.usage[group] || [];
  const tokenRows = snapshot ? tokensByRole(snapshot.usage.agents) : [];
  const scenarios = snapshot ? scenarioRows(snapshot.runs.items) : [];
  const statuses = snapshot ? requestStatus(snapshot.runs.items) : [];
  const slice = (key: string) => {
    if (!key) return;
    const field = group === "agents" ? "agent" : "model";
    onFilter({ [field]: selection[field] === key ? "" : key });
  };
  const groupLabel = (row: UsageGroup) =>
    group === "agents" ? roleName(row.role || "") : row.model || "Indisponible";
  const labels = rows.filter((row) => row.calls).map(groupLabel);
  const costData = share(rows, group === "agents" ? "role" : "model").map(
    (item) => ({
      ...item,
      name: group === "agents" ? roleName(item.name) : item.name,
    }),
  );
  const costOption: EChartsCoreOption = {
    color: palette,
    tooltip: {
      trigger: "item",
      valueFormatter: (value: unknown) => money(Number(value), "USD"),
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "middle",
      width: "43%",
    },
    series: [
      {
        type: "pie",
        radius: ["52%", "72%"],
        center: ["30%", "50%"],
        label: { show: false },
        data: costData,
      },
    ],
  };
  const tokenOption: EChartsCoreOption = {
    color: [palette[0], palette[1]],
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, data: ["Entrée", "Sortie"] },
    grid: { left: 50, right: 12, top: 16, bottom: 65, containLabel: true },
    xAxis: {
      type: "category",
      data: tokenRows.map((row) => roleName(row.role)),
      axisLabel: { rotate: 22 },
    },
    yAxis: { type: "value", name: "tokens" },
    series: [
      {
        type: "bar",
        name: "Entrée",
        stack: "tokens",
        data: tokenRows.map((row) => ({ value: row.input, key: row.role })),
      },
      {
        type: "bar",
        name: "Sortie",
        stack: "tokens",
        data: tokenRows.map((row) => ({ value: row.output, key: row.role })),
      },
    ],
  };
  const latencyOption: EChartsCoreOption = {
    color: [palette[0]],
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) => `${num(Number(value), 0)} ms`,
    },
    grid: { left: 16, right: 22, top: 15, bottom: 25, containLabel: true },
    xAxis: { type: "value", name: "ms" },
    yAxis: {
      type: "category",
      data: labels,
      inverse: true,
      axisLabel: { width: 125, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 28,
        data: rows
          .filter((row) => row.calls)
          .map((row) => ({
            value: row.mean_latency_ms,
            key: group === "agents" ? row.role : row.model,
          })),
      },
    ],
  };
  const statusOption: EChartsCoreOption = {
    color: palette,
    tooltip: { trigger: "item" },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "middle",
      width: "46%",
    },
    series: [
      {
        type: "pie",
        radius: ["52%", "72%"],
        center: ["30%", "50%"],
        label: { show: false },
        data: statuses.map((item) => ({
          ...item,
          name: statusLabel(item.name),
          key: item.name,
        })),
      },
    ],
  };

  return (
    <section
      className="analytics"
      aria-label="Analyses des exécutions et des appels"
    >
      <div className="analytics-intro">
        <div>
          <span className="eyebrow">
            ANALYSE DE COHORTE · ACTUALISÉE TOUTES LES 3 S
          </span>
          <h2>Activité et consommation</h2>
        </div>
        <p>
          Scénario, statut, politique, agent et modèle suivent les filtres
          communs. Les montants API sont estimés en USD ; les coûts de flotte
          sont estimés en CAD.
        </p>
      </div>
      {error && (
        <p className="notice" role="alert">
          Données analytiques indisponibles : {error}
          {snapshot ? " · Dernier état conservé." : ""}
        </p>
      )}
      {!snapshot ? (
        <p className="notice" role="status">
          Chargement de la cohorte…
        </p>
      ) : (
        <>
          <div
            className="analytics-kpis"
            aria-label="Indicateurs de la cohorte"
          >
            <Kpi
              title="Exécutions"
              value={num(snapshot.metrics.total_runs, 0)}
              note={`${snapshot.metrics.live_runs} directes · ${snapshot.metrics.fixture_runs} démonstrations`}
            />
            <Kpi
              title="Réussite des analyses"
              value={
                snapshot.metrics.success_rate == null
                  ? "Indisponible"
                  : `${num(snapshot.metrics.success_rate * 100, 1)} %`
              }
              note={`${snapshot.metrics.success_numerator}/${snapshot.metrics.success_denominator} terminées évaluables · pas une mesure de livraisons`}
            />
            <Kpi
              title="Coût API estimé · USD"
              value={
                snapshot.usage.totals.cost_usd == null
                  ? "Indisponible"
                  : num(Number(snapshot.usage.totals.cost_usd), 6)
              }
              note={`${num(snapshot.usage.totals.cost_coverage * 100, 0)} % des ${snapshot.usage.totals.calls} appels avec coût`}
            />
            <Kpi
              title="Tokens déclarés"
              value={num(snapshot.usage.totals.total_tokens, 0)}
              note={`${num(snapshot.usage.totals.usage_coverage * 100, 0)} % des appels avec entrée et sortie`}
            />
            <Kpi
              title="Latence moyenne"
              value={
                snapshot.usage.totals.mean_latency_ms == null
                  ? "Indisponible"
                  : `${num(snapshot.usage.totals.mean_latency_ms, 0)} ms`
              }
              note={`${snapshot.usage.totals.latency_samples} appels mesurés · temps réel`}
            />
          </div>
          <div className="analytics-grid">
            <section
              className="panel analytics-primary"
              aria-labelledby="analytics-usage-title"
            >
              <div className="panel-heading analytics-heading">
                <div>
                  <span className="eyebrow">
                    APPELS DE MODÈLE · COHORTE COMPLÈTE
                  </span>
                  <h2 id="analytics-usage-title">
                    Répartition par {group === "agents" ? "agent" : "modèle"}
                  </h2>
                </div>
                <div className="segmented" aria-label="Regroupement">
                  <button
                    type="button"
                    aria-pressed={group === "agents"}
                    className={group === "agents" ? "active" : ""}
                    onClick={() => setGroup("agents")}
                  >
                    Agents
                  </button>
                  <button
                    type="button"
                    aria-pressed={group === "models"}
                    className={group === "models" ? "active" : ""}
                    onClick={() => setGroup("models")}
                  >
                    Modèles
                  </button>
                </div>
              </div>
              <div className="segmented analytics-measures" aria-label="Mesure">
                <button
                  type="button"
                  aria-pressed={measure === "cost"}
                  className={measure === "cost" ? "active" : ""}
                  onClick={() => setMeasure("cost")}
                >
                  Coût USD
                </button>
                <button
                  type="button"
                  aria-pressed={measure === "tokens"}
                  className={measure === "tokens" ? "active" : ""}
                  onClick={() => setMeasure("tokens")}
                >
                  Tokens par rôle
                </button>
                <button
                  type="button"
                  aria-pressed={measure === "latency"}
                  className={measure === "latency" ? "active" : ""}
                  onClick={() => setMeasure("latency")}
                >
                  Latence
                </button>
              </div>
              {measure === "cost" ? (
                costData.length ? (
                  <Chart
                    option={costOption}
                    label={`Part du coût API estimé par ${group === "agents" ? "agent" : "modèle"}, en USD`}
                    height={290}
                    onSelect={(item) => slice(item.data?.key || "")}
                  />
                ) : (
                  <p className="empty">
                    Aucun coût API connu dans cette cohorte.
                  </p>
                )
              ) : measure === "tokens" ? (
                tokenRows.some(
                  (row) => row.input != null || row.output != null,
                ) ? (
                  <Chart
                    option={tokenOption}
                    label="Tokens d’entrée et de sortie déclarés, empilés par rôle"
                    height={290}
                    onSelect={(item) => {
                      if (item.data?.key)
                        onFilter({
                          agent:
                            selection.agent === item.data.key
                              ? ""
                              : item.data.key,
                        });
                    }}
                  />
                ) : (
                  <p className="empty">
                    Aucun token déclaré dans cette cohorte.
                  </p>
                )
              ) : rows.some((row) => row.mean_latency_ms != null) ? (
                <Chart
                  option={latencyOption}
                  label={`Latence moyenne des appels en millisecondes par ${group === "agents" ? "agent" : "modèle"}`}
                  height={290}
                  onSelect={(item) => slice(item.data?.key || "")}
                />
              ) : (
                <p className="empty">
                  Aucune latence mesurée dans cette cohorte.
                </p>
              )}
              <p className="chart-caption">
                Cliquez un élément ou son nom dans le tableau pour filtrer. Les
                tokens mis en cache sont déjà inclus dans l’entrée et ne sont
                pas ajoutés une deuxième fois. Valeurs manquantes exclues du
                graphique, jamais assimilées à zéro.
              </p>
              <div className="table-scroll">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>{group === "agents" ? "Agent" : "Modèle"}</th>
                      <th className="numeric">Appels</th>
                      <th className="numeric">Coût API USD</th>
                      <th className="numeric">Entrée / sortie</th>
                      <th className="numeric">Latence</th>
                      <th className="numeric">Couverture coût / tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((row) => row.calls)
                      .map((row) => {
                        const key =
                          group === "agents" ? row.role || "" : row.model || "";
                        return (
                          <tr key={key}>
                            <td>
                              <button
                                type="button"
                                className="table-link"
                                aria-pressed={
                                  selection[
                                    group === "agents" ? "agent" : "model"
                                  ] === key
                                }
                                onClick={() => slice(key)}
                              >
                                {groupLabel(row)}
                              </button>
                            </td>
                            <td className="numeric">{row.calls}</td>
                            <td className="numeric">
                              {money(row.cost_usd, "USD")}
                            </td>
                            <td className="numeric">
                              {num(row.input_tokens, 0)} /{" "}
                              {num(row.output_tokens, 0)}
                            </td>
                            <td className="numeric">
                              {row.mean_latency_ms == null
                                ? "Indisponible"
                                : `${num(row.mean_latency_ms, 0)} ms · n=${row.latency_samples}`}
                            </td>
                            <td className="numeric">
                              {num(row.cost_coverage * 100, 0)} % /{" "}
                              {num(row.usage_coverage * 100, 0)} %
                            </td>
                          </tr>
                        );
                      })}
                    {!rows.some((row) => row.calls) && (
                      <tr>
                        <td colSpan={6}>
                          Aucun appel de modèle. Les démonstrations ne
                          produisent pas de tokens fictifs.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section
              className="panel analytics-status"
              aria-labelledby="analytics-status-title"
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">EXÉCUTIONS VISIBLES</span>
                  <h2 id="analytics-status-title">Statuts des requêtes</h2>
                </div>
              </div>
              {statuses.length ? (
                <Chart
                  option={statusOption}
                  label="Nombre d’exécutions par statut"
                  height={250}
                  onSelect={(item) => {
                    const key = item.data?.key;
                    if (key)
                      onFilter({ status: selection.status === key ? "" : key });
                  }}
                />
              ) : (
                <p className="empty">Aucune exécution dans cette cohorte.</p>
              )}
              <div className="analytics-status-list">
                {statuses.map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    aria-pressed={selection.status === item.name}
                    onClick={() =>
                      onFilter({
                        status: selection.status === item.name ? "" : item.name,
                      })
                    }
                  >
                    <span>{statusLabel(item.name)}</span>
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>
              <p className="chart-caption">
                {snapshot.runs.items.length}/{snapshot.runs.total} exécutions
                affichées.{" "}
                {snapshot.runs.total > 200
                  ? "Répartition limitée aux 200 plus récentes de la cohorte."
                  : "Répartition de toute la cohorte."}
              </p>
            </section>
          </div>
          <section
            className="panel analytics-scenarios"
            aria-labelledby="analytics-scenarios-title"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  SCÉNARIOS · MÊME COHORTE FILTRÉE
                </span>
                <h2 id="analytics-scenarios-title">Comparer les contextes</h2>
              </div>
            </div>
            <p>
              Comparaison descriptive des exécutions visibles. Les politiques,
              graines et couvertures peuvent différer ; aucun écart ci-dessous
              n’établit un gain causal.
            </p>
            <div className="table-scroll">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Scénario</th>
                    <th className="numeric">Exécutions</th>
                    <th className="numeric">Analyses réussies</th>
                    <th>Politiques présentes</th>
                    <th className="numeric">Coût flotte moyen CAD</th>
                    <th className="numeric">Couverture coût flotte</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((row) => (
                    <tr key={row.scenario}>
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          aria-pressed={selection.scenario === row.scenario}
                          onClick={() =>
                            onFilter({
                              scenario:
                                selection.scenario === row.scenario
                                  ? ""
                                  : row.scenario,
                            })
                          }
                        >
                          {row.scenario}
                        </button>
                      </td>
                      <td className="numeric">{row.runs}</td>
                      <td className="numeric">
                        {row.completed}/{row.runs}
                      </td>
                      <td>{row.policies.map(shortPolicy).join(" · ")}</td>
                      <td className="numeric">{money(row.meanFleetCostCad)}</td>
                      <td className="numeric">
                        {row.fleetCostSamples}/{row.runs}
                      </td>
                    </tr>
                  ))}
                  {!scenarios.length && (
                    <tr>
                      <td colSpan={6}>Aucun scénario dans cette sélection.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="chart-caption">
              Coût flotte synthétique en CAD, séparé de la dépense API.{" "}
              {snapshot.runs.total > 200
                ? "Table limitée aux 200 exécutions les plus récentes ; les indicateurs d’appels et de cohorte portent sur toutes les exécutions filtrées."
                : "Toutes les exécutions filtrées sont incluses."}
            </p>
          </section>
        </>
      )}
    </section>
  );
}

function Kpi({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="analytics-kpi">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
