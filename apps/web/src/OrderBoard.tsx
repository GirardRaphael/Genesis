import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  Download,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react";
import type { BrokerDelivery } from "./dispatchTypes";
import {
  draftOrderInput,
  ORDER_CSV_TEMPLATE,
  ORDER_LIMIT,
  ORDER_PAYLOAD_BYTES,
  OrderApiError,
  ordersRequest,
  orderStatusLabel,
  payloadBytes,
  orderDraftKey,
  reconcileOrderDraft,
  selectedOpenOrders,
  toggleOrderSelection,
  validateOrderBatch,
  type BrokerOrder,
  type OrderIssue,
  type OrderPage,
  type OrderPreview,
  type OrderStatus,
  type OrderDraftRow,
} from "./orderData";
import "./OrderBoard.css";

const newReference = () =>
  `COM-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
const errorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Requête indisponible. Réessayez.";
const dateLabel = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "Date non définie";

function OrderErrors({ issues }: { issues: OrderIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="orders-errors" role="alert">
      <strong>Corrigez les champs avant d’enregistrer.</strong>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.row}-${issue.field}-${index}`}>
            {issue.row > 0 ? `Ligne ${issue.row} · ` : ""}
            {issue.field}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrderBoard({
  draft,
  onSelectOrders,
  refreshKey = 0,
}: {
  draft: BrokerDelivery[];
  onSelectOrders: (orders: BrokerOrder[]) => void;
  refreshKey?: number;
}) {
  const id = useId();
  const [page, setPage] = useState<OrderPage | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("open");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [cancelId, setCancelId] = useState("");
  const [busy, setBusy] = useState("");
  const mutation = useRef(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [rows, setRows] = useState<OrderDraftRow[]>(() =>
    reconcileOrderDraft(draft, [], newReference),
  );
  const priorDraftRows = useRef(rows);
  const [draftErrors, setDraftErrors] = useState<OrderIssue[]>([]);
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");
  const draftFingerprint = JSON.stringify(
    draft.map((delivery) => [delivery.id, orderDraftKey(delivery)]),
  );

  useEffect(() => {
    setRows((previous) =>
      reconcileOrderDraft(
        draft,
        previous.length ? previous : priorDraftRows.current,
        newReference,
      ),
    );
    setDraftErrors([]);
  }, [draftFingerprint]);
  // Selecting tracked orders hides the freeform draft; returning restores its intake metadata.
  useEffect(() => {
    if (rows.length) priorDraftRows.current = rows;
  }, [rows]);
  useEffect(() => {
    setSelected([]);
    setCancelId("");
  }, [query, status]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setRefresh((value) => value + 1),
      15000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ limit: "100", q: query.trim() });
      if (status) params.set("status", status);
      try {
        const value = await ordersRequest<OrderPage>(
          `?${params}`,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setPage(value);
          setListError("");
          setSelected((previous) =>
            selectedOpenOrders(previous, value.items).map((order) => order.id),
          );
        }
      } catch (reason) {
        if (!controller.signal.aborted) setListError(errorMessage(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, status, refresh, refreshKey]);

  const selectedOrders = selectedOpenOrders(selected, page?.items ?? []);
  const counts = (Object.keys(orderStatusLabel) as OrderStatus[]).map(
    (value) => ({
      value,
      count: page?.items.filter((item) => item.status === value).length ?? 0,
    }),
  );
  const rowsCurrent =
    rows.length === draft.length &&
    rows.every(
      (row, index) =>
        row.deliveryId === draft[index].id &&
        row.key === orderDraftKey(draft[index]),
    );

  async function saveDraft() {
    if (mutation.current || !rowsCurrent) return;
    const items = draft.map((delivery, index) =>
      draftOrderInput(delivery, rows[index].metadata),
    );
    const issues = validateOrderBatch(items);
    setDraftErrors(issues);
    setActionError("");
    setNotice("");
    if (issues.length) return;
    mutation.current = true;
    setBusy("save");
    try {
      const result = await ordersRequest<OrderPage>("/batch", { items });
      setNotice(
        `${result.items.length} commande(s) enregistrée(s). Les mêmes références permettent une nouvelle tentative sans doublon.`,
      );
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(errorMessage(reason));
      if (reason instanceof OrderApiError) setDraftErrors(reason.issues);
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }

  async function previewFile(file: File | undefined) {
    if (!file || mutation.current) return;
    mutation.current = true;
    setBusy("preview");
    setPreview(null);
    setFileName(file.name);
    setImportError("");
    setNotice("");
    try {
      if (file.size > ORDER_PAYLOAD_BYTES)
        throw new Error(
          "Le fichier dépasse 16 Kio. Importez au maximum 10 commandes par lot.",
        );
      const bytes = await file.arrayBuffer();
      let csv: string;
      try {
        csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(
          "Le fichier doit être encodé en UTF-8. Exportez-le à nouveau en CSV UTF-8.",
        );
      }
      if (payloadBytes({ csv }) > ORDER_PAYLOAD_BYTES)
        throw new Error("Le fichier encodé dépasse 16 Kio. Réduisez le lot.");
      setPreview(await ordersRequest<OrderPreview>("/import/preview", { csv }));
    } catch (reason) {
      setImportError(errorMessage(reason));
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }

  async function commitImport() {
    if (mutation.current || !preview?.items.length || preview.errors.length)
      return;
    const issues = validateOrderBatch(preview.items);
    if (issues.length) {
      setPreview({ ...preview, errors: issues });
      return;
    }
    mutation.current = true;
    setBusy("import");
    setImportError("");
    setNotice("");
    try {
      const result = await ordersRequest<OrderPage>("/batch", {
        items: preview.items,
      });
      setNotice(
        `${result.items.length} commande(s) importée(s). L’ensemble du lot est enregistré.`,
      );
      setPreview(null);
      setFileName("");
      setRefresh((value) => value + 1);
    } catch (reason) {
      setImportError(errorMessage(reason));
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }

  async function cancelOrder(order: BrokerOrder) {
    if (mutation.current || order.status !== "open") return;
    mutation.current = true;
    setBusy(order.id);
    setActionError("");
    setNotice("");
    try {
      await ordersRequest<unknown>(`/${encodeURIComponent(order.id)}/cancel`, {
        version: order.version,
      });
      setNotice(
        `Commande ${order.reference} annulée. Son historique est conservé.`,
      );
      setSelected((previous) => previous.filter((value) => value !== order.id));
      setCancelId("");
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(errorMessage(reason));
      setRefresh((value) => value + 1);
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([ORDER_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "modele-commandes-genesis.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="order-board" aria-labelledby={`${id}-title`}>
      <header className="orders-heading">
        <span className="orders-icon">
          <ClipboardList size={20} aria-hidden="true" />
        </span>
        <div>
          <span className="dispatch-kicker">CARNET DE COMMANDES</span>
          <h2 id={`${id}-title`}>
            Des commandes reçues aux tournées préparées
          </h2>
        </div>
        <button
          type="button"
          className="orders-refresh"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
          aria-label="Actualiser les commandes"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </header>
      <p className="orders-lead">
        Vos commandes et leurs adresses restent enregistrées après un
        rechargement. Sélectionnez jusqu’à 10 commandes à planifier, puis
        vérifiez la proposition avant de démarrer une simulation.
      </p>
      <div className="orders-columns">
        <div className="orders-backlog">
          <div className="orders-filters">
            <label>
              Référence ou client
              <input
                type="search"
                value={query}
                maxLength={120}
                placeholder="Rechercher une commande…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              État
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as OrderStatus | "")
                }
              >
                <option value="">Tous les états</option>
                {Object.entries(orderStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="orders-counts"
            aria-label="États dans la liste affichée"
          >
            {counts.map(({ value, count }) => (
              <span key={value}>
                <b>{count}</b> {orderStatusLabel[value]}
              </span>
            ))}
          </div>
          <p className="orders-scope" role="status">
            {loading
              ? "Actualisation de la liste…"
              : page
                ? `${page.items.length} affichée(s) sur ${page.total} commande(s) correspondant aux filtres${page.total > page.items.length ? " · liste limitée à 100, précisez votre recherche" : ""}.`
                : "Liste indisponible."}
          </p>
          {listError && (
            <p className="orders-error" role="alert">
              {listError}{" "}
              <button
                type="button"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Réessayer
              </button>
            </p>
          )}
          <div className="orders-list" aria-busy={loading}>
            {!loading && !listError && !page?.items.length && (
              <p className="orders-empty">
                {query || status !== "open"
                  ? "Aucune commande ne correspond à ces filtres."
                  : "Aucune commande à planifier. Enregistrez vos adresses ou importez un fichier CSV."}
              </p>
            )}
            {page?.items.map((order) => (
              <article
                className={`orders-card${selected.includes(order.id) ? " is-selected" : ""}`}
                key={order.id}
              >
                <label className="orders-select">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner la commande ${order.reference}`}
                    checked={selected.includes(order.id)}
                    disabled={
                      loading ||
                      !!listError ||
                      !!busy ||
                      order.status !== "open" ||
                      (selected.length >= ORDER_LIMIT &&
                        !selected.includes(order.id))
                    }
                    onChange={() =>
                      setSelected((previous) =>
                        toggleOrderSelection(previous, order),
                      )
                    }
                  />
                  <span className="orders-reference">{order.reference}</span>
                </label>
                <span className={`orders-status ${order.status}`}>
                  {orderStatusLabel[order.status]}
                </span>
                <p className="orders-customer">
                  {order.customer || "Client non renseigné"}
                  <span>{dateLabel(order.service_date)}</span>
                </p>
                <details className="orders-route">
                  <summary>
                    {order.parcels} colis · délai {order.deadline_minutes} min ·
                    voir les adresses
                  </summary>
                  <p>
                    <b>Ramassage</b> {order.pickup.label}
                  </p>
                  <p>
                    <b>Livraison</b> {order.dropoff.label}
                  </p>
                </details>
                {order.status === "planned" && (
                  <small className="orders-state-note">
                    Liée à une proposition · livraison réelle non confirmée.
                  </small>
                )}
                {order.status === "planning" && (
                  <small className="orders-state-note">
                    Réservée par une planification en cours.
                  </small>
                )}
                {order.status === "open" &&
                  (cancelId === order.id ? (
                    <div className="orders-confirm">
                      <p>
                        Annuler {order.reference} en conservant son historique ?
                      </p>
                      <button
                        type="button"
                        disabled={!!busy || loading || !!listError}
                        onClick={() => void cancelOrder(order)}
                      >
                        Confirmer l’annulation
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => setCancelId("")}
                      >
                        Conserver
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="orders-cancel"
                      disabled={!!busy || loading || !!listError}
                      onClick={() => setCancelId(order.id)}
                      aria-label={`Annuler la commande ${order.reference}`}
                    >
                      Annuler
                    </button>
                  ))}
              </article>
            ))}
          </div>
          <div className="orders-selection">
            <span>{selectedOrders.length} / 10 sélectionnée(s)</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])}>
                Effacer la sélection
              </button>
            )}
          </div>
          <button
            type="button"
            className="orders-primary"
            disabled={
              !selectedOrders.length || loading || !!listError || !!busy
            }
            onClick={() => {
              onSelectOrders(selectedOrders);
              setNotice(
                `${selectedOrders.length} commande(s) chargée(s) dans le formulaire de planification. Vérifiez les paramètres avant de préparer la proposition.`,
              );
            }}
          >
            Préparer ces commandes <ArrowRight size={16} aria-hidden="true" />
          </button>
          <p className="orders-footnote">
            {draft.length
              ? "La sélection remplace le brouillon d’adresses actuel dans le formulaire. "
              : ""}
            Seules les commandes « À planifier » sont sélectionnables. Une
            commande planifiée n’est pas une preuve de livraison.
          </p>
        </div>
        <aside className="orders-intake" aria-label="Ajouter des commandes">
          <details className="orders-intake-panel">
            <summary>
              <Save size={16} aria-hidden="true" />
              <span>
                Enregistrer le brouillon d’adresses
                <small>{draft.length} livraison(s) dans le formulaire</small>
              </span>
            </summary>
            <p>
              Ajoutez une référence et un client à chaque paire d’adresses. Les
              références restent identiques lors d’une nouvelle tentative. La
              date sert au classement ; elle ne définit pas une fenêtre de
              livraison.
            </p>
            {!draft.length && (
              <p className="orders-empty">
                Ajoutez des adresses dans le formulaire de planification pour
                créer un nouveau lot.
              </p>
            )}
            {draft.map((delivery, index) => {
              const row = rows[index];
              if (!row) return null;
              return (
                <fieldset
                  className="orders-draft-row"
                  key={`${row.key}-${index}`}
                  disabled={!!busy}
                >
                  <legend>Commande {index + 1}</legend>
                  <p>
                    {delivery.pickup.label} → {delivery.dropoff.label}
                  </p>
                  {(["reference", "customer", "service_date"] as const).map(
                    (field) => {
                      const issues = draftErrors.filter(
                        (issue) =>
                          issue.row === index + 1 && issue.field === field,
                      );
                      const fieldId = `${id}-draft-${index}-${field}`;
                      return (
                        <label key={field} htmlFor={fieldId}>
                          {field === "reference"
                            ? "Référence *"
                            : field === "customer"
                              ? "Client"
                              : "Date de service (classement)"}
                          <input
                            id={fieldId}
                            type={field === "service_date" ? "date" : "text"}
                            value={row.metadata[field]}
                            required={field === "reference"}
                            maxLength={
                              field === "reference"
                                ? 64
                                : field === "customer"
                                  ? 120
                                  : undefined
                            }
                            aria-invalid={issues.length > 0}
                            aria-describedby={
                              issues.length ? `${fieldId}-error` : undefined
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              setRows((previous) =>
                                previous.map((entry, rowIndex) =>
                                  rowIndex === index
                                    ? {
                                        ...entry,
                                        metadata: {
                                          ...entry.metadata,
                                          [field]: value,
                                        },
                                      }
                                    : entry,
                                ),
                              );
                              setDraftErrors((previous) =>
                                previous.filter(
                                  (issue) =>
                                    !(
                                      issue.row === index + 1 &&
                                      issue.field === field
                                    ),
                                ),
                              );
                            }}
                          />
                          {issues.length > 0 && (
                            <small
                              id={`${fieldId}-error`}
                              className="orders-field-error"
                            >
                              {issues.map((issue) => issue.message).join(" ")}
                            </small>
                          )}
                        </label>
                      );
                    },
                  )}
                </fieldset>
              );
            })}
            <OrderErrors issues={draftErrors} />
            <button
              type="button"
              className="orders-secondary"
              disabled={!draft.length || !rowsCurrent || !!busy}
              onClick={() => void saveDraft()}
            >
              <Save size={15} aria-hidden="true" />
              {busy === "save" ? "Enregistrement…" : "Enregistrer le lot"}
            </button>
          </details>
          <details className="orders-intake-panel">
            <summary>
              <Upload size={16} aria-hidden="true" />
              <span>
                Importer des commandes CSV
                <small>UTF-8 · 10 commandes maximum</small>
              </span>
            </summary>
            <p>
              Les adresses et leurs coordonnées sont obligatoires. Le serveur
              vérifie le fichier avant l’enregistrement ; aucun lot comportant
              une erreur n’est importé.
            </p>
            <button
              type="button"
              className="orders-template"
              onClick={downloadTemplate}
            >
              <Download size={14} aria-hidden="true" />
              Télécharger le modèle CSV
            </button>
            <label className="orders-file">
              Fichier CSV UTF-8
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={!!busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void previewFile(file);
                }}
              />
            </label>
            {busy === "preview" && (
              <p role="status">Vérification du fichier…</p>
            )}
            {importError && (
              <p className="orders-error" role="alert">
                {importError}
              </p>
            )}
            {preview && (
              <div className="orders-preview">
                <strong>Aperçu de {fileName}</strong>
                <p>
                  {preview.items.length} commande(s) valide(s) ·{" "}
                  {preview.errors.length} erreur(s). Rien n’est encore
                  enregistré.
                </p>
                <OrderErrors issues={preview.errors} />
                {preview.items.length > 0 && (
                  <ul>
                    {preview.items.map((item, index) => (
                      <li key={`${item.reference}-${index}`}>
                        <b>{item.reference}</b> ·{" "}
                        {item.customer || "Client non renseigné"} ·{" "}
                        {dateLabel(item.service_date)}
                        <small>
                          {item.pickup.label} → {item.dropoff.label} ·{" "}
                          {item.parcels} colis · {item.deadline_minutes} min
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="orders-secondary"
                  disabled={
                    !!busy || !!preview.errors.length || !preview.items.length
                  }
                  onClick={() => void commitImport()}
                >
                  <Save size={15} aria-hidden="true" />
                  {busy === "import"
                    ? "Importation…"
                    : `Enregistrer les ${preview.items.length} commandes`}
                </button>
              </div>
            )}
          </details>
          <p className="orders-footnote">
            Enregistrement atomique : tout le lot est accepté, ou aucune
            nouvelle commande n’est créée. Une référence existante avec un
            contenu différent est refusée.
          </p>
        </aside>
      </div>
      {actionError && (
        <p className="orders-error" role="alert">
          {actionError}
        </p>
      )}
      <p className="orders-notice" role="status">
        {notice}
      </p>
    </section>
  );
}
