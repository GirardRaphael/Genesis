import { useEffect, useState } from "react";
import { api } from "./api";
import { money, num } from "./state";
import { roleName } from "./Observability";

type Totals = {
  calls: number;
  completed: number;
  running: number;
  errors: number;
  retries: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: string | null;
  usage_coverage: number;
  cost_coverage: number;
  mean_latency_ms: number | null;
  latency_samples: number;
};
type Call = {
  attempt_id: string;
  run_id: string;
  agent_id: string;
  role: string;
  model: string | null;
  requested_model: string | null;
  status: string;
  attempt: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  uncached_input_tokens: number | null;
  reasoning_output_tokens: number | null;
  cost_usd: string | null;
  reserved_usd: string | null;
  duration_ms: number | null;
  error_code?: string;
  started_at: string;
  finished_at: string | null;
  price_version?: string;
};
type Usage = {
  totals: Totals;
  agents: (Totals & { role: string })[];
  models: (Totals & { model: string })[];
  attempts: Call[];
  attempts_total?: number;
};
export function Metering({
  runId,
  asOfSeq,
}: {
  runId: string;
  asOfSeq?: number;
}) {
  const [data, setData] = useState<Usage | null>(null),
    [error, setError] = useState(""),
    [group, setGroup] = useState<"agents" | "models">("agents"),
    [selected, setSelected] = useState(""),
    [call, setCall] = useState<Call | null>(null);
  const [scope, setScope] = useState<"run" | "all">("run");
  const effectiveScope = asOfSeq == null ? scope : "run";
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setCall(null);
    const url =
      effectiveScope === "all"
        ? "/usage?limit=200"
        : `/runs/${encodeURIComponent(runId)}/usage${asOfSeq == null ? "" : `?as_of_seq=${asOfSeq}`}`;
    const fetchUsage = () =>
      api<Usage>(url, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setData(value);
            setError("");
            setCall((previous) =>
              previous
                ? value.attempts.find(
                    (item) => item.attempt_id === previous.attempt_id,
                  ) || null
                : null,
            );
          }
        })
        .catch((reason) => {
          if (reason.name !== "AbortError") setError(reason.message);
        });
    void fetchUsage();
    const interval =
      asOfSeq == null ? setInterval(fetchUsage, 2500) : undefined;
    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
    };
  }, [runId, asOfSeq, effectiveScope]);
  const rows = data?.[group] || [];
  const calls =
    data?.attempts.filter(
      (item) =>
        !selected || (group === "agents" ? item.role : item.model) === selected,
    ) || [];
  return (
    <section className="panel metering" aria-labelledby="meter-title">
      <div className="panel-heading">
        <div className="segmented">
          <button
            className={effectiveScope === "run" ? "active" : ""}
            onClick={() => {
              setScope("run");
              setSelected("");
            }}
          >
            Cette requête
          </button>
          <button
            disabled={asOfSeq != null}
            className={effectiveScope === "all" ? "active" : ""}
            onClick={() => {
              setScope("all");
              setSelected("");
            }}
          >
            Toutes les requêtes
          </button>
        </div>
        <span className="muted">
          {effectiveScope === "all"
            ? "Regroupement global · jusqu’à 200 tentatives visibles"
            : `Requête ${runId.slice(0, 8)}`}
        </span>
      </div>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            CONSOMMATION API ·{" "}
            {asOfSeq == null
              ? "ACTUALISATION EN OPÉRATION"
              : "ÉTAT À CET ÉVÉNEMENT"}
          </span>
          <h2 id="meter-title">Coûts, tokens et appels individuels</h2>
        </div>
        <div className="segmented">
          <button
            className={group === "agents" ? "active" : ""}
            onClick={() => {
              setGroup("agents");
              setSelected("");
            }}
          >
            Par agent
          </button>
          <button
            className={group === "models" ? "active" : ""}
            onClick={() => {
              setGroup("models");
              setSelected("");
            }}
          >
            Par modèle
          </button>
        </div>
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="notice" role="status">
          Chargement du relevé…
        </p>
      ) : (
        <>
          <div className="meter-summary">
            <span>
              <strong>{num(data.totals.total_tokens, 0)}</strong> tokens
              rapportés
            </span>
            <span>
              <strong>{money(data.totals.cost_usd, "USD")}</strong> coût API
              estimé
            </span>
            <span>
              <strong>{data.totals.running}</strong> appel(s) en cours
            </span>
            <span>
              <strong>{data.totals.errors}</strong> erreur(s) ·{" "}
              {data.totals.retries} reprise(s)
            </span>
          </div>
          <p className="chart-caption">
            Couverture tokens {num(data.totals.usage_coverage * 100, 0)} % ·
            coûts {num(data.totals.cost_coverage * 100, 0)} %. Les tokens ne
            sont connus qu’après la réponse du fournisseur. Réservations et
            coûts estimés restent distincts des coûts de flotte.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{group === "agents" ? "Agent" : "Modèle"}</th>
                  <th className="numeric">Appels</th>
                  <th className="numeric">Tokens entrée</th>
                  <th className="numeric">Tokens sortie</th>
                  <th className="numeric">Coût estimé USD</th>
                  <th className="numeric">Latence moyenne</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = "role" in row ? row.role : row.model;
                  return (
                    <tr key={id} className={id === selected ? "selected" : ""}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setSelected(id === selected ? "" : id)}
                        >
                          {group === "agents" ? roleName(id) : id}
                        </button>
                      </td>
                      <td className="numeric">{row.calls}</td>
                      <td className="numeric">{num(row.input_tokens, 0)}</td>
                      <td className="numeric">{num(row.output_tokens, 0)}</td>
                      <td className="numeric">{money(row.cost_usd, "USD")}</td>
                      <td className="numeric">
                        {row.mean_latency_ms == null
                          ? "Indisponible"
                          : `${num(row.mean_latency_ms)} ms · n=${row.latency_samples}`}
                      </td>
                      <td>
                        {row.running} en cours · {row.errors} erreurs
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={7}>
                      Aucun appel de modèle pour cette sélection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="panel-heading">
            <h3>
              Chaque tentative{" "}
              {selected &&
                `· ${group === "agents" ? roleName(selected) : selected}`}
            </h3>
            {selected && (
              <button className="text-button" onClick={() => setSelected("")}>
                Tous les appels
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Appel / agent</th>
                  <th>Modèle</th>
                  <th>État</th>
                  <th className="numeric">Entrée / sortie</th>
                  <th className="numeric">Coût estimé USD</th>
                  <th className="numeric">Réservation USD</th>
                  <th className="numeric">Durée réelle</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((item) => (
                  <tr key={item.attempt_id}>
                    <td>
                      <button
                        className="table-link stacked"
                        onClick={() => setCall(item)}
                      >
                        <strong>
                          {roleName(item.role)} · tentative {item.attempt}
                        </strong>
                        <small>{item.attempt_id.slice(0, 8)}</small>
                      </button>
                    </td>
                    <td className="mono">{item.model || "Indisponible"}</td>
                    <td>
                      {item.status === "running"
                        ? "En cours"
                        : item.status === "failed"
                          ? "Échec"
                          : item.status === "interrupted"
                            ? "Interrompue · facturation incertaine"
                            : "Terminée"}
                    </td>
                    <td className="numeric">
                      {num(item.input_tokens, 0)} / {num(item.output_tokens, 0)}
                    </td>
                    <td className="numeric">{money(item.cost_usd, "USD")}</td>
                    <td className="numeric">
                      {money(item.reserved_usd, "USD")}
                    </td>
                    <td className="numeric">
                      {item.duration_ms == null
                        ? item.status === "running"
                          ? "En cours"
                          : "Indisponible"
                        : `${num(item.duration_ms)} ms`}
                    </td>
                  </tr>
                ))}
                {!calls.length && (
                  <tr>
                    <td colSpan={7}>
                      Aucun appel facturable enregistré. Une démonstration
                      déterministe ne simule pas une consommation de tokens.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {call && (
            <div className="call-inspector">
              <div className="panel-heading">
                <h3>Détail individuel · {call.attempt_id.slice(0, 8)}</h3>
                <button className="text-button" onClick={() => setCall(null)}>
                  Fermer le détail
                </button>
              </div>
              <dl>
                <div>
                  <dt>Requête</dt>
                  <dd className="mono">{call.run_id}</dd>
                </div>
                <div>
                  <dt>Agent / invocation</dt>
                  <dd>
                    {roleName(call.role)} · {call.agent_id}
                  </dd>
                </div>
                <div>
                  <dt>Modèle demandé / utilisé</dt>
                  <dd>
                    {call.requested_model} / {call.model}
                  </dd>
                </div>
                <div>
                  <dt>Catégories de tokens</dt>
                  <dd>
                    Entrée {num(call.input_tokens, 0)}, dont cache lu{" "}
                    {num(call.cached_input_tokens, 0)}, cache écrit{" "}
                    {num(call.cache_creation_input_tokens, 0)} · sortie{" "}
                    {num(call.output_tokens, 0)}, dont raisonnement{" "}
                    {num(call.reasoning_output_tokens, 0)}. Sous-ensembles non
                    additionnés une seconde fois.
                  </dd>
                </div>
                <div>
                  <dt>Tarification</dt>
                  <dd>
                    {call.price_version || "Indisponible"} ·{" "}
                    {money(call.cost_usd, "USD")} estimés
                  </dd>
                </div>
                <div>
                  <dt>Erreur du fournisseur</dt>
                  <dd>{call.error_code || "Aucune enregistrée"}</dd>
                </div>
                <div>
                  <dt>Identifiant complet</dt>
                  <dd className="mono">{call.attempt_id}</dd>
                </div>
              </dl>
            </div>
          )}
        </>
      )}
    </section>
  );
}
