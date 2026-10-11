import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  GitCompareArrows,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  X,
  AlertCircle,
  Radio,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
import type {
  Cohort,
  Detail,
  RunDetail,
  Run,
  Scenario,
  TraceEvent,
} from "./types";
import {
  comparable,
  comparisonCandidate,
  delta,
  filterRuns,
  mergeEvents,
  money,
  num,
  readSelection,
  selectionSearch,
  statusLabel,
  clock,
  montrealZone,
} from "./state";
import type { Selection, View } from "./state";
import { CertificateBadge, Exceptions, Fleet, FleetStats } from "./Fleet";
import {
  AgentGraph,
  OutputInspector,
  Outputs,
  roleName,
  RunCharts,
} from "./Observability";
import { Replay } from "./Replay";
import { hasArtifacts } from "./types";
import { agentSnapshot, simulationSnapshot } from "./replayState";
import { useDialog } from "./useDialog";
import { Chart } from "./Chart";
import { Metering } from "./Metering";
import { OverallCost } from "./OverallCost";
import { Analytics } from "./Analytics";
import {
  ActiveFilters,
  AgentViewSelector,
  WorkspaceNavigation,
  clearedFilters,
  selectionFilters,
} from "./WorkspaceControls";
const Dispatch = lazy(() =>
  import("./Dispatch").then((module) => ({ default: module.Dispatch })),
);
const headings: Record<View, [string, string]> = {
  dispatch: [
    "Commandes et répartition",
    "Centralisez les demandes montréalaises, comparez les tournées et contrôlez leur départ simulé.",
  ],
  analytics: [
    "Analytique des opérations",
    "Explorez les coûts, les tokens et les performances par agent et modèle.",
  ],
  overview: [
    "Résumé de l’exécution",
    "Le résultat du plan sélectionné, ses exceptions et son certificat.",
  ],
  fleet: [
    "Plan de livraison simulé",
    "Inspectez les visites, les contraintes et chaque résultat de la journée.",
  ],
  runs: [
    "Historique des exécutions",
    "Retrouvez les plans, les diagnostics et leurs preuves.",
  ],
  compare: [
    "Comparer les plans",
    "Même scénario, même graine : des décisions comparables.",
  ],
  observatory: [
    "Observatoire des agents",
    "Suivez le travail réel, les transmissions et les résultats de chaque rôle.",
  ],
};
export default function App() {
  const loadedRun = useRef("");
  const [selection, setSelection] = useState(() =>
    readSelection(location.search),
  );
  const [runs, setRuns] = useState<Run[]>([]),
    [runTotal, setRunTotal] = useState<number | null>(null),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [metrics, setMetrics] = useState<Cohort | null>(null),
    [rawDetail, setDetail] = useState<RunDetail | null>(null),
    [events, setEvents] = useState<TraceEvent[]>([]),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [error, setError] = useState(""),
    [detailError, setDetailError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [activeAgent, setActiveAgent] = useState(""),
    [drawer, setDrawer] = useState(false),
    [creating, setCreating] = useState(false),
    [createError, setCreateError] = useState(""),
    [replayIndex, setReplayIndex] = useState<number | null>(null),
    [simIndex, setSimIndex] = useState<number | null>(null),
    [showFilters, setShowFilters] = useState(false),
    [sort, setSort] = useState("recent");
  const [health, setHealth] = useState<{
    live_available: boolean;
    live_unavailable_reasons: string[];
  } | null>(null);
  const [mode, setMode] = useState("fixture");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const modalRef = useRef<HTMLElement>(null),
    inspectorRef = useRef<HTMLDivElement>(null);
  useDialog(modalRef, drawer, () => {
    if (!creating) setDrawer(false);
  });
  useDialog(inspectorRef, !!activeAgent, () => setActiveAgent(""));
  useEffect(() => {
    const controller = new AbortController();
    api<typeof health>("/health", controller.signal)
      .then(setHealth)
      .catch(() => setHealth(null));
    return () => controller.abort();
  }, [drawer]);
  const detail = useMemo(
    () => (rawDetail ? agentSnapshot(rawDetail, events, replayIndex) : null),
    [rawDetail, events, replayIndex],
  );
  const fleetDetail = useMemo(
    () =>
      detail && hasArtifacts(detail)
        ? simulationSnapshot(detail, simIndex)
        : null,
    [detail, simIndex],
  );
  const visibleEvents =
    replayIndex == null ? events : events.slice(0, replayIndex + 1);
  const update = useCallback((change: Partial<Selection>, replace = false) => {
    const next = { ...readSelection(location.search), ...change };
    const search = selectionSearch(next);
    if (search !== location.search) {
      if (replace) history.replaceState({}, "", search);
      else history.pushState({}, "", search);
    }
    setSelection(next);
  }, []);
  useEffect(() => {
    const pop = () => setSelection(readSelection(location.search));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const p = new URLSearchParams();
    for (const key of [
      "scenario",
      "status",
      "policy",
      "agent",
      "model",
    ] as const)
      if (selection[key])
        p.set(key === "scenario" ? "scenario_id" : key, selection[key]);
    p.set("limit", "200");
    Promise.all([
      api<{ items: Run[]; total: number }>("/runs?" + p, controller.signal),
      api<{ items: Scenario[] }>("/scenarios", controller.signal),
      api<Cohort>("/metrics?" + p, controller.signal),
    ])
      .then(([r, s, m]) => {
        setRuns(r.items);
        setRunTotal(r.total);
        setScenarios(s.items);
        setMetrics(m);
        if (!selection.run && r.items.length) update({ run: r.items[0].id });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    selection.scenario,
    selection.status,
    selection.policy,
    selection.agent,
    selection.model,
    refresh,
  ]);
  useEffect(() => {
    if (!selection.run) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    const changingRun = loadedRun.current !== selection.run;
    if (changingRun) setDetailLoading(true);
    setDetailError("");
    if (changingRun) {
      setReplayIndex(null);
      setSimIndex(null);
      setActiveAgent("");
      setDetail(null);
      setEvents([]);
    }
    Promise.all([
      api<RunDetail>(
        "/runs/" + encodeURIComponent(selection.run),
        controller.signal,
      ),
      api<{ items: TraceEvent[] }>(
        "/runs/" + encodeURIComponent(selection.run) + "/events?limit=500",
        controller.signal,
      ),
    ])
      .then(([d, e]) => {
        loadedRun.current = d.id;
        setDetail(d);
        setEvents(e.items);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setDetailError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selection.run, refresh]);
  useEffect(() => {
    if (!rawDetail || !["queued", "running"].includes(rawDetail.status)) return;
    const stream = new EventSource("/api/v1/runs/" + rawDetail.id + "/stream");
    const receive = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as TraceEvent;
        setEvents((old) => mergeEvents(old, [parsed]));
        if (
          [
            "run.completed",
            "run.failed",
            "run.cancelled",
            "run.timed_out",
            "run.budget_exceeded",
          ].includes(parsed.kind)
        )
          setRefresh((n) => n + 1);
      } catch {
        /* An invalid stream frame is ignored; explicit refresh remains available. */
      }
    };
    stream.addEventListener("genesis", receive);
    const interval = setInterval(() => setRefresh((n) => n + 1), 5000);
    return () => {
      stream.removeEventListener("genesis", receive);
      stream.close();
      clearInterval(interval);
    };
  }, [rawDetail?.id, rawDetail?.status]);
  const filtered = useMemo(() => {
    const list = filterRuns(runs, selection);
    return sort === "distance"
      ? [...list].sort(
          (a, b) =>
            (a.metrics?.distance_km ?? Infinity) -
            (b.metrics?.distance_km ?? Infinity),
        )
      : sort === "duration"
        ? [...list].sort(
            (a, b) => (a.duration_ms ?? Infinity) - (b.duration_ms ?? Infinity),
          )
        : list;
  }, [runs, selection, sort]);
  const selectRun = (id: string, view?: View) => {
    update({ run: id, ...(view ? { view } : {}) });
    setActiveAgent("");
  };
  const currentEvent = replayIndex == null ? null : events[replayIndex];
  const available = useMemo(() => {
    if (!detail || replayIndex == null) return undefined;
    const completed = new Set(
      events
        .slice(0, replayIndex + 1)
        .filter(
          (e) => e.kind === "agent.completed" || e.kind === "agent.failed",
        )
        .map((e) => e.invocation_id || String(e.payload.agent_id || "")),
    );
    return new Set(
      detail.agents.filter((a) => completed.has(a.id)).map((a) => a.id),
    );
  }, [detail, events, replayIndex]);
  const routeAvailable =
    replayIndex == null ||
    events
      .slice(0, replayIndex + 1)
      .some((e) =>
        ["route.validated", "validation.completed", "run.completed"].includes(
          e.kind,
        ),
      );
  const agent = detail?.agents.find((a) => a.id === activeAgent);
  const title = headings[selection.view];
  async function createRun(form: HTMLFormElement) {
    const data = new FormData(form);
    if (mode === "live" && !health?.live_available) {
      setCreateError("Le mode direct est indisponible.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const run = await api<Run>("/runs", undefined, {
        scenario_id: data.get("scenario"),
        policy: data.get("policy"),
        seed: Number(data.get("seed")),
        mode,
        ...(mode === "live"
          ? { budget_usd: String(data.get("budget_usd")) }
          : {}),
      });
      setDrawer(false);
      update({ run: run.id, view: "observatory", scenario: "", status: "" });
      setRefresh((n) => n + 1);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          aria-label="Genesis — opérations"
          href="?view=dispatch"
          onClick={(e) => {
            e.preventDefault();
            update({ view: "dispatch" });
          }}
        >
          <div className="brand-symbol">
            g<span>·</span>
          </div>
          <div>
            genesis<span>LOGISTICS OBSERVATORY</span>
          </div>
        </a>
        <div className="workspace-label">
          <div className="workspace-icon">
            <Boxes size={15} />
          </div>
          <div>
            Centre de répartition<small>Montréal, Canada</small>
          </div>
        </div>
        <span className="nav-label">PILOTAGE DES OPÉRATIONS</span>
        <WorkspaceNavigation
          view={selection.view}
          onNavigate={(view) => update({ view })}
        />
        <div className="sidebar-bottom">
          <div className="system-status">
            <i /> Environnement local
            <small>
              {selection.view === "dispatch"
                ? "Carte routière · suivi simulé"
                : "Circulation et livraisons simulées"}
            </small>
          </div>
          <div className="profile">
            <span>GL</span>
            <div>
              Genesis Lab<small>Espace synthétique</small>
            </div>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div>
            <span>ESPACE DE TRAVAIL</span>
            <ChevronRight size={13} />
            <strong>{title[0]}</strong>
          </div>
          <div className="topbar-right">
            <span className="timezone">Montréal · {montrealZone(now)}</span>
            <span className="demo-tag">
              <Radio size={12} />
              Démonstration
            </span>
            <span className="avatar">GL</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                OPÉRATIONS /{" "}
                {selection.view === "observatory"
                  ? "INTELLIGENCE COLLECTIVE"
                  : "LOGISTIQUE"}
              </div>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
            </div>
            {selection.view !== "dispatch" && (
              <div className="page-actions">
                <button
                  className="button secondary"
                  onClick={() => setRefresh((n) => n + 1)}
                  aria-label="Actualiser les données"
                >
                  <RefreshCw size={14} />
                  <span>Actualiser</span>
                </button>
                {selection.view !== "analytics" && (
                  <button
                    className="button primary"
                    onClick={() => {
                      setDrawer(true);
                      setCreateError("");
                    }}
                  >
                    <Plus size={15} />
                    Nouvelle exécution
                  </button>
                )}
              </div>
            )}
          </div>
          <AgentViewSelector
            view={selection.view}
            onNavigate={(view) => update({ view })}
          />
          {selection.view !== "dispatch" && (
            <div className="filter-bar">
              <div className="filter-primary">
                <label>
                  <SlidersHorizontal size={14} />
                  <select
                    aria-label="Filtrer par scénario"
                    value={selection.scenario}
                    onChange={(e) => update({ scenario: e.target.value })}
                  >
                    <option value="">Tous les scénarios</option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                <div className="filter-divider" />
                <label>
                  <select
                    aria-label="Filtrer par politique"
                    value={selection.policy}
                    onChange={(e) => update({ policy: e.target.value })}
                  >
                    <option value="">Toutes les politiques</option>
                    <option value="baseline_only">Référence</option>
                    <option value="solver_with_one_replan">
                      Solveur + replanification
                    </option>
                  </select>
                  <ChevronDown size={12} />
                </label>
                <button
                  className={"filter-more " + (showFilters ? "active" : "")}
                  aria-expanded={showFilters}
                  aria-controls="advanced-filters"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Plus size={12} />
                  Filtres
                  {selectionFilters(selection).length > 0 && (
                    <span className="filter-count">
                      {selectionFilters(selection).length}
                    </span>
                  )}
                </button>
              </div>
              <span
                className="snapshot-label"
                data-state={error ? "stale" : loading ? "loading" : "ready"}
              >
                <i />
                {error
                  ? "Actualisation indisponible"
                  : loading
                    ? "Chargement…"
                    : "Dernier état enregistré"}
                <small>
                  {metrics?.refreshed_at
                    ? new Date(metrics.refreshed_at).toLocaleTimeString(
                        "fr-CA",
                        {
                          timeZone: "America/Toronto",
                        },
                      )
                    : ""}
                </small>
              </span>
            </div>
          )}
          {selection.view !== "dispatch" && showFilters && (
            <div className="advanced-filters" id="advanced-filters">
              <label>
                Statut
                <select
                  value={selection.status}
                  onChange={(e) => update({ status: e.target.value })}
                >
                  <option value="">Tous</option>
                  {[
                    "succeeded",
                    "failed",
                    "running",
                    "queued",
                    "cancelled",
                    "timed_out",
                    "budget_exceeded",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Agent
                <select
                  value={selection.agent}
                  onChange={(e) => update({ agent: e.target.value })}
                >
                  <option value="">Tous</option>
                  {[
                    "planning",
                    "traffic",
                    "optimization",
                    "monitoring",
                    "exception",
                  ].map((r) => (
                    <option key={r} value={r}>
                      {roleName(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Modèle
                <input
                  value={selection.model}
                  onChange={(e) => update({ model: e.target.value }, true)}
                  placeholder="Identifiant du modèle"
                />
              </label>
              <button onClick={() => update(clearedFilters)}>
                Réinitialiser
              </button>
            </div>
          )}
          {selection.view !== "dispatch" && (
            <ActiveFilters selection={selection} onChange={update} />
          )}
          {selection.view === "dispatch" ? (
            <Suspense
              fallback={
                <p className="notice" role="status">
                  Chargement de la carte de Montréal…
                </p>
              }
            >
              <Dispatch />
            </Suspense>
          ) : error ? (
            <div className="error-state" role="alert">
              <AlertCircle size={22} />
              <div>
                <h2>Les données ne sont pas disponibles</h2>
                <p>{error}</p>
                <button
                  className="button secondary"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : loading && !runs.length ? (
            <div className="loading-state" role="status">
              <LoaderCircle className="spin" />
              Chargement de l’observatoire…
            </div>
          ) : (
            <>
              {selection.view === "analytics" && <OverallCost />}
              {selection.view === "analytics" ? (
                <Analytics
                  selection={selection}
                  onFilter={update}
                  refreshKey={refresh}
                />
              ) : selection.view === "runs" ? (
                <RunInventory
                  runs={filtered}
                  selected={selection.run}
                  onSelect={(id) => selectRun(id, "fleet")}
                  selection={selection}
                  update={update}
                  sort={sort}
                  setSort={setSort}
                  total={runTotal}
                  loaded={runs.length}
                />
              ) : selection.view === "compare" ? (
                <Compare runs={runs} selection={selection} update={update} />
              ) : (
                <>
                  <div className="selected-run-bar">
                    <div>
                      <span className="run-dot" />
                      <span>EXÉCUTION SÉLECTIONNÉE</span>
                      <select
                        aria-label="Sélectionner une exécution"
                        value={selection.run}
                        onChange={(e) => selectRun(e.target.value)}
                      >
                        {!runs.some((r) => r.id === selection.run) &&
                          selection.run && (
                            <option value={selection.run}>
                              {selection.run.slice(0, 8)}
                            </option>
                          )}
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.scenario_id} · {r.scenario_label} ·{" "}
                            {r.policy === "baseline_only"
                              ? "Référence"
                              : "Solveur"}{" "}
                            · {r.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} />
                    </div>
                    {detail && (
                      <div>
                        <span className="muted">
                          {detail.agents.length} agents
                        </span>
                        <span className="badge neutral">
                          {statusLabel(detail.status)}
                        </span>
                        <button
                          className="text-button"
                          onClick={() =>
                            update({
                              view: "compare",
                              left: detail.id,
                              right:
                                runs.find(
                                  (r) =>
                                    r.id !== detail.id && comparable(detail, r),
                                )?.id || "",
                            })
                          }
                        >
                          Comparer
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  {rawDetail &&
                    (selection.view === "observatory" ||
                      selection.view === "overview") &&
                    (selection.view === "overview" ? (
                      <details className="usage-disclosure" key={rawDetail.id}>
                        <summary>
                          <Activity size={17} aria-hidden="true" />
                          <span>
                            Coûts, tokens et appels de cette exécution
                          </span>
                          <ChevronDown size={16} aria-hidden="true" />
                        </summary>
                        <Metering
                          runId={rawDetail.id}
                          asOfSeq={
                            replayIndex == null
                              ? undefined
                              : (currentEvent?.run_seq ?? 0)
                          }
                        />
                      </details>
                    ) : (
                      <Metering
                        runId={rawDetail.id}
                        asOfSeq={
                          replayIndex == null
                            ? undefined
                            : (currentEvent?.run_seq ?? 0)
                        }
                      />
                    ))}
                  {detailError ? (
                    <div className="error-state" role="alert">
                      <AlertCircle />
                      <div>
                        <h2>Cette exécution n’est pas disponible</h2>
                        <p>{detailError}</p>
                      </div>
                    </div>
                  ) : detailLoading ? (
                    <div className="loading-state">
                      <LoaderCircle className="spin" />
                      Chargement du plan et de ses preuves…
                    </div>
                  ) : !detail ? (
                    <div className="empty-state">
                      <Boxes size={28} />
                      <h2>Aucune exécution enregistrée</h2>
                      <p>
                        Lancez une démonstration déterministe pour créer un plan
                        et des traces.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setDrawer(true)}
                      >
                        Nouvelle exécution
                      </button>
                    </div>
                  ) : !hasArtifacts(detail) ? (
                    <div className="empty-state">
                      {["queued", "running"].includes(
                        rawDetail?.status || "",
                      ) ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <AlertCircle />
                      )}
                      <h2>
                        {replayIndex != null
                          ? "État historique des agents"
                          : detail.workflow_kind === "broker" &&
                              detail.final_kind
                            ? detail.final_output?.feasible
                              ? "Plan courtier préparé"
                              : "Diagnostic courtier"
                            : statusLabel(detail.status)}
                      </h2>
                      <p>
                        {replayIndex != null
                          ? "Le plan et son certificat ne sont pas encore disponibles à cet événement."
                          : detail.workflow_kind === "broker" &&
                              detail.final_kind
                            ? String(
                                detail.final_output?.summary ||
                                  "Analyse des affectations terminée.",
                              )
                            : ["queued", "running"].includes(detail.status)
                              ? "Les agents préparent le plan. Les résultats apparaîtront lorsqu’ils seront enregistrés."
                              : "Cette exécution est terminée sans plan validé. Les preuves disponibles restent consultables."}
                      </p>
                      {detail.error && (
                        <p role="alert">
                          {detail.error.code} · {detail.error.message}
                        </p>
                      )}
                      {detail.workflow_kind === "broker" &&
                        replayIndex == null &&
                        detail.final_kind && (
                          <div
                            className="panel"
                            style={{ textAlign: "left", width: "100%" }}
                          >
                            <div className="panel-heading">
                              <h2>Affectations et preuves du courtier</h2>
                              <button
                                className="button secondary"
                                onClick={() => update({ view: "dispatch" })}
                              >
                                Voir les trajets à Montréal
                              </button>
                            </div>
                            <p>
                              {detail.created_trip_ids?.length || 0} trajet(s)
                              préparé(s). Géométrie routière réelle, positions
                              simulées. Les modèles expliquent les résultats des
                              outils et du solveur.
                            </p>
                            <details className="data-alternative">
                              <summary>
                                Solution, alternatives et certificat
                              </summary>
                              <pre className="json-output">
                                {JSON.stringify(
                                  {
                                    solution: detail.broker_solution,
                                    alternatives: detail.candidates,
                                    certificate: detail.certificate,
                                    trip_ids: detail.created_trip_ids,
                                    final: detail.final_output,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                        )}
                      {!["queued", "running"].includes(
                        rawDetail?.status || "",
                      ) &&
                        replayIndex == null && (
                          <button
                            className="button secondary"
                            onClick={() => setDrawer(true)}
                          >
                            Nouvelle tentative
                          </button>
                        )}
                      <Replay
                        label="Horloge réelle des agents"
                        count={events.length}
                        index={replayIndex ?? Math.max(0, events.length - 1)}
                        onChange={setReplayIndex}
                        description={
                          currentEvent
                            ? `${currentEvent.kind} · événement ${currentEvent.run_seq}`
                            : "État enregistré"
                        }
                      />
                      {replayIndex != null && (
                        <button
                          className="text-button"
                          onClick={() => setReplayIndex(null)}
                        >
                          Revenir au résultat final
                        </button>
                      )}
                      <AgentGraph
                        detail={detail}
                        active={activeAgent}
                        onSelect={setActiveAgent}
                        available={available}
                      />
                      <Outputs
                        detail={detail}
                        active={activeAgent}
                        onSelect={setActiveAgent}
                        available={available}
                      />
                      <RunCharts detail={detail} events={visibleEvents} />
                      <details className="data-alternative">
                        <summary>
                          Journal partiel ({visibleEvents.length} événements)
                        </summary>
                        <ol>
                          {visibleEvents.map((e) => (
                            <li key={e.event_id}>
                              {e.run_seq} · {e.kind}
                            </li>
                          ))}
                        </ol>
                      </details>
                      {["queued", "running"].includes(
                        rawDetail?.status || "",
                      ) && (
                        <button
                          className="button secondary"
                          onClick={async () => {
                            await api(
                              "/runs/" + detail.id + "/cancel",
                              undefined,
                              {},
                            );
                            setRefresh((n) => n + 1);
                          }}
                        >
                          Demander l’annulation
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {selection.view !== "observatory" && (
                        <FleetStats detail={fleetDetail || detail} />
                      )}
                      {selection.view === "overview" ? (
                        <>
                          <div className="overview-grid">
                            <Fleet detail={fleetDetail || detail} compact />
                            <Exceptions detail={fleetDetail || detail} />
                          </div>
                          <div className="overview-bottom">
                            <Outputs
                              detail={detail}
                              active={activeAgent}
                              onSelect={setActiveAgent}
                            />
                            <div className="panel final-panel">
                              <span className="eyebrow">DÉCISION FINALE</span>
                              <div className="final-icon">
                                <ShieldCheck size={22} />
                              </div>
                              <h2>
                                {detail.final_kind === "accepted_plan"
                                  ? "Un plan, des preuves."
                                  : "Un diagnostic explicite."}
                              </h2>
                              <p>
                                {detail.certificate.valid
                                  ? `${detail.certificate.served} livraisons planifiées et vérifiées indépendamment. La journée simulée reste évaluée séparément.`
                                  : "Les contraintes incompatibles sont documentées. Aucun résultat invalide n’est présenté comme une tournée faisable."}
                              </p>
                              <button
                                className="text-button"
                                onClick={() => update({ view: "fleet" })}
                              >
                                Inspecter la feuille de route
                                <ArrowRight size={15} />
                              </button>
                              <div className="final-footer">
                                <CertificateBadge detail={detail} />
                                <span>
                                  {num((detail.duration_ms || 0) / 1000, 2)} s
                                  réelles
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : selection.view === "fleet" ? (
                        <>
                          <Replay
                            label="Horloge de livraison simulée"
                            count={detail.simulation.events.length}
                            index={
                              simIndex ??
                              Math.max(0, detail.simulation.events.length - 1)
                            }
                            onChange={setSimIndex}
                            description={
                              simIndex == null
                                ? "Journée terminée"
                                : `${clock(detail.simulation.events[simIndex]?.sim_time_s || 0)} · ${detail.simulation.events[simIndex]?.kind || ""}`
                            }
                          />
                          <Fleet
                            detail={fleetDetail || detail}
                            simEvent={
                              simIndex == null
                                ? undefined
                                : detail.simulation.events[simIndex]
                            }
                          />
                          <details className="panel data-alternative">
                            <summary>Journal de la simulation</summary>
                            <table>
                              <thead>
                                <tr>
                                  <th>Heure de livraison</th>
                                  <th>Événement</th>
                                  <th>Véhicule</th>
                                  <th>Livraison</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(fleetDetail?.simulation.events || []).map(
                                  (e) => (
                                    <tr key={e.id}>
                                      <td>{clock(e.sim_time_s)}</td>
                                      <td>{e.kind}</td>
                                      <td>{e.vehicle_id || "—"}</td>
                                      <td>{e.stop_id || "—"}</td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          </details>
                        </>
                      ) : (
                        <>
                          <div className="section-title">
                            <div>
                              <span className="eyebrow">
                                GRAPHE DES RÔLES · TRANSMISSIONS OBSERVÉES
                              </span>
                              <h2>Une chaîne de décisions traçable</h2>
                            </div>
                            <span className="muted">
                              {detail.handoffs.length} transmissions
                            </span>
                          </div>
                          <div className="panel">
                            <AgentGraph
                              detail={detail}
                              active={activeAgent}
                              onSelect={setActiveAgent}
                              available={available}
                            />
                          </div>
                          <Replay
                            label="Horloge réelle des agents"
                            count={events.length}
                            index={
                              replayIndex ?? Math.max(0, events.length - 1)
                            }
                            onChange={setReplayIndex}
                            description={
                              currentEvent
                                ? `${currentEvent.kind} · événement ${currentEvent.run_seq}`
                                : "État final enregistré"
                            }
                          />
                          {replayIndex != null && (
                            <button
                              className="text-button return-final"
                              onClick={() => setReplayIndex(null)}
                            >
                              Revenir au résultat final
                              <ArrowRight size={13} />
                            </button>
                          )}
                          <Outputs
                            detail={detail}
                            active={activeAgent}
                            onSelect={setActiveAgent}
                            available={available}
                          />
                          {!routeAvailable && (
                            <p className="notice">
                              Le plan final est masqué : aucun certificat
                              n’était encore disponible à cet événement.
                            </p>
                          )}
                          <RunCharts detail={detail} events={visibleEvents} />
                          <details className="panel data-alternative">
                            <summary>
                              Journal ordonné de l’exécution ({events.length}{" "}
                              événements)
                            </summary>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Séquence</th>
                                    <th>Événement</th>
                                    <th>Heure réelle Montréal</th>
                                    <th>Invocation</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(replayIndex == null
                                    ? events
                                    : events.slice(0, replayIndex + 1)
                                  ).map((e) => (
                                    <tr key={e.event_id}>
                                      <td>{e.run_seq}</td>
                                      <td>{e.kind}</td>
                                      <td>
                                        {new Date(
                                          e.occurred_at,
                                        ).toLocaleTimeString("fr-CA", {
                                          timeZone: "America/Toronto",
                                        })}
                                      </td>
                                      <td className="mono">
                                        {e.invocation_id?.slice(0, 8) || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <i />
              GENESIS OBSERVATORY
            </span>
            <span>
              {selection.view === "dispatch"
                ? "Rues OpenStreetMap · positions simulées · aucune livraison réelle"
                : "Données synthétiques · Aucune livraison réelle · Les démonstrations ne comptent pas comme expériences IA"}
            </span>
          </footer>
        </main>
      </div>
      {agent && detail && (
        <div className="inspector-backdrop" onClick={() => setActiveAgent("")}>
          <div
            ref={inspectorRef}
            role="dialog"
            aria-modal="true"
            aria-label="Résultat de l’agent"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <OutputInspector
              key={agent.id}
              agent={agent}
              detail={detail}
              visible={!available || available.has(agent.id)}
              onClose={() => setActiveAgent("")}
            />
          </div>
        </div>
      )}
      {drawer && (
        <div
          className="modal-backdrop"
          onClick={() => !creating && setDrawer(false)}
        >
          <section
            className="run-modal"
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Fermer la nouvelle exécution"
              onClick={() => setDrawer(false)}
              disabled={creating}
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <Plus size={23} />
            </div>
            <span className="eyebrow">NOUVELLE MISSION</span>
            <h2 id="new-title">Préparer une journée de livraison</h2>
            <p>
              Une démonstration déterministe produit les tournées, les
              certificats et les traces des cinq rôles.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createRun(e.currentTarget);
              }}
            >
              <label>
                Scénario
                <select
                  name="scenario"
                  defaultValue={
                    selection.scenario === "BROKER"
                      ? "S01"
                      : selection.scenario || "S01"
                  }
                  required
                >
                  {scenarios
                    .filter((s) => s.id !== "BROKER")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Politique logistique
                <select name="policy" defaultValue="solver_with_one_replan">
                  <option value="solver_with_one_replan">
                    Solveur avec une replanification permise
                  </option>
                  <option value="baseline_only">Référence déterministe</option>
                </select>
              </label>
              <label>
                Graine de la journée
                <input
                  type="number"
                  name="seed"
                  defaultValue={17}
                  min={0}
                  max={2147483647}
                  required
                />
              </label>
              <label>
                Mode d’exécution
                <select
                  name="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="fixture">
                    Démonstration déterministe · sans coût API
                  </option>
                  <option value="live" disabled={!health?.live_available}>
                    IA en direct
                    {health?.live_available ? "" : " · indisponible"}
                  </option>
                </select>
              </label>
              {mode === "live" ? (
                <label>
                  Budget maximal de cette exécution (USD)
                  <input
                    type="number"
                    name="budget_usd"
                    min="0.01"
                    max="50"
                    step="0.01"
                    required
                    placeholder="Montant explicite"
                  />
                  <small>
                    Coût API en USD. Le serveur applique aussi le plafond global
                    autorisé de 100 CAD et refuse les réservations qui le
                    dépassent.
                  </small>
                </label>
              ) : (
                <p className="notice">Aucun appel de modèle, aucun coût API.</p>
              )}
              {!health?.live_available && (
                <p className="notice">
                  IA en direct indisponible :{" "}
                  {health?.live_unavailable_reasons.join(" · ") ||
                    "état du fournisseur non disponible"}
                </p>
              )}
              {createError && (
                <p className="text-bad" role="alert">
                  {createError}
                </p>
              )}
              <button
                className="button primary"
                type="submit"
                disabled={creating || !scenarios.length}
              >
                {creating ? (
                  <>
                    <LoaderCircle className="spin" size={15} />
                    Création…
                  </>
                ) : (
                  <>
                    Créer l’exécution
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function RunInventory({
  runs,
  selected,
  onSelect,
  selection,
  update,
  sort,
  setSort,
  total,
  loaded,
}: {
  runs: Run[];
  selected: string;
  onSelect: (id: string) => void;
  selection: Selection;
  update: (c: Partial<Selection>, replace?: boolean) => void;
  sort: string;
  setSort: (s: string) => void;
  total: number | null;
  loaded: number;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INVENTAIRE DES EXÉCUTIONS</span>
          <h2>
            Plans & diagnostics <span className="count">{runs.length}</span>
          </h2>
        </div>
        <div className="inventory-controls">
          <label className="search-input">
            <Search size={14} />
            <input
              aria-label="Rechercher une exécution"
              placeholder="Nom ou identifiant…"
              value={selection.query}
              onChange={(e) => update({ query: e.target.value }, true)}
            />
          </label>
          <select
            aria-label="Trier les exécutions"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Plus récentes</option>
            <option value="distance">Distance croissante</option>
            <option value="duration">Durée croissante</option>
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="run-table">
          <thead>
            <tr>
              <th>Exécution / scénario</th>
              <th>Politique</th>
              <th>Statut</th>
              <th className="numeric">Desservies</th>
              <th className="numeric">Distance</th>
              <th className="numeric">Coût flotte estimé</th>
              <th className="numeric">Durée réelle</th>
              <th>Provenance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className={selected === r.id ? "selected" : ""}>
                <td>
                  <button
                    className="table-link stacked"
                    onClick={() => onSelect(r.id)}
                  >
                    <strong>
                      {r.scenario_id} · {r.scenario_label}
                    </strong>
                    <small>
                      {r.id.slice(0, 8)} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("fr-CA", {
                        timeZone: "America/Toronto",
                      })}
                    </small>
                  </button>
                </td>
                <td>
                  {r.policy === "baseline_only"
                    ? "Référence"
                    : "Solveur + replan."}
                </td>
                <td>
                  <span
                    className={
                      "badge " +
                      (r.status === "succeeded"
                        ? "good"
                        : r.status === "failed"
                          ? "bad"
                          : "neutral")
                    }
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="numeric">
                  {r.metrics ? `${r.metrics.served}/${r.metrics.total}` : "—"}
                </td>
                <td className="numeric">
                  {r.metrics ? num(r.metrics.distance_km) + " km" : "—"}
                </td>
                <td className="numeric">{money(r.metrics?.fleet_cost_cad)}</td>
                <td className="numeric">
                  {r.duration_ms == null
                    ? "—"
                    : num(r.duration_ms / 1000, 2) + " s"}
                </td>
                <td>
                  <span className="badge neutral">
                    {r.provenance === "fixture" ? "Synthétique" : "Direct"}
                  </span>
                </td>
                <td>
                  <button
                    aria-label={"Ouvrir " + r.id}
                    className="icon-button"
                    onClick={() => onSelect(r.id)}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {!runs.length && (
              <tr>
                <td colSpan={9}>
                  <div className="empty">
                    Aucune exécution ne correspond aux filtres.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        {runs.length} résultat(s) dans les {loaded} exécutions chargées
        {total != null && ` sur ${total} dans la cohorte`}.
        {total != null && total > loaded
          ? " Seules les 200 plus récentes sont chargées : affinez les filtres pour retrouver les autres."
          : ""}{" "}
        Recherche et tri sur les lignes chargées ; indicateurs sur toute la
        cohorte serveur.
      </div>
    </div>
  );
}
function Compare({
  runs,
  selection,
  update,
}: {
  runs: Run[];
  selection: Selection;
  update: (c: Partial<Selection>) => void;
}) {
  const [left, setLeft] = useState<RunDetail | null>(null),
    [right, setRight] = useState<RunDetail | null>(null),
    [error, setError] = useState(""),
    [side, setSide] = useState("left");
  const leftId = selection.left || runs[0]?.id || "",
    rightId = selection.right || comparisonCandidate(runs, leftId);
  useEffect(() => {
    setLeft(null);
    setRight(null);
    setError("");
    if (!leftId || !rightId) return;
    const controller = new AbortController();
    Promise.all([
      api<Detail>("/runs/" + leftId, controller.signal),
      api<Detail>("/runs/" + rightId, controller.signal),
    ])
      .then(([a, b]) => {
        setLeft(a);
        setRight(b);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [leftId, rightId]);
  const option = useMemo(() => {
    if (!left || !right || left.id !== leftId || right.id !== rightId)
      return {};
    return {
      grid: { left: 110, right: 25, top: 20, bottom: 35 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      xAxis: { type: "value", name: "km" },
      yAxis: {
        type: "category",
        data: [
          "A · " + (left.policy === "baseline_only" ? "Référence" : "Solveur"),
          "B · " + (right.policy === "baseline_only" ? "Référence" : "Solveur"),
        ],
        inverse: true,
      },
      series: [
        {
          type: "bar",
          barWidth: 25,
          data: [
            {
              value: left.metrics?.distance_km,
              itemStyle: { color: "#a3b6b9" },
            },
            {
              value: right.metrics?.distance_km,
              itemStyle: { color: "#167887" },
            },
          ],
        },
      ],
    };
  }, [left, right, leftId, rightId]);
  return (
    <>
      <div className="compare-selectors">
        {(["left", "right"] as const).map((key, i) => (
          <label key={key}>
            <span className="eyebrow">
              {i ? "B · PLAN COMPARÉ" : "A · PLAN DE RÉFÉRENCE"}
            </span>
            <select
              aria-label={i ? "Exécution B" : "Exécution A"}
              value={i ? rightId : leftId}
              onChange={(e) => update({ [key]: e.target.value })}
            >
              <option value="" disabled>
                Choisir une exécution
              </option>
              {(i ? rightId : leftId) &&
                !runs.some((run) => run.id === (i ? rightId : leftId)) && (
                  <option value={i ? rightId : leftId}>
                    Résultat sélectionné · {(i ? rightId : leftId).slice(0, 8)}
                  </option>
                )}
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.scenario_id} ·{" "}
                  {r.policy === "baseline_only" ? "Référence" : "Solveur"} ·
                  graine {r.seed} · {r.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="error-state">
          {error}
        </p>
      ) : !leftId || !rightId ? (
        <div className="empty-state">
          <GitCompareArrows size={28} />
          <h2>Choisir deux exécutions à comparer</h2>
          <p>
            Aucune paire comparable n’a été sélectionnée. Choisissez deux
            résultats du même scénario, de la même graine et de la même
            provenance, ou une autre paire pour une lecture exploratoire.
          </p>
        </div>
      ) : !left || !right || left.id !== leftId || right.id !== rightId ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Chargement des deux plans…
        </div>
      ) : !hasArtifacts(left) || !hasArtifacts(right) ? (
        <div className="empty">
          Les deux résultats doivent être terminés avant comparaison.
        </div>
      ) : (
        <>
          <div
            className={
              "compare-notice " + (!comparable(left, right) ? "warning" : "")
            }
          >
            <ShieldCheck size={18} />
            <div>
              <strong>
                {comparable(left, right)
                  ? "Entrées comparables · même scénario et même graine"
                  : "Comparaison exploratoire · entrées différentes"}
              </strong>
              <p>
                {comparable(left, right)
                  ? "Vérifiez également la couverture et la faisabilité avant d’interpréter un coût inférieur."
                  : "Ces différences ne constituent pas une mesure d’amélioration appariée."}{" "}
                Coûts API séparés : indisponibles en démonstration.
              </p>
            </div>
          </div>
          <div
            className="panel comparison-table"
            data-left-run={left.id}
            data-right-run={right.id}
          >
            <table>
              <thead>
                <tr>
                  <th>Résultat simulé</th>
                  <th>A</th>
                  <th>B</th>
                  <th>Écart B − A</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "Livraisons desservies",
                    a: left.metrics?.served,
                    b: right.metrics?.served,
                    unit: "",
                  },
                  {
                    label: "Distance",
                    a: left.metrics?.distance_km,
                    b: right.metrics?.distance_km,
                    unit: "km",
                  },
                  {
                    label: "Coût opérationnel estimé",
                    a:
                      left.metrics?.fleet_cost_cad == null
                        ? null
                        : Number(left.metrics.fleet_cost_cad),
                    b:
                      right.metrics?.fleet_cost_cad == null
                        ? null
                        : Number(right.metrics.fleet_cost_cad),
                    unit: "CAD",
                  },
                  {
                    label: "Retard cumulé",
                    a: left.metrics?.late_minutes,
                    b: right.metrics?.late_minutes,
                    unit: "min",
                  },
                  {
                    label: "Durée des agents",
                    a:
                      left.duration_ms == null ? null : left.duration_ms / 1000,
                    b:
                      right.duration_ms == null
                        ? null
                        : right.duration_ms / 1000,
                    unit: "s",
                  },
                ].map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td>
                      {num(m.a)} {m.unit}
                    </td>
                    <td>
                      {num(m.b)} {m.unit}
                    </td>
                    <td>
                      {m.a != null && m.b != null
                        ? `${num(delta(m.a, m.b).absolute)} ${m.unit}`
                        : "—"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Certificat initial indépendant</td>
                  <td>{left.certificate.valid ? "Valide" : "Non valide"}</td>
                  <td>{right.certificate.valid ? "Valide" : "Non valide"}</td>
                  <td>
                    Obligations {left.certificate.mandatory_served}/
                    {left.certificate.mandatory_total} →{" "}
                    {right.certificate.mandatory_served}/
                    {right.certificate.mandatory_total}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DISTANCE SIMULÉE · MÊMES UNITÉS</span>
                <h2>Distance et couverture</h2>
              </div>
              <div className="segmented">
                <button
                  className={side === "left" ? "active" : ""}
                  onClick={() => setSide("left")}
                >
                  A · Référence
                </button>
                <button
                  className={side === "right" ? "active" : ""}
                  onClick={() => setSide("right")}
                >
                  B · Comparé
                </button>
              </div>
            </div>
            <Chart
              option={option}
              label="Distance simulée en kilomètres pour les deux exécutions"
              height={190}
            />
            <div className="chart-caption">
              Couverture A : {left.metrics?.served}/{left.metrics?.total} · B :{" "}
              {right.metrics?.served}/{right.metrics?.total}. Une distance
              inférieure avec moins de livraisons ne suffit pas à établir un
              gain.
            </div>
          </div>
          <Fleet key={side} detail={side === "left" ? left : right} />
        </>
      )}
    </>
  );
}
