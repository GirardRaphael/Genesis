import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { api } from "./api";
import { money, num } from "./state";
import type { Usage } from "./analyticsData";
import type {
  BrokerDelivery,
  BrokerPlan,
  Coordinates,
  DispatchTrip,
  Place,
} from "./dispatchTypes";
import "./BrokerPlanning.css";

const ROLES = [
  "planning",
  "traffic",
  "optimization",
  "monitoring",
  "exception",
] as const;
const ROLE_NAMES: Record<string, string> = {
  planning: "Planification",
  traffic: "Routes et matrice routière",
  optimization: "Optimisation",
  monitoring: "Contrôle indépendant",
  exception: "Exceptions",
};
const TERMINAL = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "budget_exceeded",
]);
const DEFAULT_VANS = ["van1", "van2", "van3", "van4"];
const strategyName = (strategy: string) =>
  strategy === "hybrid"
    ? "Regroupement libre"
    : strategy === "separated"
      ? "Un véhicule par livraison"
      : strategy.startsWith("one_truck:")
        ? `Un seul véhicule · ${strategy.slice(10).replace("van", "V")}`
        : strategy;
const routeStatus = (status: string) =>
  status === "feasible_candidate"
    ? "Candidat certifié"
    : status === "unavailable"
      ? "Sans candidat certifié"
      : status;
const candidateReason = (reason: string | null) =>
  reason ===
  "One delivery per vehicle requires at least as many eligible vehicles as deliveries."
    ? "Il faut au moins autant de véhicules admissibles que de livraisons."
    : reason === "No certified candidate within bounded search."
      ? "Aucun candidat certifié dans la recherche bornée."
      : reason;
const agentStatus = (status?: string) =>
  status === "succeeded"
    ? "Terminé"
    : status === "running"
      ? "En cours"
      : status === "failed"
        ? "Échec"
        : status === "cancelled"
          ? "Annulé"
          : "En attente";

type Fleet = {
  vehicles: {
    id: string;
    available: boolean;
    unresolved_cargo_parcels?: number;
    origin?: Coordinates;
    origin_assumed?: boolean;
  }[];
  captured_at?: string;
};
type Props = {
  deliveries: BrokerDelivery[];
  depot: Place | null;
  trips: DispatchTrip[];
  onTripsCreated: (ids: string[]) => void;
};

