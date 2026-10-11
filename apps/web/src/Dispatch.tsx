import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { OrderBoard } from "./OrderBoard";
import type { BrokerOrder } from "./orderData";
import { DispatchMap, dispatchColor } from "./DispatchMap";
import { RouteLibrary } from "./RouteLibrary";
import { selectedDispatchStop, type StopSelection } from "./dispatchSelection";
import {
  selectedVehicleAfterConfig,
  vehicleLabel,
  vehicleColors,
} from "./dispatchView";
import type {
  BrokerDelivery,
  DispatchTrip,
  DispatchPreview,
  GeocodeResult,
  Place,
  Traffic,
  DispatchConfig,
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
  const [stopSelection, setStopSelection] = useState<StopSelection | null>(
    null,
  );
  const [mapFocus, setMapFocus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  const creating = useRef(false);
  const acting = useRef(false);
  const createIntent = useRef<{ body: string; key: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [vehicle, setVehicle] = useState("");
  const [config, setConfig] = useState<DispatchConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [depot, setDepot] = useState<Place | null>(null);
  const [parcels, setParcels] = useState(1);
  const [deadline, setDeadline] = useState(120);
  const [draft, setDraft] = useState<BrokerDelivery[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<BrokerOrder[]>([]);
  const untrackedDraft = useRef<BrokerDelivery[]>([]);
  const composer = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [preview, setPreview] = useState<DispatchPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRequest = useRef<AbortController | null>(null);
  const draftSnapshot = useRef(draft);
  draftSnapshot.current = draft;
  const [showPreview, setShowPreview] = useState(true);
  const [showTrips, setShowTrips] = useState(true);
  const [tripFilter, setTripFilter] = useState("all");
  const [mapTarget, setMapTarget] = useState<"selected" | "draft" | "all">(
    "selected",
  );
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [trafficError, setTrafficError] = useState("");
  const [showRoadworks, setShowRoadworks] = useState(false);
  const [trafficRefresh, setTrafficRefresh] = useState(0);
  const colors = useMemo(
    () => ({
      ...vehicleColors(trips.map((trip) => trip.vehicle_id)),
      ...vehicleColors(config?.vehicles.map((item) => item.id) || []),
    }),
    [trips, config],
  );

  useEffect(() => {
    const controller = new AbortController();
    api<DispatchConfig>("/dispatch/config", controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(value.vehicles) || !value.vehicles.length)
          throw new Error(
            "La configuration de flotte est indisponible. Actualisez après le redémarrage du serveur.",
          );
        setConfig(value);
        setVehicle((current) =>
          selectedVehicleAfterConfig(current, value.vehicles),
        );
        setConfigError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setConfigError(
            reason instanceof Error
              ? reason.message
              : "Configuration indisponible",
          );
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    previewRequest.current?.abort();
    setPreview(null);
    setPreviewError("");
    setPreviewBusy(false);
    return () => previewRequest.current?.abort();
  }, [draft]);

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
  const selectedStop = selectedDispatchStop(
    stopSelection,
    chosen,
    showTrips && (tripFilter === "all" || chosen?.status === tripFilter),
  );
  useEffect(() => {
    if (stopSelection && !selectedStop) setStopSelection(null);
  }, [stopSelection, selectedStop]);

  const selectTrip = (id: string) => {
    if (id !== selected) setStopSelection(null);
    setSelected(id);
    setShowTrips(true);
    setTripFilter("all");
    setMapTarget("selected");
    setMapFocus((n) => n + 1);
  };
  const selectStop = (tripId: string, stopId: string) => {
    if (
      !trips.some(
        (trip) =>
          trip.id === tripId && trip.stops.some((stop) => stop.id === stopId),
      )
    )
      return;
    setSelected(tripId);
    setStopSelection({ tripId, stopId });
    setShowTrips(true);
    setTripFilter("all");
  };
  const active = trips.filter((trip) => trip.status === "running").length;
  const planned = trips.filter((trip) => trip.status === "ready").length;
  const visibleTrips = trips.filter(
    (trip) => tripFilter === "all" || trip.status === tripFilter,
  );
  const draftPlaces = [
    ...draft.flatMap((delivery, index) => [
      {
        ...delivery.pickup,
        label: `${index + 1}. Ramassage · ${delivery.pickup.label}`,
      },
      {
        ...delivery.dropoff,
        label: `${index + 1}. Livraison · ${delivery.dropoff.label}`,
      },
    ]),
    ...(pickup
      ? [{ ...pickup, label: `Saisie · Ramassage · ${pickup.label}` }]
      : []),
    ...(dropoff
      ? [{ ...dropoff, label: `Saisie · Livraison · ${dropoff.label}` }]
      : []),
  ];

  function focusDraft() {
    setMapTarget("draft");
    setMapFocus((n) => n + 1);
  }

  async function previewDraft() {
    if (!draft.length || previewBusy) return;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewBusy(true);
    setPreviewError("");
    setPreview(null);
    try {
      const value = await api<DispatchPreview>(
        "/dispatch/preview",
        controller.signal,
        {
          deliveries: draft.map(({ pickup, dropoff, parcels }) => ({
            pickup,
            dropoff,
            parcels,
          })),
        },
      );
      if (!controller.signal.aborted) {
        setPreview(value);
        setShowPreview(true);
        focusDraft();
      }
    } catch (reason) {
      if (!controller.signal.aborted)
        setPreviewError(
          reason instanceof Error ? reason.message : "Aperçu indisponible",
        );
    } finally {
      if (!controller.signal.aborted) setPreviewBusy(false);
    }
  }

  function addDelivery() {
    if (selectedOrders.length) return;
    if (draft.length >= 10 && editing == null) {
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
    const delivery = {
      id:
        editing == null
          ? crypto.randomUUID()
          : (draft[editing].id ?? crypto.randomUUID()),
      pickup,
      dropoff,
      parcels,
      deadline_minutes: deadline,
    };
    setDraft((current) =>
      editing == null
        ? [...current, delivery]
        : current.map((item, index) => (index === editing ? delivery : item)),
    );
    setEditing(null);
    setPickup(null);
    setDropoff(null);
    setParcels(1);
    setFormError("");
    focusDraft();
  }

  async function createTrip() {
    if (creating.current || selectedOrders.length) return;
    if (configError || !config?.vehicles.some((item) => item.id === vehicle)) {
      setFormError(
        "Chargez une configuration de flotte valide avant de créer un trajet.",
      );
      return;
    }
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
    const submittedDraft = draft;
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
      if (draftSnapshot.current === submittedDraft) setDraft([]);
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
          <h2>Des commandes aux tournées.</h2>
          <p>
            Centralisez les demandes, comparez les affectations et vérifiez
            chaque tournée. Routes réelles, positions et livraisons simulées.
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
      <OrderBoard
        draft={selectedOrders.length ? [] : draft}
        refreshKey={refresh}
        onSelectOrders={(orders) => {
          if (!selectedOrders.length) untrackedDraft.current = draft;
          setSelectedOrders(orders);
          setDraft(
            orders.map((order) => ({
              id: order.id,
              pickup: order.pickup,
              dropoff: order.dropoff,
              parcels: order.parcels,
              deadline_minutes: order.deadline_minutes,
            })),
          );
          setEditing(null);
          setPickup(null);
          setDropoff(null);
          setFormError("");
          focusDraft();
          composer.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }}
      />
      <div className="dispatch-board">
        <section
          ref={composer}
          className="dispatch-composer"
          aria-labelledby="dispatch-create-title"
        >
          <div className="dispatch-section-head">
            <span className="dispatch-icon">
              <Plus size={19} />
            </span>
            <div>
              <span className="dispatch-kicker">PRÉPARATION / AFFECTATION</span>
              <h2 id="dispatch-create-title">Préparer les livraisons</h2>
            </div>
          </div>
          {selectedOrders.length > 0 && (
            <div className="dispatch-order-context" role="status">
              <strong>{selectedOrders.length} commande(s) du carnet</strong>
              <p>
                {selectedOrders.map((order) => order.reference).join(" · ")}
              </p>
              <p>
                Ces livraisons restent liées à leurs commandes. La planification
                les réserve ensemble ; les tournées attendent votre démarrage.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedOrders([]);
                  setDraft(untrackedDraft.current);
                  setEditing(null);
                  setPickup(null);
                  setDropoff(null);
                }}
              >
                Revenir à la saisie libre · conserver les commandes au carnet
              </button>
            </div>
          )}
          <fieldset
            className="dispatch-inputs"
            disabled={selectedOrders.length > 0}
          >
            <legend className="sr-only">Saisie des lieux et colis</legend>
            <p className="dispatch-helper">
              Recherchez des lieux publics ou des adresses, puis choisissez
              chaque résultat avant d’ajouter la livraison.
            </p>
            <PlaceSearch
              label="Lieu de ramassage"
              place={pickup}
              onChange={(place) => {
                setPickup(place);
                if (place) focusDraft();
              }}
            />
            <PlaceSearch
              label="Lieu de livraison"
              place={dropoff}
              onChange={(place) => {
                setDropoff(place);
                if (place) focusDraft();
              }}
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
              disabled={
                busy === "create" || (draft.length >= 10 && editing == null)
              }
            >
              <Plus size={16} />{" "}
              {editing == null
                ? "Ajouter cette livraison"
                : `Mettre à jour la livraison ${editing + 1}`}
            </button>
            {editing != null && (
              <button
                type="button"
                className="dispatch-example"
                onClick={() => {
                  setEditing(null);
                  setPickup(null);
                  setDropoff(null);
                }}
              >
                Annuler la modification
              </button>
            )}
          </fieldset>
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
                    disabled={busy === "create" || selectedOrders.length > 0}
                    aria-label={`Modifier la livraison ${index + 1}`}
                    onClick={() => {
                      setPickup(item.pickup);
                      setDropoff(item.dropoff);
                      setParcels(item.parcels);
                      setDeadline(item.deadline_minutes ?? 120);
                      setEditing(index);
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={busy === "create" || selectedOrders.length > 0}
                    aria-label={`Retirer la livraison ${index + 1}`}
                    onClick={() => {
                      if (editing != null) {
                        setPickup(null);
                        setDropoff(null);
                      }
                      setEditing(null);
                      setDraft((current) =>
                        current.filter((_, i) => i !== index),
                      );
                    }}
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
            disabled={busy === "create" || selectedOrders.length > 0}
            onClick={() => {
              setDraft(
                EXAMPLE.map((item) => ({ ...item, id: crypto.randomUUID() })),
              );
              setEditing(null);
              setPickup(null);
              setDropoff(null);
              focusDraft();
              setFormError("");
            }}
          >
            Exemple facultatif : charger deux livraisons
          </button>
          <div className="dispatch-preview-controls">
            <button
              type="button"
              className="dispatch-preview-button"
              disabled={!draft.length || previewBusy}
              onClick={() => void previewDraft()}
            >
              {previewBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Route size={16} />
              )}{" "}
              Aperçu routier des livraisons
            </button>
            {previewBusy && (
              <button
                type="button"
                onClick={() => {
                  previewRequest.current?.abort();
                  setPreviewBusy(false);
                }}
              >
                Annuler l’aperçu
              </button>
            )}
            <p>
              Ordre saisi, départ au premier ramassage. Aucun véhicule réservé
              et aucun appel IA ; les délais et l’affectation seront vérifiés
              lors de la planification.
            </p>
            {previewError && (
              <p className="dispatch-error" role="alert">
                {previewError}
              </p>
            )}
            {preview && (
              <p className="dispatch-preview-summary" role="status">
                Aperçu · {preview.route.distance_km.toFixed(1)} km ·{" "}
                {Math.round(preview.route.duration_minutes)} min routières
                estimées · {preview.stops.length} arrêts. Toute modification
                invalide cet aperçu.
              </p>
            )}
          </div>
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
              Choisissez votre point de départ pour les véhicules sans position
              connue. L’aperçu manuel peut être calculé sans dépôt.
            </p>
          </div>
          <BrokerPlanning
            deliveries={draft}
            orderIds={
              selectedOrders.length
                ? selectedOrders.map((order) => order.id)
                : undefined
            }
            depot={depot}
            trips={trips}
            onPlanSubmitted={() => setRefresh((n) => n + 1)}
            onTripsCreated={(ids) => {
              setRefresh((n) => n + 1);
              if (ids[0]) selectTrip(ids[0]);
            }}
          />
          {!selectedOrders.length && (
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
                  disabled={!config || !!configError}
                  onChange={(event) => setVehicle(event.target.value)}
                >
                  {!config && (
                    <option value="">Chargement de la flotte…</option>
                  )}
                  {config?.vehicles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.capacity_parcels} colis
                    </option>
                  ))}
                </select>
              </label>
              {configError && (
                <p role="alert">
                  {configError}{" "}
                  <button
                    type="button"
                    onClick={() => setRefresh((value) => value + 1)}
                  >
                    Réessayer
                  </button>
                </p>
              )}
              <button
                type="button"
                className="dispatch-create"
                disabled={
                  busy === "create" ||
                  !draft.length ||
                  !config ||
                  !!configError ||
                  !vehicle
                }
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
          )}
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
            colors={colors}
            trips={showTrips ? visibleTrips : []}
            selected={selected}
            selectedStopId={selectedStop?.id || ""}
            onSelect={selectTrip}
            onSelectStop={selectStop}
            focusVersion={mapFocus}
            focusTarget={mapTarget}
            draftPlaces={showPreview ? draftPlaces : []}
            preview={showPreview ? preview : null}
            roadworks={traffic?.available ? traffic.items : []}
            showRoadworks={showRoadworks}
          />
          <div className="dispatch-map-foot">
            <div className="dispatch-legend">
              {[
                ...new Set([
                  ...(config?.vehicles.map((item) => item.id) || []),
                  ...trips.map((trip) => trip.vehicle_id),
                ]),
              ].map((id) => (
                <span key={id}>
                  <i style={{ background: colors[id] || dispatchColor(id) }} />
                  {vehicleLabel(id, config?.vehicles || [])}
                </span>
              ))}
              <span>
                <i className="roadwork" />
                Chantier déclaré
              </span>
              <span>
                <i className="draft" />
                Saisie / aperçu (pointillé)
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
          <div className="dispatch-map-filters">
            <label>
              <input
                type="checkbox"
                checked={showPreview}
                onChange={(event) => setShowPreview(event.target.checked)}
              />{" "}
              Saisie et aperçu
            </label>
            <label>
              <input
                type="checkbox"
                checked={showTrips}
                onChange={(event) => setShowTrips(event.target.checked)}
              />{" "}
              Trajets enregistrés
            </label>
            <label>
              État{" "}
              <select
                value={tripFilter}
                onChange={(event) => setTripFilter(event.target.value)}
              >
                <option value="all">Tous</option>
                <option value="ready">Prêts</option>
                <option value="running">En simulation</option>
                <option value="completed">Terminés</option>
                <option value="cancelled">Annulés</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setMapTarget("all");
                setMapFocus((n) => n + 1);
              }}
            >
              Voir les routes affichées
            </button>
            <button
              type="button"
              disabled={!draftPlaces.length}
              onClick={focusDraft}
            >
              Centrer la saisie
            </button>
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
                      style={{
                        background:
                          colors[trip.vehicle_id] ||
                          dispatchColor(trip.vehicle_id),
                      }}
                    />
                    <strong>
                      {vehicleLabel(trip.vehicle_id, config?.vehicles || [])}
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
          {chosen && (
            <TripDetail
              key={chosen.id}
              trip={chosen}
              selectedStopId={selectedStop?.id || ""}
              onSelectStop={(stopId) => selectStop(chosen.id, stopId)}
              onClearStop={() => setStopSelection(null)}
              busy={busy}
              onAction={act}
            />
          )}
        </aside>
      </div>
      <RouteLibrary
        refreshVersion={
          refresh + trips.filter((trip) => trip.status === "completed").length
        }
        onLoad={(deliveries) => {
          setSelectedOrders([]);
          setDraft(
            deliveries.map((item) => ({ ...item, id: crypto.randomUUID() })),
          );
          setEditing(null);
          setPickup(null);
          setDropoff(null);
          setFormError("");
          focusDraft();
        }}
      />
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
  const previousPlace = useRef<Place | null>(null);
  const resultList = useRef<HTMLUListElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const statusId = useId();
  useEffect(() => {
    const previous = previousPlace.current;
    setText((current) =>
      place ? place.label : previous?.label === current ? "" : current,
    );
    previousPlace.current = place;
    if (place) {
      request.current += 1;
      controller.current?.abort();
      setSearching(false);
      setItems([]);
      setError("");
    }
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
            ref={searchInput}
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
              if (event.key === "ArrowDown" && items.length) {
                event.preventDefault();
                resultList.current?.querySelector("button")?.focus();
              }
              if (event.key === "Escape") {
                request.current += 1;
                controller.current?.abort();
                setSearching(false);
                setItems([]);
                setError("");
              }
            }}
            placeholder="Adresse ou lieu à Montréal"
            aria-label={label}
            aria-describedby={statusId}
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
              setItems([]);
              setError("");
            }}
          >
            <X size={13} />
          </button>
        </span>
      )}
      {items.length > 0 && (
        <ul
          ref={resultList}
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
                  onChange({
                    label: item.label,
                    coordinates: item.coordinates,
                  });
                  setText(item.label);
                  setItems([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const buttons =
                      resultList.current?.querySelectorAll<HTMLButtonElement>(
                        "button",
                      );
                    buttons?.[
                      (index +
                        (event.key === "ArrowDown" ? 1 : items.length - 1)) %
                        items.length
                    ]?.focus();
                  }
                  if (event.key === "Escape") {
                    setItems([]);
                    searchInput.current?.focus();
                  }
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
      <span id={statusId} className="dispatch-search-status" role="status">
        {searching
          ? "Recherche en cours…"
          : items.length
            ? `${items.length} résultats. Flèche bas pour les parcourir, Entrée pour choisir.`
            : !place && text.trim().length >= 3
              ? "Recherchez puis choisissez un résultat pour valider cette adresse."
              : ""}
      </span>
    </div>
  );
}

export function TripDetail({
  trip,
  selectedStopId,
  onSelectStop,
  onClearStop,
  busy,
  onAction,
}: {
  trip: DispatchTrip;
  selectedStopId: string;
  onSelectStop: (stopId: string) => void;
  onClearStop: () => void;
  busy: string;
  onAction: (id: string, action: "start" | "cancel") => Promise<void>;
}) {
  const stopList = useRef<HTMLOListElement>(null);
  const detailId = useId();
  const selectedStop = trip.stops.find((stop) => stop.id === selectedStopId);
  const pairedStop =
    selectedStop &&
    trip.stops.find(
      (stop) =>
        stop.delivery_id === selectedStop.delivery_id &&
        stop.kind !== selectedStop.kind,
    );
  useEffect(() => {
    const list = stopList.current;
    const row = list?.querySelector<HTMLElement>(".selected");
    if (list && row) list.scrollTop = Math.max(0, row.offsetTop - 8);
  }, [selectedStopId]);

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
      <div className="dispatch-schedule-head">
        <h3>
          Ordre de passage <span>{trip.stops.length} arrêts</span>
        </h3>
        <p>Choisissez un arrêt pour le repérer et consulter ses détails.</p>
      </div>
      <ol
        className="dispatch-stop-list"
        ref={stopList}
        aria-label="Arrêts dans l’ordre du trajet"
      >
        {trip.stops.map((stop, index) => (
          <li
            key={stop.id}
            className={`${stop.status === "completed" ? "completed" : ""} ${stop.id === selectedStopId ? "selected" : ""}`}
          >
            <button
              type="button"
              className="dispatch-stop-select"
              aria-pressed={stop.id === selectedStopId}
              aria-controls={detailId}
              onClick={() => onSelectStop(stop.id)}
            >
              <span className="dispatch-stop-index" aria-hidden="true">
                {index + 1}
              </span>
              <span className="dispatch-stop-text">
                <strong>
                  {index + 1}.{" "}
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
              </span>
            </button>
          </li>
        ))}
      </ol>
      <section
        className="dispatch-stop-detail"
        id={detailId}
        aria-label="Détails de l’arrêt sélectionné"
      >
        {selectedStop ? (
          <>
            <div className="dispatch-stop-detail-head">
              <h3>
                Arrêt {trip.stops.indexOf(selectedStop) + 1} ·{" "}
                {selectedStop.kind === "pickup" ? "Ramassage" : "Livraison"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  stopList.current
                    ?.querySelector<HTMLButtonElement>(".selected button")
                    ?.focus({ preventScroll: true });
                  onClearStop();
                }}
                aria-label="Fermer les détails de l’arrêt"
              >
                <X size={15} />
              </button>
            </div>
            <p className="dispatch-stop-address" role="status">
              {selectedStop.label}
            </p>
            <dl>
              <div>
                <dt>État simulé</dt>
                <dd>
                  {selectedStop.status === "completed"
                    ? "Arrêt terminé"
                    : trip.status === "cancelled"
                      ? "Non desservi · annulé"
                      : "À desservir"}
                </dd>
              </div>
              <div>
                <dt>Arrivée simulée prévue</dt>
                <dd>
                  {selectedStop.eta_at
                    ? `${fmtTime(selectedStop.eta_at)} · Montréal`
                    : `Départ + ${Math.round(selectedStop.eta_seconds / 60)} min`}
                </dd>
              </div>
              <div>
                <dt>Arrêt associé</dt>
                <dd>
                  {pairedStop ? (
                    <button
                      type="button"
                      onClick={() => onSelectStop(pairedStop.id)}
                    >
                      Arrêt {trip.stops.indexOf(pairedStop) + 1} ·{" "}
                      {pairedStop.kind === "pickup" ? "Ramassage" : "Livraison"}{" "}
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    "Non exposé"
                  )}
                </dd>
              </div>
              <div>
                <dt>Source routière</dt>
                <dd>{trip.route.source || "Indisponible"}</dd>
              </div>
              <div>
                <dt>Calcul routier</dt>
                <dd>{fmtDate(trip.route.computed_at)}</dd>
              </div>
            </dl>
            <p className="dispatch-stop-evidence">
              Fenêtres, charge à cet arrêt et certificat non exposés dans ce
              trajet. Consultez le résultat du courtier pour les contraintes
              validées.
            </p>
          </>
        ) : (
          <p className="dispatch-stop-prompt">
            La liste reste utilisable si le fond de carte est indisponible.
          </p>
        )}
      </section>
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
