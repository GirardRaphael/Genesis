import { useCallback, useState, useMemo, lazy, Suspense } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Check,
  ShieldCheck,
  Truck,
  AlertTriangle,
} from "lucide-react";
import type { Detail, Plan, SimEvent } from "./types";
import { revealedStops } from "./replayState";
const RouteMap = lazy(() =>
  import("./RouteMap").then((module) => ({ default: module.RouteMap })),
);
import { vehicleColor } from "./Chart";
import { clock, num, money } from "./state";
export function FleetStats({ detail }: { detail: Detail }) {
  const m = detail.simulation?.metrics || detail.metrics;
  return (
    <div className="fleet-stats">
      <div>
        <span>Distance parcourue</span>
        <strong>
          {num(m?.distance_km)} <small>km</small>
        </strong>
        <em>Simulation de la journée</em>
      </div>
      <div>
        <span>Livraisons desservies</span>
        <strong>
          {m?.served ?? "—"} <small>/ {m?.total ?? "—"}</small>
        </strong>
        <em>Toutes les obligations comptent</em>
      </div>
      <div>
        <span>Livraisons à l’heure</span>
        <strong>
          {m?.on_time == null ? "—" : num(m.on_time * 100, 0)} <small>%</small>
        </strong>
        <em>
          {m?.on_time_count ?? "—"} / {m?.served ?? "—"} desservies ·{" "}
          {num(m?.late_minutes)} min de retard
        </em>
      </div>
      <div>
        <span>Coût opérationnel estimé</span>
        <strong>{money(m?.fleet_cost_cad)}</strong>
        <em>CAD · taux synthétiques</em>
      </div>
    </div>
  );
}
export function CertificateBadge({ detail }: { detail: Detail }) {
  return (
    <span className={"badge " + (detail.certificate?.valid ? "good" : "bad")}>
      <ShieldCheck size={12} />
      {detail.certificate?.valid
        ? "Plan validé"
        : "Diagnostic · plan non valide"}
    </span>
  );
}
export function Fleet({
  detail,
  compact = false,
  plan,
  simEvent,
}: {
  detail: Detail;
  compact?: boolean;
  plan?: Plan;
  simEvent?: SimEvent;
}) {
  const [version, setVersion] = useState("initial");
  const residual = detail.simulation.replan_certificate
    ? detail.simulation.replan_plan
    : null;
  const selected =
    plan ||
    (version === "residual" && residual ? residual : detail.selected_plan);
  const certificate =
    selected.scope === "residual_suffix"
      ? detail.simulation.replan_certificate || detail.certificate
      : detail.certificate;
  const dataset = useMemo(
    () =>
      selected.scope === "residual_suffix" && detail.simulation.replan_dataset
        ? detail.simulation.replan_dataset
        : {
            ...detail.dataset,
            stops:
              selected.scope === "residual_suffix"
                ? revealedStops(detail).filter(
                    (s) =>
                      selected.routes.some((r) => r.stop_ids.includes(s.id)) ||
                      selected.unserved_ids.includes(s.id),
                  )
                : detail.dataset.stops,
          },
    [
      detail.dataset,
      detail.simulation.events,
      detail.simulation.replan_dataset,
      selected,
    ],
  );
  const [vehicle, setVehicle] = useState(""),
    [stop, setStop] = useState("");
  const onStop = useCallback((id: string) => setStop(id), []);
  const selectedStop = dataset.stops.find((s) => s.id === stop);
  const routes = selected?.routes || [];
  const visits = routes
    .flatMap((r) => r.visits.map((v, index) => ({ route: r, visit: v, index })))
    .filter((v) => !vehicle || v.route.vehicle_id === vehicle);
  const unserved = dataset.stops.filter((s) =>
    selected?.unserved_ids.includes(s.id),
  );
  return (
    <div className="fleet-workspace">
      <div className="panel map-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PLAN DE DISTRIBUTION</span>
            <h2>
              Tournées de la flotte <span className="muted">/ Montréal</span>
            </h2>
          </div>
          <div className="heading-tools">
            <CertificateBadge detail={{ ...detail, certificate }} />
            <span className="version">
              {selected?.scope === "residual_suffix"
                ? "Suffixe futur"
                : "Plan initial"}
            </span>
          </div>
        </div>
        {!plan && (
          <div className="plan-versions">
            <label>
              Version du plan{" "}
              <select
                aria-label="Version du plan"
                value={
                  version === "residual" && residual ? "residual" : "initial"
                }
                onChange={(e) => {
                  setVersion(e.target.value);
                  setVehicle("");
                  setStop("");
                }}
              >
                <option value="initial">
                  Initial ·{" "}
                  {detail.selected_plan.routes.reduce(
                    (n, r) => n + r.visits.length,
                    0,
                  )}{" "}
                  visites
                </option>
                {residual && (
                  <option value="residual">
                    Résiduel ·{" "}
                    {residual.routes.reduce((n, r) => n + r.visits.length, 0)}{" "}
                    visite(s) supplémentaire(s)
                  </option>
                )}
              </select>
            </label>
            <span>
              {selected.scope === "residual_suffix"
                ? "Ajout depuis le dépôt ; les tournées initiales restent engagées. Ce certificat ne revalide pas le passé."
                : "Plan initial figé ; les résultats de la journée incluent les ajouts révélés et les retards réalisés."}
            </span>
          </div>
        )}
        <div className="vehicle-tabs">
          <button
            className={!vehicle ? "active" : ""}
            onClick={() => setVehicle("")}
          >
            Tous les véhicules <span>{routes.length}</span>
          </button>
          {routes.map((r, i) => (
            <button
              key={r.vehicle_id}
              className={vehicle === r.vehicle_id ? "active" : ""}
              onClick={() => setVehicle(r.vehicle_id)}
            >
                <i style={{ background: vehicleColor(r.vehicle_id) }} />
              {r.vehicle_id.replace("van-", "Fourgon ")}
              <span>{r.visits.length}</span>
            </button>
          ))}
        </div>
        {selected ? (
          <Suspense
            fallback={
              <div className="empty" role="status">
                Chargement de la carte…
              </div>
            }
          >
            <RouteMap
              dataset={dataset}
              plan={selected}
              vehicle={vehicle}
              stop={stop}
              onStop={onStop}
              simEvent={simEvent}
            />
          </Suspense>
        ) : (
          <div className="empty">Aucun plan disponible.</div>
        )}
        <div className="map-bottom">
          <span>
            <i className="legend-depot" />
            Dépôt
          </span>
          <span>
            <i className="legend-stop" />
            Point de livraison
          </span>
          <span>
            <i className="legend-unserved" />
            Non desservi
          </span>
          <span className="push">
            {num(
              detail.simulation.metrics?.utilization == null
                ? null
                : detail.simulation.metrics.utilization * 100,
              0,
            )}{" "}
            % capacité colis ·{" "}
            {num(
              detail.simulation.metrics?.shift_utilization == null
                ? null
                : detail.simulation.metrics.shift_utilization * 100,
              0,
            )}{" "}
            % temps de service
          </span>
        </div>
      </div>
      {!compact && (
        <>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  VISITES PLANIFIÉES · HEURE DE MONTRÉAL
                </span>
                <h2>
                  Feuille de route{" "}
                  <span className="count">{visits.length}</span>
                </h2>
              </div>
              <label className="inline-label">
                Véhicule{" "}
                <select
                  aria-label="Filtrer la feuille de route par véhicule"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                >
                  <option value="">Tous</option>
                  {routes.map((r) => (
                    <option key={r.vehicle_id}>{r.vehicle_id}</option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="table-scroll">
              <table className="visit-table">
                <thead>
                  <tr>
                    <th>Ordre / livraison</th>
                    <th>Véhicule</th>
                    <th>Fenêtre</th>
                    <th>Arrivée</th>
                    <th>Service</th>
                    <th>Départ</th>
                    <th className="numeric">Colis</th>
                    <th className="numeric">Charge restante</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map(({ route, visit, index }) => {
                    const s = dataset.stops.find((s) => s.id === visit.stop_id);
                    return (
                      <tr
                        key={route.vehicle_id + visit.stop_id}
                        className={stop === visit.stop_id ? "selected" : ""}
                      >
                        <td>
                          <button
                            className="table-link"
                            onClick={() => setStop(visit.stop_id)}
                          >
                            <span className="order">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            {s?.label || visit.stop_id}
                            <ArrowUpRight size={13} />
                          </button>
                        </td>
                        <td>{route.vehicle_id}</td>
                        <td>
                          {s
                            ? `${clock(s.earliest_s)} – ${clock(s.latest_s)}`
                            : "—"}
                        </td>
                        <td>{clock(visit.arrival_s)}</td>
                        <td>{clock(visit.service_start_s)}</td>
                        <td>{clock(visit.departure_s)}</td>
                        <td className="numeric">{s?.demand ?? "—"}</td>
                        <td className="numeric">{visit.load_after}</td>
                        <td>
                          <span className="text-good">
                            <Check size={12} />
                            Planifiée
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {unserved.map((s) => (
                    <tr key={s.id} className="unserved-row">
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setStop(s.id)}
                        >
                          {s.label}
                        </button>
                      </td>
                      <td colSpan={5}>
                        Livraison {s.mandatory ? "obligatoire" : "optionnelle"}{" "}
                        non desservie
                      </td>
                      <td className="numeric">{s.demand}</td>
                      <td>—</td>
                      <td>
                        <span className="text-bad">Non desservie</span>
                      </td>
                    </tr>
                  ))}
                  {!visits.length && !unserved.length && (
                    <tr>
                      <td colSpan={9}>Aucune visite dans ce plan.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Temps planifiés, distincts des résultats simulés. Départ /
                retour dépôt :
              </span>
              {routes.map((r) => (
                <span key={r.vehicle_id}>
                  {r.vehicle_id} · {clock(r.departure_s)} / {clock(r.return_s)}
                </span>
              ))}
            </div>
          </div>
          {selectedStop && (
            <div className="panel selected-detail">
              <MapPinIcon />
              <div>
                <span className="eyebrow">LIVRAISON SÉLECTIONNÉE</span>
                <h3>{selectedStop.label}</h3>
                <p>
                  {selectedStop.id} · {selectedStop.demand} colis · service{" "}
                  {num(selectedStop.service_s / 60)} min ·{" "}
                  {selectedStop.mandatory ? "obligatoire" : "optionnelle"}
                </p>
              </div>
              <button onClick={() => setStop("")}>Fermer</button>
            </div>
          )}
          <div
            className={
              "certificate panel " + (!certificate.valid ? "warning" : "")
            }
          >
            <ShieldCheck size={20} />
            <div>
              <h3>
                Certificat indépendant ·{" "}
                {certificate.scope === "residual_suffix"
                  ? "suffixe futur"
                  : "plan initial complet"}
              </h3>
              <p>
                {certificate.valid
                  ? "Capacité, unicité des visites, fenêtres et retour au dépôt vérifiés."
                  : "Ce résultat est un diagnostic. Les obligations non satisfaites restent visibles."}{" "}
                Obligations : {certificate.mandatory_served}/
                {certificate.mandatory_total}.
              </p>
              {certificate.issues.length > 0 && (
                <ul>
                  {certificate.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
              <details>
                <summary>Provenance et empreintes</summary>
                <p>
                  Plan {selected.id} · certificat {certificate.plan_hash}
                </p>
                <p>
                  {detail.dataset.road_source} · {detail.dataset.rate_version}
                </p>
              </details>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function MapPinIcon() {
  return <Truck size={24} />;
}
export function Exceptions({ detail }: { detail: Detail }) {
  const unserved = detail.simulation.metrics?.unserved_ids || [];
  const issues = [
    ...detail.certificate.issues,
    ...(detail.simulation.diagnostics || []),
  ];
  return (
    <div className="panel exception-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">POINTS D’ATTENTION</span>
          <h2>Qualité de service</h2>
        </div>
        <span className="count">{issues.length + unserved.length}</span>
      </div>
      {!detail.simulation.metrics ? (
        <p className="empty">
          Bilan final indisponible à cet instant de lecture.
        </p>
      ) : !issues.length && !unserved.length ? (
        <div className="service-clear">
          <div className="success-ring">
            <Check size={19} />
          </div>
          <h3>Aucune obligation manquante</h3>
          <p>
            {detail.simulation.metrics?.served} livraisons desservies dans ce
            scénario.
          </p>
          <span className="badge good">Simulation vérifiée</span>
        </div>
      ) : (
        <div className="exception-list">
          {unserved.map((id) => (
            <div key={id}>
              <AlertTriangle size={16} />
              <span>
                <strong>{id}</strong>
                <small>
                  Livraison non desservie · vérifier la cargaison et les
                  contraintes
                </small>
              </span>
            </div>
          ))}
          {issues.slice(0, 8).map((issue, i) => (
            <div key={i}>
              <AlertTriangle size={16} />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}
      <div className="exception-footer">
        <span>Scénario {detail.scenario_id}</span>
        <span>Graine {detail.seed}</span>
      </div>
    </div>
  );
}