export function BrokerPlanning({
  deliveries,
  depot,
  trips,
  onTripsCreated,
}: Props) {
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [fleetError, setFleetError] = useState("");
  const [eligible, setEligible] = useState<string[]>([]);
  const initialFleet = useRef(false);
  const [objective, setObjective] = useState<"balanced" | "cost" | "fastest">(
    "balanced",
  );
  const [mode, setMode] = useState<"live" | "fixture">("live");
  const [rates, setRates] = useState({
    activation_cost_cad: 18,
    cost_per_km_cad: 0.95,
    driver_cost_per_hour_cad: 28,
    service_minutes: 2,
    balance_value_cad_per_minute: 0.5,
  });
  const [planId, setPlanId] = useState("");
  const [plan, setPlan] = useState<BrokerPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fleetRefresh, setFleetRefresh] = useState(0);
  const [planRefresh, setPlanRefresh] = useState(0);
  const [health, setHealth] = useState<{
    live_available?: boolean;
    live_unavailable_reasons?: string[];
  } | null>(null);
  const submittingRef = useRef(false);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const notified = useRef("");
  const submittedPlanId = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const value = await api<Fleet>("/dispatch/fleet", controller.signal);
        if (!controller.signal.aborted) {
          setFleet(value);
          setFleetError("");
          const available = value.vehicles
            .filter((v) => v.available)
            .map((v) => v.id);
          const first = !initialFleet.current;
          initialFleet.current = true;
          setEligible((current) =>
            !first ? current.filter((id) => available.includes(id)) : available,
          );
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setFleetError(
            reason instanceof Error ? reason.message : "Flotte indisponible",
          );
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [fleetRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    api<{ live_available?: boolean; live_unavailable_reasons?: string[] }>(
      "/health",
      controller.signal,
    )
      .then(setHealth)
      .catch(() => {});
    api<{ items: { id: string }[] }>(
      "/dispatch/plans?limit=10",
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setPlanId((current) => current || value.items[0]?.id || "");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!planId) return;
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [detail, metering] = await Promise.all([
          api<BrokerPlan>(
            `/dispatch/plans/${encodeURIComponent(planId)}`,
            controller.signal,
          ),
          api<Usage>(
            `/runs/${encodeURIComponent(planId)}/usage`,
            controller.signal,
          ).catch(() => null),
        ]);
        if (!controller.signal.aborted) {
          setPlan(detail);
          setUsage(metering);
          setError("");
          if (detail.created_trip_ids?.length && notified.current !== planId) {
            notified.current = planId;
            if (submittedPlanId.current === planId)
              onTripsCreated(detail.created_trip_ids);
            setFleetRefresh((n) => n + 1);
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "Plan indisponible",
          );
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [planId, planRefresh]);

  const available = fleet?.vehicles.filter((item) => item.available) || [];
  const liveUnavailable = mode === "live" && health?.live_available === false;
  const costsValid =
    Object.entries(rates).every(
      ([key, value]) =>
        Number.isFinite(value) &&
        value >= 0 &&
        value <=
          (key === "activation_cost_cad"
            ? 10000
            : key === "service_minutes"
              ? 60
              : 1000),
    ) && Number.isInteger(rates.service_minutes);
  const canSubmit =
    !!depot &&
    deliveries.length > 0 &&
    eligible.length > 0 &&
    !!fleet &&
    !fleetError &&
    costsValid &&
    !liveUnavailable &&
    !submitting;

  async function submit() {
    if (submittingRef.current || !canSubmit || !depot) return;
    const payload = {
      deliveries,
      depot,
      vehicle_ids: eligible,
      objective,
      ...rates,
      mode,
      ...(mode === "live" ? { budget_usd: 1 } : {}),
    };
    const body = JSON.stringify(payload);
    if (submission.current?.body !== body)
      submission.current = { body, key: crypto.randomUUID() };
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/v1/dispatch/plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submission.current.key,
        },
        body,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(
          detail.error?.message ||
            detail.detail?.message ||
            detail.message ||
            `Planification impossible (${response.status})`,
        );
      }
      const result = (await response.json()) as BrokerPlan;
      submission.current = null;
      notified.current = "";
      submittedPlanId.current = result.id;
      setPlan(result);
      setUsage(null);
      setPlanId(result.id);
      setPlanRefresh((n) => n + 1);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Planification impossible",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="broker" aria-labelledby="broker-title">
      <div className="broker-heading">
        <span className="broker-icon">
          <Sparkles size={18} />
        </span>
        <div>
          <span className="dispatch-kicker">COURTIER À CINQ AGENTS</span>
          <h3 id="broker-title">Planification coordonnée</h3>
        </div>
      </div>
      <p className="broker-lead">
        Les agents préparent et expliquent les options. Le solveur borné propose
        les tournées ; un certificat indépendant vérifie capacité, précédence et
        délais.
      </p>
      <div className="broker-field">
        <span className="broker-label">Véhicules admissibles</span>
        <div className="broker-vehicles">
          {(
            fleet?.vehicles ||
            DEFAULT_VANS.map((id) => ({ id, available: false }))
          ).map((van) => (
            <label key={van.id} className={!van.available ? "unavailable" : ""}>
              <input
                type="checkbox"
                checked={eligible.includes(van.id)}
                disabled={!van.available}
                onChange={(event) =>
                  setEligible((current) =>
                    event.target.checked
                      ? [...current, van.id]
                      : current.filter((id) => id !== van.id),
                  )
                }
              />
              <Truck size={14} />
              <span>{van.id.replace("van", "V")}</span>
              <small>
                {van.available
                  ? van.origin_assumed
                    ? "Origine supposée"
                    : "Libre"
                  : "unresolved_cargo_parcels" in van &&
                      Number(van.unresolved_cargo_parcels) > 0
                    ? "Colis à récupérer"
                    : "Occupé"}
              </small>
            </label>
          ))}
        </div>
        {fleet?.vehicles.some((van) => van.available && van.origin_assumed) && (
          <p className="broker-origin-note">
            Origine des véhicules sans trajet antérieur présumée ; vérifiez le
            dépôt choisi.
          </p>
        )}
        {fleetError && (
          <p className="broker-error" role="alert">
            Flotte : {fleetError}
          </p>
        )}
        {fleet && !available.length && (
          <p className="broker-diagnostic">
            Aucun véhicule libre. Attendez la fin d’une simulation ou annulez un
            trajet actif avant de planifier.
          </p>
        )}
      </div>
      <fieldset className="broker-objectives">
        <legend>Priorité de planification</legend>
        {(
          [
            ["balanced", "Équilibré", "Coût et durée"],
            ["cost", "Coût", "Coût de flotte estimé"],
            ["fastest", "Rapide", "Durée de tournée"],
          ] as const
        ).map(([key, label, help]) => (
          <label key={key} className={objective === key ? "selected" : ""}>
            <input
              type="radio"
              name="broker-objective"
              checked={objective === key}
              onChange={() => setObjective(key)}
            />
            <strong>{label}</strong>
            <small>{help}</small>
          </label>
        ))}
      </fieldset>
      <details className="broker-rates">
        <summary>Hypothèses de coût et de service</summary>
        <div className="broker-rates-grid">
          {(
            [
              ["activation_cost_cad", "Départ / véhicule · CAD"],
              ["cost_per_km_cad", "Distance · CAD/km"],
              ["driver_cost_per_hour_cad", "Conducteur · CAD/h"],
              ["service_minutes", "Service / arrêt · min"],
              [
                "balance_value_cad_per_minute",
                "Temps dans équilibre · CAD/min",
              ],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min="0"
                max={
                  key === "activation_cost_cad"
                    ? 10000
                    : key === "service_minutes"
                      ? 60
                      : 1000
                }
                step={key === "service_minutes" ? 1 : 0.01}
                value={rates[key]}
                onChange={(event) =>
                  setRates((current) => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <p>
          Hypothèses synthétiques modifiables, pas des coûts facturés. Les
          échéances sont comptées depuis le départ jusqu’à la fin du service de
          livraison.
        </p>
      </details>
      <fieldset className="broker-mode">
        <legend>Mode d’exécution</legend>
        <label>
          <input
            type="radio"
            name="broker-mode"
            checked={mode === "live"}
            onChange={() => setMode("live")}
          />{" "}
          Anthropic en direct <span>max. 1,00 $ US / plan</span>
        </label>
        <label>
          <input
            type="radio"
            name="broker-mode"
            checked={mode === "fixture"}
            onChange={() => setMode("fixture")}
          />{" "}
          Démonstration sans appel IA
        </label>
      </fieldset>
      <p className="broker-budget">
        Plafond global de 100 $ CAD appliqué par le serveur. Dépenses API
        estimées en USD, séparées du coût de flotte en CAD.
      </p>
      {liveUnavailable && (
        <p className="broker-error" role="alert">
          IA en direct indisponible :{" "}
          {health?.live_unavailable_reasons?.join(" · ") ||
            "configuration incomplète"}
        </p>
      )}
      {!depot && (
        <p className="broker-diagnostic">
          Choisissez un dépôt pour lancer la planification.
        </p>
      )}
      {!costsValid && (
        <p className="broker-error" role="alert">
          Corrigez les hypothèses numériques avant de planifier.
        </p>
      )}
      <button
        type="button"
        className="broker-submit"
        disabled={!canSubmit}
        onClick={() => void submit()}
      >
        {submitting ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Sparkles size={16} />
        )}{" "}
        Planifier avec les agents <ArrowRight size={16} />
      </button>
      {error && (
        <p className="broker-error" role="alert">
          {error}
        </p>
      )}
      {planId && (
        <PlanResult
          plan={plan}
          usage={usage}
          planId={planId}
          trips={trips}
          refresh={() => setPlanRefresh((n) => n + 1)}
        />
      )}
    </section>
  );
}

function PlanResult({
  plan,
  usage,
  planId,
  trips,
  refresh,
}: {
  plan: BrokerPlan | null;
  usage: Usage | null;
  planId: string;
  trips: DispatchTrip[];
  refresh: () => void;
}) {
  const selected = plan?.broker_solution?.selected_strategy;
  const selectedCandidate = plan?.candidates?.find(
    (item) => item.strategy === selected,
  );
  const final = !!plan && TERMINAL.has(plan.status);
  return (
    <div className="broker-result">
      <div className="broker-result-head">
        <div>
          <span className="dispatch-kicker">MISSION {planId.slice(0, 8)}</span>
          <h3>
            {!plan
              ? "Chargement de la mission…"
              : plan.final_kind === "accepted_plan"
                ? "Plan vérifié"
                : plan.status === "succeeded"
                  ? "Analyse terminée"
                  : final
                    ? "Diagnostic de la mission"
                    : "Agents au travail"}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Actualiser la mission"
          onClick={refresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <div className={`broker-run-status ${plan?.status || "queued"}`}>
        {!plan || !final ? (
          <LoaderCircle size={14} className="spin" />
        ) : plan.status === "succeeded" ? (
          <CircleCheck size={15} />
        ) : (
          <CircleAlert size={15} />
        )}
        {plan?.status === "succeeded"
          ? "Terminée"
          : plan?.status === "running"
            ? "En cours"
            : plan?.status === "queued" || !plan
              ? "En attente"
              : plan.status === "failed"
                ? "Échec"
                : plan?.status || "Diagnostic"}
      </div>
      <div className="broker-agent-list">
        {ROLES.map((role, index) => {
          const agent = plan?.agents?.find((item) => item.role === role);
          const spend = usage?.agents?.find((item) => item.role === role);
          return (
            <div key={role} className="broker-agent">
              <span className="broker-agent-index">{index + 1}</span>
              <div>
                <strong>{ROLE_NAMES[role]}</strong>
                <small>
                  {plan?.request?.mode === "fixture"
                    ? "Démonstration déterministe"
                    : agent?.model ||
                      agent?.requested_model ||
                      (agent ? "Modèle indisponible" : "En attente")}
                </small>
              </div>
              <span className="broker-agent-status">
                {agent?.status === "succeeded" ? (
                  <Check size={13} />
                ) : agent?.status === "running" ? (
                  <LoaderCircle size={13} className="spin" />
                ) : null}
                {agentStatus(agent?.status)}
              </span>
              <small>
                {spend?.total_tokens == null
                  ? "tokens —"
                  : `${num(spend.total_tokens, 0)} tokens`}{" "}
                · {money(spend?.cost_usd, "USD")}
              </small>
            </div>
          );
        })}
      </div>
      {usage && (
        <p className="broker-usage">
          {usage.totals.calls} appels · {num(usage.totals.total_tokens, 0)}{" "}
          tokens déclarés · {money(usage.totals.cost_usd, "USD")} API estimés ·
          couverture coût {num(usage.totals.cost_coverage * 100, 0)} %
        </p>
      )}
      {final && (
        <>
          <div
            className={`broker-certificate ${plan?.certificate?.valid ? "valid" : "invalid"}`}
          >
            <ShieldCheck size={17} />
            <span>
              {plan?.certificate?.valid
                ? "Certificat indépendant valide"
                : "Aucun plan accepté sans certificat valide"}
            </span>
          </div>
          {plan?.certificate?.issues?.length ? (
            <ul className="broker-issues">
              {plan.certificate.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : null}
          {plan?.error?.message && (
            <p className="broker-error">{plan.error.message}</p>
          )}
          {plan?.final_kind === "accepted_diagnostic" && (
            <p className="broker-diagnostic" role="status">
              Analyse terminée sans trajet prêt à démarrer. La flotte ou les
              conditions de la mission ont changé ; actualisez les véhicules,
              puis relancez la planification.
              {plan.final_output?.reason
                ? ` Motif serveur : ${plan.final_output.reason}.`
                : ""}
            </p>
          )}
          {selectedCandidate && (
            <div className="broker-selected">
              <span className="dispatch-kicker">OPTION RETENUE</span>
              <strong>{strategyName(selectedCandidate.strategy)}</strong>
              <p>
                {selectedCandidate.solution
                  ? `${money(selectedCandidate.solution.fleet_cost_cents / 100)} de coût de flotte estimé · ${num(selectedCandidate.solution.makespan_seconds / 60, 0)} min de durée maximale · ${num(selectedCandidate.solution.vehicle_routes.reduce((sum, route) => sum + route.distance_meters, 0) / 1000, 1)} km · ${selectedCandidate.solution.vehicle_routes.length} véhicule(s)`
                  : "Aucune tournée certifiée."}
              </p>
            </div>
          )}
          {plan?.candidates?.length ? (
            <div className="broker-candidates">
              <strong>Options évaluées</strong>
              {plan.candidates.map((candidate) => (
                <div
                  key={candidate.strategy}
                  className={candidate.strategy === selected ? "selected" : ""}
                >
                  <span>
                    {strategyName(candidate.strategy)}
                    {candidate.strategy === selected ? " · retenue" : ""}
                  </span>
                  <small>
                    {candidate.solution
                      ? `${money(candidate.solution.fleet_cost_cents / 100)} · ${num(candidate.solution.makespan_seconds / 60, 0)} min · ${num(candidate.solution.vehicle_routes.reduce((sum, route) => sum + route.distance_meters, 0) / 1000, 1)} km · ${candidate.solution.vehicle_routes.length} véhicule(s)`
                      : candidateReason(candidate.reason) ||
                        routeStatus(candidate.status)}
                  </small>
                  <small>
                    {candidate.certificate?.valid
                      ? "Vérifiée"
                      : routeStatus(candidate.status)}
                  </small>
                </div>
              ))}
              <p>
                Recherche bornée : ces options sont des candidats vérifiés, sans
                garantie d’optimalité globale. Comparaison sur la même mission
                et les mêmes hypothèses.
              </p>
            </div>
          ) : null}
          {plan?.created_trip_ids?.length ? (
            <div className="broker-created">
              <strong>
                {plan.created_trip_ids.length} tournée(s) créée(s)
              </strong>
              {plan.created_trip_ids.map((id) => {
                const trip = trips.find((item) => item.id === id);
                return (
                  <div key={id} className="broker-created-route">
                    <p>
                      <Truck size={13} />{" "}
                      {trip
                        ? `${trip.vehicle_id.replace("van", "Véhicule ")} · ${trip.stops.length} arrêts · ${trip.route.distance_km.toFixed(1)} km · ${trip.status === "ready" ? "Prête" : trip.status === "running" ? "En simulation" : trip.status === "completed" ? "Terminée" : "Annulée"}`
                        : `Trajet ${id.slice(0, 8)} · chargement…`}
                    </p>
                    {trip && (
                      <ol>
                        {trip.stops.map((stop) => (
                          <li key={stop.id}>
                            {stop.kind === "pickup" ? "Ramassage" : "Livraison"}
                            {" · "}
                            {stop.label}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                );
              })}
              <small>
                Les tournées prêtes peuvent démarrer dans le suivi des trajets.
                Aucun véhicule réel n’est commandé.
              </small>
            </div>
          ) : null}
        </>
      )}
      <a
        className="broker-trace-link"
        href={`?view=observatory&run=${encodeURIComponent(planId)}`}
      >
        Inspecter les sorties des cinq agents <ArrowRight size={14} />
      </a>
    </div>
  );
}
