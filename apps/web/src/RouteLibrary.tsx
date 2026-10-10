import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { api } from "./api";
import type {
  BrokerDelivery,
  RouteHistory,
  RouteHistoryDetail,
} from "./dispatchTypes";

const format = (value: number | null, digits = 1) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: digits }).format(
        value,
      );

export function RouteLibrary({
  refreshVersion,
  onLoad,
}: {
  refreshVersion: number;
  onLoad: (deliveries: BrokerDelivery[]) => void;
}) {
  const [page, setPage] = useState<{
    items: RouteHistory[];
    scanned_trip_count: number;
    history_limit: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("");
  const [loaded, setLoaded] = useState("");
  const [expanded, setExpanded] = useState("");
  const [detail, setDetail] = useState<RouteHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailController = useRef<AbortController | null>(null);
  useEffect(() => () => detailController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    detailController.current?.abort();
    setExpanded("");
    setDetail(null);
    api<NonNullable<typeof page>>("/dispatch/routes", controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setPage(value);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Historique indisponible",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshVersion, refresh]);
  const items =
    page?.items.filter((item) =>
      `${item.name} ${item.deliveries.map((delivery) => `${delivery.pickup.label} ${delivery.dropoff.label}`).join(" ")}`
        .toLocaleLowerCase("fr-CA")
        .includes(filter.toLocaleLowerCase("fr-CA")),
    ) ?? [];
  async function inspect(id: string) {
    detailController.current?.abort();
    if (expanded === id) {
      setExpanded("");
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    detailController.current = controller;
    setExpanded(id);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const value = await api<RouteHistoryDetail>(
        `/dispatch/routes/${encodeURIComponent(id)}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setDetail(value);
    } catch (reason) {
      if (!controller.signal.aborted)
        setDetailError(
          reason instanceof Error ? reason.message : "Variantes indisponibles",
        );
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }
  return (
    <section
      className="dispatch-library"
      aria-labelledby="dispatch-library-title"
    >
      <div className="dispatch-library-head">
        <div>
          <span className="dispatch-kicker">MÉMOIRE DES TOURNÉES</span>
          <h2 id="dispatch-library-title">Trajets habituels et efficacité</h2>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((n) => n + 1)}
          aria-label="Actualiser l’historique des routes"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p>
        Chaque groupe rapproche les mêmes livraisons. Les temps et cadences
        proviennent uniquement de simulations terminées ; aucun temps GPS ni
        gain financier mesuré.
      </p>
      <p>
        Le temps inclut l’approche depuis la position du véhicule et le service.
        Les positions de départ peuvent varier ; ces moyennes ne mesurent pas
        l’effet du seul ordre des arrêts.
      </p>
      <label className="dispatch-library-filter">
        Filtrer par lieu ou tournée
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Adresse, nom de tournée…"
        />
      </label>
      {error && (
        <p className="dispatch-error" role="alert">
          {error}
          {page ? " · Dernier historique conservé." : ""}
        </p>
      )}
      {loading && <p role="status">Chargement de l’historique…</p>}
      {loaded && (
        <p className="dispatch-library-loaded" role="status">
          {loaded} chargé dans les livraisons à planifier. Modifiez les arrêts
          puis recalculez l’aperçu ou planifiez avec des contrôles à jour.
        </p>
      )}
      {!loading && page && !items.length ? (
        <p>
          {page?.items.length
            ? "Aucune tournée ne correspond au filtre."
            : "Aucune tournée enregistrée. Créez des trajets pour constituer cet historique."}
        </p>
      ) : items.length > 0 ? (
        <div
          className="dispatch-library-table"
          tabIndex={0}
          aria-label="Historique des tournées, défilement horizontal disponible"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Tournée / lieux</th>
                <th scope="col">Fréquence</th>
                <th scope="col">Échantillons terminés</th>
                <th scope="col">Temps simulé moyen / médian</th>
                <th scope="col">Distance moyenne</th>
                <th scope="col">Cadence simulée</th>
                <th scope="col">À l’heure</th>
                <th scope="col">Réutiliser</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <th scope="row">
                      <strong>{item.name}</strong>
                      {item.completed_sample_count >= 2 && (
                        <small className="dispatch-habitual">
                          Habituelle · au moins deux simulations terminées
                        </small>
                      )}
                      <span>
                        {item.deliveries
                          .map(
                            (delivery) =>
                              `${delivery.pickup.label} → ${delivery.dropoff.label}`,
                          )
                          .join(" · ")}
                      </span>
                      <button
                        className="dispatch-library-inspect"
                        type="button"
                        aria-expanded={expanded === item.id}
                        onClick={() => void inspect(item.id)}
                      >
                        {expanded === item.id ? "Masquer" : "Comparer"} les{" "}
                        {item.variant_count} ordre(s) enregistré(s)
                      </button>
                    </th>
                    <td>{item.trip_count} trajet(s)</td>
                    <td>{item.completed_sample_count}</td>
                    <td>
                      {format(
                        item.mean_elapsed_simulation_seconds == null
                          ? null
                          : item.mean_elapsed_simulation_seconds / 60,
                      )}{" "}
                      /{" "}
                      {format(
                        item.p50_elapsed_simulation_seconds == null
                          ? null
                          : item.p50_elapsed_simulation_seconds / 60,
                      )}{" "}
                      min
                    </td>
                    <td>{format(item.mean_distance_km)} km</td>
                    <td>
                      {format(item.deliveries_per_simulation_hour)}{" "}
                      livraison(s)/h
                    </td>
                    <td>
                      {item.on_time_rate == null
                        ? "Non mesuré"
                        : `${format(item.on_time_rate * 100, 0)} % (${item.on_time_sample_count})`}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dispatch-library-load"
                        onClick={() => {
                          onLoad(
                            item.deliveries.map((delivery) => ({
                              ...delivery,
                              pickup: { ...delivery.pickup },
                              dropoff: { ...delivery.dropoff },
                            })),
                          );
                          setLoaded(item.name);
                        }}
                      >
                        Charger et modifier <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                  {expanded === item.id && (
                    <tr className="dispatch-variant-row">
                      <td colSpan={8}>
                        {detailLoading ? (
                          <p role="status">
                            Chargement des ordres historiques…
                          </p>
                        ) : detailError ? (
                          <p className="dispatch-error" role="alert">
                            {detailError}
                          </p>
                        ) : detail ? (
                          <>
                            <p>
                              Ordres effectivement enregistrés. La plus faible
                              moyenne observée compare uniquement ces
                              simulations terminées ; les routes et délais
                              actuels seront recalculés.
                            </p>
                            <div className="dispatch-variants">
                              {detail.variants.map((variant, index) => (
                                <article
                                  key={variant.id}
                                  className={
                                    variant.id ===
                                    detail.best_observed_variant_id
                                      ? "best"
                                      : ""
                                  }
                                >
                                  <strong>
                                    Ordre {index + 1}
                                    {variant.id ===
                                    detail.best_observed_variant_id
                                      ? " · plus faible temps moyen observé"
                                      : ""}
                                  </strong>
                                  <p>
                                    {variant.trip_count} trajet(s) ·{" "}
                                    {variant.completed_sample_count}{" "}
                                    simulation(s) terminée(s)
                                  </p>
                                  <p>
                                    Moyenne / médiane :{" "}
                                    {format(
                                      variant.mean_elapsed_simulation_seconds ==
                                        null
                                        ? null
                                        : variant.mean_elapsed_simulation_seconds /
                                            60,
                                    )}{" "}
                                    /{" "}
                                    {format(
                                      variant.p50_elapsed_simulation_seconds ==
                                        null
                                        ? null
                                        : variant.p50_elapsed_simulation_seconds /
                                            60,
                                    )}{" "}
                                    min · {format(variant.mean_distance_km)} km
                                  </p>
                                  <ol>
                                    {variant.stops?.map((stop, stopIndex) => (
                                      <li
                                        key={`${stopIndex}-${stop.delivery_id}`}
                                      >
                                        {stop.kind === "pickup"
                                          ? "Ramassage"
                                          : "Livraison"}{" "}
                                        · {stop.label}
                                      </li>
                                    ))}
                                  </ol>
                                  <small>
                                    Recharger les livraisons permet de les
                                    modifier. L’ordre de cette variante n’est
                                    pas imposé au nouveau solveur.
                                  </small>
                                </article>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {page && (
        <p className="dispatch-library-scope">
          Fenêtre : {page.scanned_trip_count} trajets examinés, au plus{" "}
          {page.history_limit}. Une répétition historique ne garantit pas la
          faisabilité actuelle. Le chargement ne réserve aucun véhicule.
        </p>
      )}
    </section>
  );
}
