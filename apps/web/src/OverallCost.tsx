import { useEffect, useState } from "react";
import { api } from "./api";
import { money, num } from "./state";
type Overall = {
  total_requests: number;
  handled_requests: number;
  live_requests: number;
  fixture_requests: number;
  totals: {
    total_tokens: number | null;
    cost_usd: string | null;
    cost_coverage: number;
    usage_coverage: number;
    calls: number;
    errors: number;
    retries: number;
    running: number;
  };
  budget: {
    known_cost_usd: string;
    held_usd: string;
    budget_limit_cad: string;
    budget_valued_cost_cad: string;
    remaining_budget_cad: string;
    frozen: boolean;
  };
};
export function OverallCost() {
  const [data, setData] = useState<Overall | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const update = () =>
      api<Overall>("/usage/overall", controller.signal)
        .then((value) => {
          setData(value);
          setError("");
        })
        .catch((reason) => {
          if (reason.name !== "AbortError") setError(reason.message);
        });
    void update();
    const id = setInterval(update, 3000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, []);
  return (
    <section
      className="panel overall-cost"
      aria-labelledby="overall-cost-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            TOUTES LES REQUÊTES · INDÉPENDANT DES FILTRES
          </span>
          <h2 id="overall-cost-title">Coût API global des opérations</h2>
        </div>
        {data && (
          <span className="badge neutral">
            {data.handled_requests} / {data.total_requests} requêtes traitées
          </span>
        )}
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="notice" role="status">
          Chargement du total…
        </p>
      ) : (
        <>
          <div className="meter-summary">
            <span>
              <strong>{money(data.budget.known_cost_usd, "USD")}</strong>coût
              total connu · USD estimés
            </span>
            <span>
              <strong>{money(data.budget.budget_valued_cost_cad)}</strong>
              valorisation prudente du budget · CAD
            </span>
            <span>
              <strong>{money(data.budget.held_usd, "USD")}</strong>réservations
              en attente · USD
            </span>
            <span>
              <strong>{money(data.budget.remaining_budget_cad)}</strong>
              disponibles sur {money(data.budget.budget_limit_cad)}
            </span>
          </div>
          <p className="chart-caption">
            {data.live_requests} requêtes IA · {data.fixture_requests}{" "}
            démonstrations · {data.totals.calls} tentatives de modèle, dont{" "}
            {data.totals.retries} reprises et {data.totals.errors} erreurs.
            Tokens rapportés : {num(data.totals.total_tokens, 0)}. Couverture
            coûts {num(data.totals.cost_coverage * 100, 0)} %, tokens{" "}
            {num(data.totals.usage_coverage * 100, 0)} %. La valorisation CAD
            utilise le coussin de budget, pas une facture ni un taux de change
            courant.
            {data.budget.frozen &&
              " Les appels sont bloqués après un dépassement connu."}
          </p>
        </>
      )}
    </section>
  );
}
