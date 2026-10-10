import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Layers3,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Route,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { api } from "./api";
import { BrokerPlanning } from "./BrokerPlanning";
import { DispatchMap, dispatchColor } from "./DispatchMap";
import type {
  BrokerDelivery,
  DispatchTrip,
  GeocodeResult,
  Place,
  Traffic,
} from "./dispatchTypes";
import "./Dispatch.css";

const EXAMPLE: BrokerDelivery[] = [
  {
    pickup: {
      label: "Gare Centrale de Montréal",
      coordinates: [-73.5673, 45.5003],
    },
    dropoff: { label: "Marché Jean-Talon", coordinates: [-73.6145, 45.5362] },
    parcels: 1,
    deadline_minutes: 120,
  },
  {
    pickup: { label: "Marché Jean-Talon", coordinates: [-73.6145, 45.5362] },
    dropoff: { label: "Stade olympique", coordinates: [-73.5515, 45.5579] },
    parcels: 1,
    deadline_minutes: 120,
  },
];
const fmtTime = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("fr-CA", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Toronto",
      }).format(new Date(value))
    : "—";
const fmtDate = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("fr-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Toronto",
      }).format(new Date(value))
    : "Indisponible";
const statusName = (status: string) =>
  ({
    ready: "Prêt",
    running: "En simulation",
    completed: "Terminé",
    cancelled: "Annulé",
  })[status as "ready"] || status;

async function postDispatch<T>(
  path: string,
  body: object,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      detail.error?.message ||
        detail.detail?.message ||
        detail.message ||
        (typeof detail.detail === "string"
          ? detail.detail
          : `Action impossible (${response.status})`),
    );
  }
  return response.json();
}

