import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrokerOutcome } from "./BrokerPlanning";

it("reports admission rejection after a reused selection without inventing another analysis or a ready trip", () => {
  const html = renderToStaticMarkup(
    <BrokerOutcome
      policy="routine"
      memory={{
        outcome: "changed",
        selection_outcome: "reused",
        admission_outcome: "rejected",
        admission_reason: "fleet_unavailable",
        omitted_explanation_roles: [
          "planning",
          "traffic",
          "optimization",
          "monitoring",
          "exception",
        ],
        planned_explanation_calls: 0,
      }}
    />,
  );
  expect(html).toContain("Admission refusée · replanification nécessaire");
  expect(html).toContain("fleet_unavailable");
  expect(html).toContain("Aucun trajet prêt à démarrer");
  expect(html).toContain("5 rôle(s) sans explication IA");
  expect(html).toContain("0 appels d’explication prévus");
  expect(html).not.toContain("nouvelle analyse");
  expect(html).not.toContain("Tournée habituelle revérifiée");
});
