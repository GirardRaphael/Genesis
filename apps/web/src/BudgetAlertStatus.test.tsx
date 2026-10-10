import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BudgetAlertStatus } from "./BudgetAlertStatus";
import type { BudgetAlerts } from "./BudgetAlertStatus";
import { money } from "./state";

const guard = {
  known_cost_usd: "49",
  held_usd: "1",
  budget_limit_usd: "50",
  budget_limit_cad: "100",
  budget_valued_cost_cad: "98",
  budget_valued_held_cad: "2",
  remaining_budget_cad: "0",
  cad_per_usd_policy: "2",
  frozen: false,
  cad_source: "fixture policy",
};
const fixture: BudgetAlerts = {
  configured: true,
  configuration_error: null,
  guard,
  event: {
    id: "fixture-alert",
    reason: "budget_reached",
    snapshot: { ...guard, blocked_amount_usd: null },
    delivery_state: "pending",
    attempt_count: 0,
    next_retry_at: null,
    error_code: null,
    created_at: "2026-10-10T12:00:00Z",
    updated_at: "2026-10-10T12:00:00Z",
    sent_at: null,
  },
};
function withEvent(
  change: Partial<NonNullable<BudgetAlerts["event"]>>,
): BudgetAlerts {
  return { ...fixture, event: { ...fixture.event!, ...change } };
}
const render = (data: BudgetAlerts | null, error = false) =>
  renderToStaticMarkup(<BudgetAlertStatus data={data} error={error} />);

describe("global budget email status", () => {
  it("announces initial loading and a safe unavailable state", () => {
    expect(render(null)).toContain("Chargement de l’état du courriel");
    const html = render(null, true);
    expect(html).toContain("État du courriel indisponible");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Chargement de l’état");
  });
  it("shows configuration help below the cap without claiming an alert occurred", () => {
    const html = render({
      ...fixture,
      configured: false,
      configuration_error: "not_configured",
      event: null,
    });
    expect(html).toContain("Configuration requise");
    expect(html).toContain(".env privé");
    expect(html).toContain("ne sont pas des frais facturés");
    expect(html).not.toContain("Plafond global atteint");
    expect(html).not.toContain("Acceptée par le serveur");
  });
  it("shows enabled notification below threshold without inventing delivery", () => {
    const html = render({ ...fixture, event: null });
    expect(html).toContain("Activée · aucun déclenchement");
    expect(html).toContain(money("100"));
    expect(html).not.toContain("tentative");
  });
  it.each([
    ["pending", "En attente d’envoi"],
    ["configuration_needed", "Configuration requise"],
    ["sending", "Envoi en cours"],
    ["retry_wait", "Nouvelle tentative prévue"],
    ["failed", "Envoi échoué"],
  ] as const)(
    "renders %s with the recorded trigger and distinct held exposure",
    (delivery_state, label) => {
      const html = render(withEvent({ delivery_state }));
      expect(html).toContain(label);
      expect(html).toContain("Plafond global atteint");
      expect(html).toContain(money("98"));
      expect(html).toContain(money("2"));
      expect(html).toContain("réservations en attente");
      expect(html).toContain("ne sont pas des frais facturés");
    },
  );
  it("renders scheduled retries and safe invalid-configuration help", () => {
    const retry = render(
      withEvent({
        delivery_state: "retry_wait",
        attempt_count: 2,
        next_retry_at: "2026-10-10T12:05:00Z",
      }),
    );
    expect(retry).toContain("2 tentatives");
    expect(retry).toContain("Prochaine tentative");
    const html = render({
      ...withEvent({ delivery_state: "configuration_needed" }),
      configured: false,
      configuration_error: "invalid_configuration",
    });
    expect(html).toContain("configuration courriel est invalide");
  });
  it("claims SMTP acceptance only and records its time", () => {
    const html = render(
      withEvent({
        delivery_state: "sent",
        sent_at: "2026-10-10T12:01:00Z",
        attempt_count: 1,
      }),
    );
    expect(html).toContain("Acceptée par le serveur SMTP");
    expect(html).toContain("Acceptée le");
    expect(html).toContain("ne confirme pas la réception");
    expect(html).toContain("1 tentative ·");
  });
  it("warns against automatic duplicate sends after uncertain SMTP acceptance", () => {
    const html = render(
      withEvent({
        delivery_state: "uncertain",
        error_code: "smtp_delivery_uncertain",
      }),
    );
    expect(html).toContain("Envoi incertain");
    expect(html).toContain("peut-être accepté");
    expect(html).toContain("aucune nouvelle tentative automatique");
    expect(html).toContain("Code : <code>smtp_delivery_uncertain</code>");
    expect(html).not.toContain("journaux locaux du worker");
    expect(html).not.toContain("Acceptée par le serveur SMTP");
  });
  it.each([
    ["failed", "smtp_data_rejected"],
    ["retry_wait", "smtp_pre_data_failure"],
    ["uncertain", "delivery_lease_expired"],
  ] as const)(
    "shows the safe recorded code for %s",
    (delivery_state, error_code) => {
      const html = render(withEvent({ delivery_state, error_code }));
      expect(html).toContain(`Code : <code>${error_code}</code>`);
    },
  );
  it("keeps previous status visible and labels it stale on fetch failure", () => {
    const html = render(withEvent({ delivery_state: "sent" }), true);
    expect(html).toContain("Dernier état connu");
    expect(html).toContain("périmé");
    expect(html).toContain("Acceptée par le serveur SMTP");
  });
  it.each([
    ["global_dispatch_blocked", "Nouvel appel bloqué par le budget global"],
    ["project_frozen", "Appels bloqués après un dépassement connu"],
  ] as const)("distinguishes %s from a reached threshold", (reason, text) => {
    const html = render(withEvent({ reason }));
    expect(html).toContain(text);
    expect(html).not.toContain("Plafond global atteint");
  });
  it("does not render raw transport errors or unexpected private fields", () => {
    const data = {
      ...withEvent({
        delivery_state: "failed",
        error_code: "private@example.invalid smtp-password-test",
      }),
      smtp_host: "private-host",
      recipient: "private@example.invalid",
      freeze_reason: "private-freeze",
    };
    const html = render(data);
    expect(html).not.toContain("private@example.invalid");
    expect(html).not.toContain("smtp-password-test");
    expect(html).not.toContain("private-host");
    expect(html).not.toContain("private-freeze");
    expect(html).not.toContain("Code :");
    expect(html).not.toContain("<button");
  });
});
