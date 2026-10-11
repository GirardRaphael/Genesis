import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrokerOutcome, BrokerPlanning } from "./BrokerPlanning";

it("opens with deterministic planning and keeps optional AI settings closed", () => {
  const html = renderToStaticMarkup(
    <BrokerPlanning
      deliveries={[]}
      depot={null}
      trips={[]}
      onTripsCreated={() => {}}
    />,
  );
  expect(html).toContain("aucun appel IA");
  expect(html).toContain(
    "Vérifiez la proposition avant de démarrer une simulation",
  );
  expect(html).toContain('name="broker-explanations" checked=""');
  expect(html).toContain("Sans IA · planification déterministe");
  expect(html).toContain('<details class="broker-options">');
  expect(html).not.toContain('<details class="broker-options" open');
  expect(html).toContain("Comparer les tournées");
});

it("names zero explanations under the deterministic policy", () => {
  const html = renderToStaticMarkup(
    <BrokerOutcome
      policy="none"
      memory={{
        outcome: "miss",
        admission_outcome: "created",
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
  expect(html).toContain("5 rôle(s) sans explication IA");
  expect(html).toContain("0 appels d’explication prévus");
  expect(html).toContain("politique déterministe");
});
