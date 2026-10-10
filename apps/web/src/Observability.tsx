import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Check,
  ChevronRight,
  Clock,
  FileText,
  GitBranch,
  Layers,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import type { Agent, Cohort, RunDetail, TraceEvent } from "./types";
import { Chart, palette } from "./Chart";
import { num, money, statusLabel } from "./state";
const roleLabels: Record<string, string> = {
  planning: "Planification",
  traffic: "Trafic simulé",
  optimization: "Optimisation",
  monitoring: "Contrôle",
  exception: "Exceptions",
};
export const roleName = (role: string) => roleLabels[role] || role;
export function Kpis({ metrics }: { metrics: Cohort | null }) {
  const used = metrics?.agents?.reduce((a, b) => (b.count > a.count ? b : a), {
    role: "",
    count: 0,
    mean_duration_ms: 0,
  });
  const slow = metrics?.agents?.reduce(
    (a, b) => ((b.mean_duration_ms ?? -1) > (a.mean_duration_ms ?? -1) ? b : a),
    { role: "", count: 0, mean_duration_ms: 0 },
  );
  const values = [
    [
      "Exécutions",
      num(metrics?.total_runs, 0),
      `${metrics?.fixture_runs ?? "—"} démonstrations · ${metrics?.live_runs ?? "—"} en direct`,
    ],
    [
      "Missions réussies",
      metrics?.success_rate == null
        ? "—"
        : num(metrics.success_rate * 100, 0) + " %",
      `${metrics?.success_numerator ?? "—"} / ${metrics?.success_denominator ?? "—"} admissibles`,
    ],
    [
      "Durée moyenne",
      metrics?.mean_duration_ms == null
        ? "—"
        : num(metrics.mean_duration_ms / 1000, 2) + " s",
      `${metrics?.duration_count ?? "—"} exécutions terminées`,
    ],
    [
      "Tokens",
      num(metrics?.total_tokens, 0),
      `Couverture ${num((metrics?.usage_coverage || 0) * 100, 0)} %`,
    ],
    [
      "Coût API estimé",
      money(metrics?.api_cost_usd, "USD"),
      "USD · distinct des coûts de flotte",
    ],
    [
      "Erreurs d’outils / modèles",
      num(metrics?.errors, 0),
      "Tentatives échouées uniquement",
    ],
    [
      "Agent le plus sollicité",
      used?.role ? roleName(used.role) : "—",
      `${used?.count ?? "—"} invocations · égalités possibles`,
    ],
    [
      "Agent le plus lent",
      slow?.role ? roleName(slow.role) : "—",
      `${num((slow?.mean_duration_ms || 0) / 1000, 3)} s · n=${slow?.count ?? 0}`,
    ],
  ];
  return (
    <div className="kpi-group">
      {values.map(([label, value, caption]) => (
        <div key={label}>
          <span>{label}</span>
          <strong className={value.length > 18 ? "small-value" : ""}>
            {value}
          </strong>
          <small>{caption}</small>
        </div>
      ))}
    </div>
  );
}
export function Outputs({
  detail,
  onSelect,
  active,
  available,
}: {
  detail: RunDetail;
  onSelect: (id: string) => void;
  active: string;
  available?: Set<string>;
}) {
  return (
    <div className="panel outputs-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TRAVAIL DES AGENTS</span>
          <h2>Cinq rôles, des résultats lisibles</h2>
        </div>
        <span className="badge neutral">
          {detail.provenance === "fixture"
            ? "Exécution déterministe"
            : "Exécution IA"}
        </span>
      </div>
      <div className="outputs-list">
        {detail.agents.map((a, i) => {
          const visible = !available || available.has(a.id);
          return (
            <button
              key={a.id}
              className={"agent-output " + (active === a.id ? "active" : "")}
              onClick={() => onSelect(a.id)}
            >
              <span className="agent-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="agent-info">
                <strong>{roleName(a.role)}</strong>
                <span>
                  {visible
                    ? outputSummary(a)
                    : "Résultat indisponible à cet instant"}
                </span>
              </div>
              <span className="agent-timing">
                {a.status === "pending" || a.status === "running"
                  ? "—"
                  : `${num(a.duration_ms / 1000, 3)} s`}
              </span>
              <span className={"agent-check " + (visible ? "" : "pending")}>
                <Check size={13} />
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
function outputSummary(agent: Agent) {
  const o = agent.output;
  for (const key of ["summary", "decision", "verdict", "message", "status"])
    if (typeof o[key] === "string") return String(o[key]).slice(0, 180);
  if (agent.role === "planning")
    return "Ordre de travail, contraintes et résultat final";
  if (agent.role === "traffic")
    return "Matrice figée et hypothèses de circulation";
  if (agent.role === "optimization")
    return "Plan de référence et proposition du solveur";
  if (agent.role === "monitoring")
    return "Certificat de faisabilité et résultats simulés";
  return "Évaluation des incidents et décision de replanification";
}
export function OutputInspector({
  agent,
  detail,
  visible = true,
  onClose,
}: {
  agent: Agent;
  detail: RunDetail;
  visible?: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = JSON.stringify(agent.output, null, 2),
    preview = content.slice(0, expanded ? 60000 : 5000);
  return (
    <aside className="panel inspector">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">RÉSULTAT DE L’AGENT</span>
          <h2>{roleName(agent.role)}</h2>
        </div>
        <button
          onClick={onClose}
          className="icon-button"
          aria-label="Fermer le résultat"
        >
          ×
        </button>
      </div>
      <div className="inspector-meta">
        <span className="badge good">
          {visible ? statusLabel(agent.status) : "Non disponible à cet instant"}
        </span>
        <span>
          Version 1 ·{" "}
          {detail.provenance === "fixture" ? "démonstration" : "direct"}
        </span>
      </div>
      <h3>
        {visible
          ? outputSummary(agent)
          : "La lecture respecte le temps des agents"}
      </h3>
      {visible && (
        <>
          <dl>
            <div>
              <dt>Producteur</dt>
              <dd>{agent.name}</dd>
            </div>
            <div>
              <dt>Modèle</dt>
              <dd>
                {agent.model ||
                  (agent.requested_model
                    ? `${agent.requested_model} · demandé, réponse indisponible`
                    : "Aucun · déterministe")}
              </dd>
            </div>
            <div>
              <dt>Tokens entrée / sortie</dt>
              <dd>
                {num(agent.input_tokens, 0)} / {num(agent.output_tokens, 0)}
              </dd>
            </div>
            <div>
              <dt>Coût API estimé</dt>
              <dd>{money(agent.cost, "USD")} · distinct de la flotte</dd>
            </div>
            <div>
              <dt>Durée réelle</dt>
              <dd>{num(agent.duration_ms / 1000, 3)} s</dd>
            </div>
            <div>
              <dt>Fin</dt>
              <dd>
                {agent.finished_at
                  ? new Date(agent.finished_at).toLocaleTimeString("fr-CA", {
                      timeZone: "America/Toronto",
                    })
                  : "Indisponible"}
              </dd>
            </div>
            <div>
              <dt>Statut du résultat</dt>
              <dd>
                {detail.final_kind === "accepted_plan"
                  ? "Plan accepté"
                  : detail.final_kind
                    ? "Diagnostic accepté"
                    : "Résultat intermédiaire"}
              </dd>
            </div>
          </dl>
          <div className="inspector-section">
            <h4>
              <Layers size={14} /> Outils et preuves
            </h4>
            {agent.tool_calls.map((tool, i) => (
              <div className="tool-evidence" key={i}>
                <strong>{String(tool.name || "Outil")}</strong>
                <span>
                  {String(tool.status || "—")} ·{" "}
                  {num(Number(tool.duration_ms || 0), 2)} ms
                </span>
              </div>
            ))}
            {!agent.tool_calls.length && (
              <p>Aucun appel d’outil pour cette étape.</p>
            )}
          </div>
          {detail.certificate && detail.selected_plan && (
            <div className="inspector-section">
              <h4>
                <ShieldCheck size={14} /> Validation du plan
              </h4>
              <p>
                {detail.certificate.valid
                  ? "Certificat indépendant valide"
                  : "Certificat non valide — diagnostic conservé"}{" "}
                ·{" "}
                {detail.certificate.scope === "residual_suffix"
                  ? "suffixe futur"
                  : "plan initial complet"}
              </p>
              <p className="mono">{detail.selected_plan.id}</p>
            </div>
          )}
          <details open className="json-output">
            <summary>
              <FileText size={14} /> Résultat structuré
            </summary>
            <pre>{preview}</pre>
            {content.length > 5000 && (
              <button onClick={() => setExpanded(!expanded)}>
                {expanded ? "Réduire" : "Développer (limite 60 Ko)"}
              </button>
            )}
            {content.length > 60000 && expanded && (
              <p>Le contenu est tronqué à 60 Ko.</p>
            )}
          </details>
          <p className="caption">
            Les décisions observables sont conservées ; aucun raisonnement
            interne n’est demandé.
          </p>
        </>
      )}
    </aside>
  );
}
export function AgentGraph({
  detail,
  onSelect,
  active,
  available,
}: {
  detail: RunDetail;
  onSelect: (id: string) => void;
  active: string;
  available?: Set<string>;
}) {
  const nodes = useMemo(
    () =>
      detail.agents.map((a, i) => ({
        id: a.id,
        position: { x: i * 185, y: 35 },
        data: {
          label: (
            <div className="graph-label">
              <span>
                0{i + 1} · {roleName(a.role)}
              </span>
              <strong>
                {!available || available.has(a.id)
                  ? statusLabel(a.status)
                  : a.status === "running"
                    ? "En cours"
                    : "En attente"}
              </strong>
              <small>
                {a.status === "pending"
                  ? "—"
                  : `${num(a.duration_ms / 1000, 3)} s`}
              </small>
            </div>
          ),
        },
        style: {
          borderColor: active === a.id ? "#167887" : "#dce2e5",
          background: a.status === "running" ? "#fff3df" : active === a.id ? "#edf7f6" : "white",
          width: 160,
          borderRadius: 8,
        },
        ariaLabel: roleName(a.role),
      })),
    [detail.agents, active, available],
  );
  const edges = useMemo(
    () =>
      detail.handoffs
        .filter((h) => h.actual)
        .map((h) => ({
          id: h.id,
          source: h.sender_id,
          target: h.receiver_id,
          label: String(h.run_seq),
          markerEnd: { type: MarkerType.ArrowClosed, color: "#7d969d" },
          style: { stroke: "#8ea8ad" },
          animated: false,
        })),
    [detail.handoffs],
  );
  return (
    <div
      className="graph-container"
      aria-label="Graphe des transmissions observées"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelect(node.id)}
        onEdgeClick={(_, edge) => onSelect(edge.target)}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background gap={20} color="#dce2e5" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
export function RunCharts({
  detail,
  events,
}: {
  detail: RunDetail;
  events: TraceEvent[];
}) {
  const [chart, setChart] = useState("timeline");
  const timeline = useMemo(() => {
    const start = Math.min(
      ...detail.agents
        .filter((a) => a.status !== "pending")
        .map((a) =>
          new Date(
            a.started_at || detail.started_at || detail.created_at,
          ).getTime(),
        ),
    );
    const offsets = detail.agents
      .filter((a) => a.status !== "pending")
      .map((a) =>
        Math.max(
          0,
          (new Date(
            a.started_at || detail.started_at || detail.created_at,
          ).getTime() -
            start) /
            1000,
        ),
      );
    return {
      grid: { left: 115, right: 35, top: 30, bottom: 35 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      xAxis: {
        type: "value",
        name: "Secondes réelles",
        nameLocation: "middle",
        nameGap: 25,
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: detail.agents
          .filter((a) => a.status !== "pending")
          .map((a) => roleName(a.role)),
      },
      series: [
        {
          type: "bar",
          stack: "time",
          itemStyle: { color: "transparent" },
          emphasis: { disabled: true },
          data: offsets,
        },
        {
          type: "bar",
          stack: "time",
          barWidth: 18,
          data: detail.agents
            .filter((a) => a.status !== "pending")
            .map((a, i) => ({
              value: a.duration_ms / 1000,
              itemStyle: { color: palette[i % 5], borderRadius: 3 },
            })),
        },
      ],
    };
  }, [detail]);
  const flows = useMemo(() => {
    const counts = new Map<string, number>();
    detail.handoffs
      .filter((h) => h.actual)
      .forEach((h) => {
        const key = h.sender_role + "|" + h.receiver_role;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    const links = [...counts].map(([key, value]) => {
      const [a, b] = key.split("|");
      return {
        source: "De · " + roleName(a),
        target: "Vers · " + roleName(b),
        value,
      };
    });
    return {
      tooltip: { renderMode: "richText" },
      series: [
        {
          type: "sankey",
          left: 20,
          right: 130,
          top: 20,
          bottom: 25,
          nodeAlign: "left",
          layoutIterations: 0,
          data: [...new Set(links.flatMap((l) => [l.source, l.target]))].map(
            (name, i) => ({
              name,
              depth: name.startsWith("De") ? 0 : 1,
              itemStyle: { color: palette[i % 5] },
            }),
          ),
          links,
          lineStyle: { color: "source", opacity: 0.2 },
          label: { fontSize: 12 },
        },
      ],
    };
  }, [detail.handoffs]);
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">HORLOGE RÉELLE DES AGENTS</span>
          <h2>De l’intention au résultat</h2>
        </div>
        <div className="segmented">
          <button
            className={chart === "timeline" ? "active" : ""}
            onClick={() => setChart("timeline")}
          >
            <Clock size={13} />
            Chronologie
          </button>
          <button
            className={chart === "flow" ? "active" : ""}
            onClick={() => setChart("flow")}
          >
            <GitBranch size={13} />
            Transmissions
          </button>
        </div>
      </div>
      {detail.agents.some((a) => a.status !== "pending") ? (
        <Chart
          option={chart === "timeline" ? timeline : flows}
          label={
            chart === "timeline"
              ? "Durées et débuts des invocations, en secondes réelles"
              : "Nombre de transmissions observées entre émetteurs et destinataires"
          }
        />
      ) : (
        <p className="empty">Aucune invocation commencée à cet instant.</p>
      )}
      <div className="chart-caption">
        {chart === "timeline"
          ? `${detail.agents.length} invocations · durée totale de la mission ${num((detail.duration_ms || 0) / 1000, 2)} s. Les durées des agents peuvent se chevaucher.`
          : `${detail.handoffs.filter((h) => h.actual).length} transmissions observées. La largeur mesure les messages, avec deux identités distinctes par rôle.`}
      </div>
      <details className="data-alternative">
        <summary>Consulter les données et les tentatives</summary>
        {chart === "timeline" ? (
          <table>
            <thead>
              <tr>
                <th>Agent / outil</th>
                <th>Durée réelle</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {detail.agents.flatMap((a) => [
                <tr key={a.id}>
                  <td>{roleName(a.role)}</td>
                  <td>{num(a.duration_ms, 3)} ms</td>
                  <td>{statusLabel(a.status)}</td>
                </tr>,
                ...a.tool_calls.map((t, i) => (
                  <tr key={a.id + i}>
                    <td>↳ {String(t.name)}</td>
                    <td>{num(Number(t.duration_ms), 3)} ms</td>
                    <td>{String(t.status)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Séquence</th>
                <th>Émetteur</th>
                <th>Destinataire</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {detail.handoffs.map((h) => (
                <tr key={h.id}>
                  <td>{h.run_seq}</td>
                  <td>{roleName(h.sender_role)}</td>
                  <td>{roleName(h.receiver_role)}</td>
                  <td>{h.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          {events.length} événements chargés ; erreurs et reprises sont
          conservées dans le journal.
        </p>
      </details>
    </div>
  );
}
export function CohortCharts({ metrics }: { metrics: Cohort }) {
  const bar = useMemo(
    () => ({
      grid: { left: 115, right: 45, top: 25, bottom: 45 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      xAxis: {
        type: "value",
        name: "Durée moyenne (ms)",
        nameLocation: "middle",
        nameGap: 30,
      },
      yAxis: {
        type: "category",
        data: metrics.agents.map((a) => roleName(a.role)),
        inverse: true,
      },
      series: [
        {
          type: "bar",
          barWidth: 20,
          data: metrics.agents.map((a, i) => ({
            value: a.mean_duration_ms,
            itemStyle: { color: palette[i % 5], borderRadius: [0, 3, 3, 0] },
          })),
        },
      ],
    }),
    [metrics],
  );
  const heat = useMemo(() => {
    const roles = metrics.agents.map((a) => a.role);
    const scenarios = [
      ...new Set(metrics.scenario_agents.map((a) => a.scenario_id)),
    ];
    return {
      grid: { left: 65, right: 25, top: 20, bottom: 75 },
      tooltip: { renderMode: "richText" },
      xAxis: {
        type: "category",
        data: roles.map(roleName),
        splitArea: { show: true },
        axisLabel: { interval: 0 },
      },
      yAxis: { type: "category", data: scenarios, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max: Math.max(
          1,
          ...metrics.scenario_agents.map((a) => a.mean_duration_ms || 0),
        ),
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: { color: ["#ecf5f3", "#b5d9d2", "#167887"] },
        text: ["ms", "0"],
      },
      series: [
        {
          type: "heatmap",
          data: metrics.scenario_agents.map((a) => [
            roles.indexOf(a.role),
            scenarios.indexOf(a.scenario_id),
            a.mean_duration_ms,
          ]),
          label: {
            show: true,
            formatter: (p: { value: number[] }) => num(p.value[2], 1),
          },
          itemStyle: { borderColor: "#fff", borderWidth: 4 },
        },
      ],
    };
  }, [metrics]);
  return (
    <div className="chart-grid">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">COMPARAISON PAR AGENT</span>
            <h2>Où passe le temps ?</h2>
          </div>
          <ArrowUpRight size={16} />
        </div>
        {metrics.agents.length ? (
          <Chart
            option={bar}
            label="Durée moyenne réelle par agent en millisecondes"
          />
        ) : (
          <div className="empty">Aucune invocation mesurée.</div>
        )}
        <div className="chart-caption">
          Durées réelles par invocation terminée. Coûts API :{" "}
          {metrics.api_cost_usd == null
            ? "indisponibles pour les démonstrations déterministes"
            : money(metrics.api_cost_usd, "USD")}
          .
        </div>
        <details className="data-alternative">
          <summary>Table des durées et effectifs</summary>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Moyenne ms</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {metrics.agents.map((a) => (
                <tr key={a.role}>
                  <td>{roleName(a.role)}</td>
                  <td>{num(a.mean_duration_ms, 3)}</td>
                  <td>{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SCÉNARIO × AGENT</span>
            <h2>Latence des opérations</h2>
          </div>
          <Layers size={16} />
        </div>
        {metrics.scenario_agents.length ? (
          <Chart
            option={heat}
            label="Durée moyenne réelle par scénario et agent en millisecondes"
          />
        ) : (
          <div className="empty">Aucune cellule mesurée.</div>
        )}
        <div className="chart-caption">
          Chaque cellule représente une moyenne observée ; les scénarios absents
          ne valent pas zéro.
        </div>
        <details className="data-alternative">
          <summary>Table des cellules et effectifs</summary>
          <table>
            <thead>
              <tr>
                <th>Scénario</th>
                <th>Agent</th>
                <th>Moyenne ms</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {metrics.scenario_agents.map((a) => (
                <tr key={a.scenario_id + a.role}>
                  <td>{a.scenario_id}</td>
                  <td>{roleName(a.role)}</td>
                  <td>{num(a.mean_duration_ms, 3)}</td>
                  <td>{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
