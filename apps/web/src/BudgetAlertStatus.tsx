import { money } from "./state";

type BudgetSnapshot = {
  known_cost_usd: string;
  held_usd: string;
  budget_limit_usd: string;
  budget_limit_cad: string;
  budget_valued_cost_cad: string;
  budget_valued_held_cad: string;
  remaining_budget_cad: string;
  cad_per_usd_policy: string;
  frozen: boolean;
  cad_source: string;
};
export type BudgetAlerts = {
  configured: boolean;
  configuration_error: "not_configured" | "invalid_configuration" | null;
  guard: BudgetSnapshot;
  event: {
    id: string;
    reason: "budget_reached" | "global_dispatch_blocked" | "project_frozen";
    snapshot: BudgetSnapshot & { blocked_amount_usd: string | null };
    delivery_state:
      | "pending"
      | "configuration_needed"
      | "sending"
      | "retry_wait"
      | "sent"
      | "failed"
      | "uncertain";
    attempt_count: number;
    next_retry_at: string | null;
    error_code: string | null;
    created_at: string;
    updated_at: string;
    sent_at: string | null;
  } | null;
};

const deliveryLabels = {
  pending: "En attente d’envoi",
  configuration_needed: "Configuration requise",
  sending: "Envoi en cours",
  retry_wait: "Nouvelle tentative prévue",
  sent: "Acceptée par le serveur SMTP",
  failed: "Envoi échoué",
  uncertain: "Envoi incertain",
};
const reasons = {
  budget_reached: "Plafond global atteint",
  global_dispatch_blocked: "Nouvel appel bloqué par le budget global",
  project_frozen: "Appels bloqués après un dépassement connu",
};
const safeErrorCodes = new Set([
  "smtp_pre_data_failure",
  "smtp_data_rejected",
  "smtp_delivery_uncertain",
  "delivery_lease_expired",
  "invalid_configuration",
  "not_configured",
]);
const localTime = (value: string) =>
  new Date(value).toLocaleString("fr-CA", { timeZone: "America/Toronto" });

export function BudgetAlertStatus({
  data,
  error = false,
}: {
  data: BudgetAlerts | null;
  error?: boolean;
}) {
  const event = data?.event;
  const state = event?.delivery_state;
  const needsConfiguration =
    data && (!data.configured || state === "configuration_needed");
  const failed = state === "failed" || state === "uncertain";
  const errorCode =
    event?.error_code && safeErrorCodes.has(event.error_code)
      ? event.error_code
      : null;
  return (
    <div
      className="budget-alert"
      aria-labelledby="budget-alert-title"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="budget-alert-heading">
        <h3 id="budget-alert-title">Alerte courriel · budget global</h3>
        {data && (
          <span
            className={`badge ${failed ? "bad" : state === "sent" ? "good" : "neutral"}`}
          >
            {state
              ? deliveryLabels[state]
              : data.configured
                ? "Activée · aucun déclenchement"
                : "Configuration requise"}
          </span>
        )}
      </div>
      <div>
        {error && (
          <p className="budget-alert-warning">
            État du courriel indisponible.
            {data
              ? " Dernier état connu affiché ; il peut être périmé."
              : " Nouvelle vérification automatique en cours."}
          </p>
        )}
        {!data && !error && <p>Chargement de l’état du courriel…</p>}
        {data && (
          <>
            {needsConfiguration && (
              <p>
                {data.configuration_error === "invalid_configuration"
                  ? "La configuration courriel est invalide. "
                  : "Le courriel n’est pas configuré. "}
                Configurer les paramètres SMTP et le destinataire dans le
                fichier .env privé, puis redémarrer le worker.
              </p>
            )}
            {!event ? (
              <p>
                Alerte au plafond de {money(data.guard.budget_limit_cad)} ou
                lorsqu’un nouvel appel est bloqué par le budget global. Les
                réservations en attente comptent dans la protection du budget ;
                elles ne sont pas des frais facturés.
              </p>
            ) : (
              <>
                <p>
                  {reasons[event.reason]} · plafond{" "}
                  {money(event.snapshot.budget_limit_cad)}. À cet instant :{" "}
                  {money(event.snapshot.budget_valued_cost_cad)} de coûts connus
                  estimés et {money(event.snapshot.budget_valued_held_cad)} de
                  réservations en attente, valorisés en CAD. Ces réservations ne
                  sont pas des frais facturés.
                </p>
                <p>
                  {event.attempt_count} tentative
                  {event.attempt_count === 1 ? "" : "s"}
                  {" · "}déclenchement {localTime(event.created_at)} (Toronto).
                  {state === "retry_wait" &&
                    event.next_retry_at &&
                    ` Prochaine tentative : ${localTime(event.next_retry_at)} (Toronto).`}
                  {state === "sent" &&
                    event.sent_at &&
                    ` Acceptée le ${localTime(event.sent_at)} (Toronto).`}
                </p>
                {state === "sent" && (
                  <p>
                    L’acceptation SMTP ne confirme pas la réception dans la
                    boîte de courriel.
                  </p>
                )}
                {(state === "pending" || state === "sending") && (
                  <p>
                    Le worker traite la notification ; le budget reste protégé
                    pendant l’envoi.
                  </p>
                )}
                {state === "retry_wait" && (
                  <p>
                    La tentative a échoué avant confirmation ; le worker
                    réessaiera automatiquement.
                  </p>
                )}
                {state === "failed" && (
                  <p>
                    Vérifier la configuration SMTP, l’état enregistré et le
                    service de messagerie. Le blocage des appels reste
                    indépendant du courriel.
                  </p>
                )}
                {state === "uncertain" && (
                  <p>
                    Le serveur a peut-être accepté le message. Consulter l’état
                    enregistré et le service de messagerie, puis vérifier la
                    boîte de courriel avant toute relance ; aucune nouvelle
                    tentative automatique pour éviter un doublon.
                  </p>
                )}
                {(failed || state === "retry_wait") && errorCode && (
                  <p>
                    Code : <code>{errorCode}</code>.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