export function Dispatch() {
  const [trips, setTrips] = useState<DispatchTrip[]>([]);
  const [selected, setSelected] = useState("");
  const [mapFocus, setMapFocus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  const creating = useRef(false);
  const acting = useRef(false);
  const createIntent = useRef<{ body: string; key: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [vehicle, setVehicle] = useState("van1");
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [depot, setDepot] = useState<Place | null>(EXAMPLE[0].pickup);
  const [parcels, setParcels] = useState(1);
  const [deadline, setDeadline] = useState(120);
  const [draft, setDraft] = useState<BrokerDelivery[]>([]);
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [trafficError, setTrafficError] = useState("");
  const [showRoadworks, setShowRoadworks] = useState(false);
  const [trafficRefresh, setTrafficRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const page = await api<{ items: DispatchTrip[] }>(
          "/dispatch/trips?limit=100",
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setTrips(page.items);
          setSelected((current) =>
            current && page.items.some((trip) => trip.id === current)
              ? current
              : page.items.find((trip) => trip.status === "running")?.id ||
                page.items[0]?.id ||
                "",
          );
          setListError("");
          setLoading(false);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setListError(
            reason instanceof Error ? reason.message : "Chargement impossible",
          );
          setLoading(false);
        }
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
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    api<Traffic>("/dispatch/traffic", controller.signal)
      .then((value) => {
        setTraffic(value);
        setTrafficError("");
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setTrafficError(reason.message);
      });
    return () => controller.abort();
  }, [trafficRefresh]);

  const chosen = trips.find((trip) => trip.id === selected);
  const selectTrip = (id: string) => {
    setSelected(id);
    setMapFocus((n) => n + 1);
  };
  const active = trips.filter((trip) => trip.status === "running").length;
  const planned = trips.filter((trip) => trip.status === "ready").length;

  function addDelivery() {
    if (draft.length >= 10) {
      setFormError("Un trajet peut contenir au plus 10 livraisons.");
      return;
    }
    if (!pickup || !dropoff) {
      setFormError(
        "Choisissez un lieu de ramassage et un lieu de livraison dans les résultats de recherche.",
      );
      return;
    }
    if (!Number.isInteger(parcels) || parcels < 1 || parcels > 40) {
      setFormError("Chaque livraison peut contenir entre 1 et 40 colis.");
      return;
    }
    if (!Number.isInteger(deadline) || deadline < 1 || deadline > 480) {
      setFormError(
        "Le délai de livraison doit être compris entre 1 et 480 minutes.",
      );
      return;
    }
    setDraft((current) => [
      ...current,
      { pickup, dropoff, parcels, deadline_minutes: deadline },
    ]);
    setPickup(null);
    setDropoff(null);
    setParcels(1);
    setFormError("");
  }

  async function createTrip() {
    if (creating.current) return;
    if (!draft.length) {
      setFormError("Ajoutez au moins une livraison avant de créer le trajet.");
      return;
    }
    const payload = {
      vehicle_id: vehicle,
      deliveries: draft.map(({ pickup, dropoff, parcels }) => ({
        pickup,
        dropoff,
        parcels,
      })),
    };
    const body = JSON.stringify(payload);
    if (createIntent.current?.body !== body)
      createIntent.current = { body, key: crypto.randomUUID() };
    creating.current = true;
    setBusy("create");
    setFormError("");
    try {
      const trip = await postDispatch<DispatchTrip>(
        "/dispatch/trips",
        payload,
        createIntent.current.key,
      );
      createIntent.current = null;
      setDraft([]);
      setPickup(null);
      setDropoff(null);
      selectTrip(trip.id);
      setRefresh((n) => n + 1);
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "Création impossible",
      );
    } finally {
      creating.current = false;
      setBusy("");
    }
  }

  async function act(id: string, action: "start" | "cancel") {
    if (acting.current) return;
    acting.current = true;
    setBusy(`${id}:${action}`);
    setListError("");
    try {
      await postDispatch(
        `/dispatch/trips/${encodeURIComponent(id)}/${action}`,
        {},
      );
      setRefresh((n) => n + 1);
    } catch (reason) {
      setListError(
        reason instanceof Error ? reason.message : "Action impossible",
      );
    } finally {
      acting.current = false;
      setBusy("");
    }
  }

  return (
    <div className="dispatch">
      <div className="dispatch-hero">
        <div>
          <span className="dispatch-overline">
            GENESIS / CENTRE DE RÉPARTITION
          </span>
          <h2>Chaque trajet, au même endroit.</h2>
          <p>
            Planifiez des livraisons montréalaises et suivez leur simulation sur
            des routes réelles. Positions simulées, jamais des données GPS.
          </p>
        </div>
        <div className="dispatch-hero-stats">
          <div>
            <strong>{active}</strong>
            <span>en simulation</span>
          </div>
          <div>
            <strong>{planned}</strong>
            <span>prêts</span>
          </div>
          <div>
            <strong>{trips.length}</strong>
            <span>affichés</span>
          </div>
        </div>
      </div>
      <div className="dispatch-board">
        <section
          className="dispatch-composer"
          aria-labelledby="dispatch-create-title"
        >
          <div className="dispatch-section-head">
            <span className="dispatch-icon">
              <Plus size={19} />
            </span>
            <div>
              <span className="dispatch-kicker">NOUVELLE MISSION</span>
              <h2 id="dispatch-create-title">Préparer les livraisons</h2>
            </div>
          </div>
          <p className="dispatch-helper">
            Recherchez des lieux publics ou des adresses, puis choisissez chaque
            résultat avant d’ajouter la livraison.
          </p>
          <PlaceSearch
            label="Lieu de ramassage"
            place={pickup}
            onChange={setPickup}
          />
          <PlaceSearch
            label="Lieu de livraison"
            place={dropoff}
            onChange={setDropoff}
          />
          <div className="dispatch-form-row">
            <label>
              Colis
              <input
                type="number"
                min={1}
                max={40}
                step={1}
                value={parcels}
                onChange={(event) => setParcels(Number(event.target.value))}
              />
            </label>
            <label>
              Échéance après départ · min
              <input
                type="number"
                min={1}
                max={480}
                step={1}
                value={deadline}
                onChange={(event) => setDeadline(Number(event.target.value))}
              />
            </label>
          </div>
          <button
            className="dispatch-add"
            type="button"
            onClick={addDelivery}
            disabled={draft.length >= 10}
          >
            <Plus size={16} /> Ajouter cette livraison
          </button>
          <div className="dispatch-draft-head">
            <strong>Livraisons à planifier</strong>
            <span>{draft.length}/10</span>
          </div>
          {draft.length ? (
            <ol className="dispatch-draft">
              {draft.map((item, index) => (
                <li key={`${index}-${item.pickup.label}`}>
                  <span className="dispatch-draft-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{item.pickup.label}</strong>
                    <ArrowRight size={13} />
                    <strong>{item.dropoff.label}</strong>
                    <small>
                      {item.parcels} colis · livraison sous{" "}
                      {item.deadline_minutes ?? 120} min
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={`Retirer la livraison ${index + 1}`}
                    onClick={() =>
                      setDraft((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dispatch-draft-empty">Aucune livraison ajoutée.</p>
          )}
          <button
            type="button"
            className="dispatch-example"
            onClick={() => {
              setDraft(EXAMPLE.map((item) => ({ ...item })));
              setFormError("");
            }}
          >
            Charger un exemple montréalais
          </button>
          {formError && (
            <p className="dispatch-error" role="alert">
              {formError}
            </p>
          )}
          <div className="dispatch-depot">
            <PlaceSearch
              label="Dépôt de départ présumé"
              place={depot}
              onChange={setDepot}
            />
            <p>
              Gare Centrale est une hypothèse d’exemple. Choisissez votre vrai
              point de départ avant une mission personnalisée.
            </p>
          </div>
          <BrokerPlanning
            deliveries={draft}
            depot={depot}
            trips={trips}
            onTripsCreated={(ids) => {
              setRefresh((n) => n + 1);
              if (ids[0]) selectTrip(ids[0]);
            }}
          />
          <details className="dispatch-manual">
            <summary>Créer manuellement un trajet routier</summary>
            <p>
              Option avancée : conserve l’ordre des livraisons saisies, sans
              courtier ni comparaison d’affectation.
            </p>
            <label>
              Véhicule
              <select
                value={vehicle}
                onChange={(event) => setVehicle(event.target.value)}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={`van${n}`}>
                    Véhicule {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="dispatch-create"
              disabled={busy === "create" || !draft.length}
              onClick={() => void createTrip()}
            >
              {busy === "create" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Route size={16} />
              )}{" "}
              Créer sans courtier <ArrowRight size={16} />
            </button>
          </details>
        </section>

        <section
          className="dispatch-map-panel"
          aria-label="Carte et contexte routier"
        >
          <div className="dispatch-map-toolbar">
            <div>
              <span className="dispatch-kicker">VUE TERRAIN</span>
              <h2>Montréal et ses trajets</h2>
            </div>
            <div className="dispatch-map-actions">
              <label className="dispatch-layer-toggle">
                <input
                  type="checkbox"
                  checked={showRoadworks}
                  onChange={(event) => setShowRoadworks(event.target.checked)}
                />
                <Layers3 size={15} /> Chantiers déclarés
              </label>
              <button
                type="button"
                title="Actualiser les chantiers"
                aria-label="Actualiser les chantiers"
                onClick={() => setTrafficRefresh((n) => n + 1)}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
          <DispatchMap
            trips={trips}
            selected={selected}
            onSelect={selectTrip}
            focusVersion={mapFocus}
            roadworks={traffic?.available ? traffic.items : []}
            showRoadworks={showRoadworks}
          />
          <div className="dispatch-map-foot">
            <div className="dispatch-legend">
              {[1, 2, 3, 4].map((n) => (
                <span key={n}>
                  <i style={{ background: dispatchColor(`van${n}`) }} />V{n}
                </span>
              ))}
              <span>
                <i className="roadwork" />
                Chantier déclaré
              </span>
            </div>
            <p>
              {trafficError
                ? `Chantiers indisponibles : ${trafficError}`
                : traffic?.available
                  ? `${traffic.total} chantiers déclarés · source municipale mise à jour ${fmtDate(traffic.source_updated_at)}${traffic.stale ? " · source ancienne" : ""}. Périodes de permis, pas des vitesses mesurées ni un évitement automatique.`
                  : "Chantiers déclarés indisponibles. Les trajets restent accessibles."}{" "}
              {traffic?.source_url && (
                <a href={traffic.source_url} target="_blank" rel="noreferrer">
                  Source ↗
                </a>
              )}
            </p>
          </div>
        </section>

        <aside
          className="dispatch-trips"
          aria-labelledby="dispatch-trips-title"
        >
          <div className="dispatch-trips-head">
            <div>
              <span className="dispatch-kicker">FLOTTE / SUIVI</span>
              <h2 id="dispatch-trips-title">
                Trajets récents{" "}
                <span>
                  {trips.length}
                  {trips.length === 100 ? " max." : ""}
                </span>
              </h2>
            </div>
            <button
              type="button"
              title="Actualiser les trajets"
              aria-label="Actualiser les trajets"
              onClick={() => setRefresh((n) => n + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {listError && (
            <p className="dispatch-error" role="alert">
              {listError}
              {trips.length ? " · Dernier état affiché." : ""}
            </p>
          )}
          {loading ? (
            <p className="dispatch-empty" role="status">
              <LoaderCircle className="spin" size={17} /> Chargement des
              trajets…
            </p>
          ) : !trips.length ? (
            <div className="dispatch-empty">
              <Truck size={28} />
              <strong>Aucun trajet enregistré</strong>
              <span>
                Ajoutez une livraison, puis créez votre premier trajet.
              </span>
            </div>
          ) : (
            <div className="dispatch-trip-list">
              {trips.map((trip) => (
                <button
                  type="button"
                  key={trip.id}
                  className={`dispatch-trip-card ${selected === trip.id ? "selected" : ""}`}
                  onClick={() => selectTrip(trip.id)}
                  aria-pressed={selected === trip.id}
                >
                  <div className="dispatch-trip-top">
                    <span
                      className="dispatch-vehicle-dot"
                      style={{ background: dispatchColor(trip.vehicle_id) }}
                    />
                    <strong>
                      {trip.vehicle_id.replace("van", "Véhicule ")}
                    </strong>
                    <span className={`dispatch-status ${trip.status}`}>
                      {statusName(trip.status)}
                    </span>
                  </div>
                  <span className="dispatch-trip-route">
                    {trip.stops[0]?.label || "Départ"} <ArrowRight size={13} />{" "}
                    {trip.stops.at(-1)?.label || "Arrivée"}
                  </span>
                  <span className="dispatch-trip-meta">
                    {trip.deliveries.length} livraison
                    {trip.deliveries.length > 1 ? "s" : ""} ·{" "}
                    {trip.route
                      ? `${trip.route.distance_km.toFixed(1)} km`
                      : "distance indisponible"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {chosen && <TripDetail trip={chosen} busy={busy} onAction={act} />}
        </aside>
      </div>
      <p className="dispatch-page-note">
        <MapPin size={14} /> Géocodage public et fond OpenFreeMap /
        OpenStreetMap. Itinéraires routiers calculés au serveur. Cette vue
        locale ne remplace pas une plateforme de suivi GPS ou de circulation en
        temps réel.
      </p>
    </div>
  );
}

function PlaceSearch({
  label,
  place,
  onChange,
}: {
  label: string;
  place: Place | null;
  onChange: (place: Place | null) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (place) setText(place.label);
  }, [place]);
  useEffect(() => () => controller.current?.abort(), []);
  async function search() {
    if (text.trim().length < 3) {
      setError("Saisissez au moins trois caractères.");
      return;
    }
    controller.current?.abort();
    const current = ++request.current;
    const pending = new AbortController();
    controller.current = pending;
    setSearching(true);
    setError("");
    setItems([]);
    try {
      const result = await api<{ items: GeocodeResult[] }>(
        `/dispatch/geocode?q=${encodeURIComponent(text.trim())}`,
        pending.signal,
      );
      if (current !== request.current || pending.signal.aborted) return;
      setItems(result.items);
      if (!result.items.length)
        setError("Aucun lieu trouvé. Essayez un nom plus précis.");
    } catch (reason) {
      if (current === request.current && !pending.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Recherche indisponible",
        );
    } finally {
      if (current === request.current) setSearching(false);
    }
  }
  return (
    <div className="dispatch-place">
      <label>
        {label}
        <span className="dispatch-search-line">
          <input
            type="search"
            value={text}
            onChange={(event) => {
              request.current += 1;
              controller.current?.abort();
              setSearching(false);
              setText(event.target.value);
              onChange(null);
              setItems([]);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            placeholder="Adresse ou lieu à Montréal"
            aria-label={label}
          />
          <button
            type="button"
            onClick={() => void search()}
            disabled={searching}
            aria-label={`Rechercher ${label.toLowerCase()}`}
          >
            {searching ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Search size={17} />
            )}
          </button>
        </span>
      </label>
      {place && (
        <span className="dispatch-place-selected">
          <MapPin size={13} /> Lieu choisi · {place.label}{" "}
          <button
            type="button"
            aria-label={`Effacer ${label.toLowerCase()}`}
            onClick={() => {
              request.current += 1;
              controller.current?.abort();
              setSearching(false);
              onChange(null);
              setText("");
            }}
          >
            <X size={13} />
          </button>
        </span>
      )}
      {items.length > 0 && (
        <ul
          className="dispatch-results"
          aria-label={`Résultats pour ${label.toLowerCase()}`}
        >
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <button
                type="button"
                onClick={() => {
                  request.current += 1;
                  controller.current?.abort();
                  setSearching(false);
                  onChange(item);
                  setText(item.label);
                  setItems([]);
                }}
              >
                <MapPin size={15} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <span className="dispatch-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function TripDetail({
  trip,
  busy,
  onAction,
}: {
  trip: DispatchTrip;
  busy: string;
  onAction: (id: string, action: "start" | "cancel") => Promise<void>;
}) {
  return (
    <div className="dispatch-trip-detail">
      <div className="dispatch-trip-detail-head">
        <span className="dispatch-kicker">TRAJET SÉLECTIONNÉ</span>
        <strong>{trip.id.slice(0, 8)}</strong>
      </div>
      <div className="dispatch-trip-facts">
        <div>
          <Route size={15} />
          <span>
            {trip.route ? `${trip.route.distance_km.toFixed(1)} km` : "—"}
            <small>distance routière</small>
          </span>
        </div>
        <div>
          <Clock3 size={15} />
          <span>
            {trip.route
              ? `${Math.round(trip.route.duration_minutes)} min`
              : "—"}
            <small>routier estimé, hors trafic</small>
          </span>
        </div>
      </div>
      <ol className="dispatch-stop-list">
        {trip.stops.map((stop, index) => (
          <li
            key={stop.id}
            className={stop.status === "completed" ? "completed" : ""}
          >
            <span className="dispatch-stop-index">{index + 1}</span>
            <div>
              <strong>
                {stop.kind === "pickup" ? "Ramassage" : "Livraison"}
              </strong>
              <span>{stop.label}</span>
              <small>
                {stop.status === "completed"
                  ? "Arrêt simulé terminé"
                  : trip.status === "cancelled"
                    ? "Non desservi · simulation annulée"
                    : stop.eta_at
                      ? `Simulation : ${fmtTime(stop.eta_at)}`
                      : `Départ + ${Math.round(stop.eta_seconds / 60)} min simulées`}
              </small>
            </div>
          </li>
        ))}
      </ol>
      {trip.status === "running" && (
        <p className="dispatch-sim-progress">
          Position simulée · vitesse {trip.speedup}× ·{" "}
          {trip.progress?.completed_stop_count || 0}/{trip.stops.length} arrêts
          passés
          {` · temps simulé ${Math.round(trip.progress.elapsed_simulation_seconds / 60)} min`}
        </p>
      )}
      <div className="dispatch-trip-actions">
        {trip.status === "ready" && (
          <button
            type="button"
            className="dispatch-start"
            disabled={!!busy}
            onClick={() => void onAction(trip.id, "start")}
          >
            {busy === `${trip.id}:start` ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Truck size={15} />
            )}{" "}
            Démarrer la simulation
          </button>
        )}
        {["ready", "running"].includes(trip.status) && (
          <button
            type="button"
            className="dispatch-cancel"
            disabled={!!busy}
            onClick={() => void onAction(trip.id, "cancel")}
          >
            <X size={15} /> Annuler
          </button>
        )}
      </div>
    </div>
  );
}
