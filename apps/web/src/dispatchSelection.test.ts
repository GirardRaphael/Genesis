import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { selectedDispatchStop } from "./dispatchSelection";
import type { DispatchTrip } from "./dispatchTypes";

vi.mock("./DispatchMap", () => ({
  DispatchMap: () => null,
  dispatchColor: () => "#146c78",
}));
import { TripDetail } from "./Dispatch";

const trip: DispatchTrip = {
  id: "trip-west",
  name: "Fixture dispatch",
  vehicle_id: "van1",
  status: "ready",
  deliveries: [
    {
      pickup: { label: "Gare Centrale", coordinates: [-73.5673, 45.5003] },
      dropoff: { label: "Marché Jean-Talon", coordinates: [-73.6145, 45.5362] },
      parcels: 2,
    },
  ],
  stops: [
    {
      id: "pickup-1",
      delivery_id: "delivery-1",
      kind: "pickup",
      label: "Gare Centrale",
      coordinates: [-73.5673, 45.5003],
      eta_seconds: 0,
      eta_at: null,
      status: "pending",
    },
    {
      id: "dropoff-1",
      delivery_id: "delivery-1",
      kind: "dropoff",
      label: "Marché Jean-Talon",
      coordinates: [-73.6145, 45.5362],
      eta_seconds: 600,
      eta_at: null,
      status: "pending",
    },
  ],
  route: {
    coordinates: [
      [-73.5673, 45.5003],
      [-73.6145, 45.5362],
    ],
    distance_km: 5,
    duration_minutes: 10,
    source: "fixture-road-source",
    source_url: "",
    computed_at: "2026-10-11T13:00:00Z",
  },
  progress: {
    coordinate: [-73.5673, 45.5003],
    fraction: 0,
    completed_stop_count: 0,
    elapsed_simulation_seconds: 0,
    remaining_simulation_seconds: 600,
  },
  tracking_mode: "simulation",
  speedup: 10,
  created_at: "2026-10-11T13:00:00Z",
  started_at: null,
  completed_at: null,
  cancelled_at: null,
};

describe("dispatch stop selection", () => {
  const selection = { tripId: trip.id, stopId: "dropoff-1" };
  it("resolves the stable stop after polling updates its simulation status", () => {
    const refreshed = {
      ...trip,
      stops: trip.stops.map((stop) => ({
        ...stop,
        status: "completed" as const,
      })),
    };
    expect(selectedDispatchStop(selection, refreshed, true)?.status).toBe(
      "completed",
    );
  });
  it("clears a hidden route and a stop removed by refresh", () => {
    expect(selectedDispatchStop(selection, trip, false)).toBeNull();
    expect(
      selectedDispatchStop(selection, { ...trip, stops: [] }, true),
    ).toBeNull();
  });
  it("never applies a reused stop ID to another trip or missing trip", () => {
    expect(
      selectedDispatchStop(selection, { ...trip, id: "trip-east" }, true),
    ).toBeNull();
    expect(selectedDispatchStop(selection, undefined, true)).toBeNull();
    expect(selectedDispatchStop(null, trip, true)).toBeNull();
  });
});

function renderDetail(value = trip, selectedStopId = "dropoff-1") {
  return renderToStaticMarkup(
    createElement(TripDetail, {
      trip: value,
      selectedStopId,
      onSelectStop: () => {},
      onClearStop: () => {},
      busy: "",
      onAction: async () => {},
    }),
  );
}

describe("dispatch schedule alternative", () => {
  it("exposes native pressed stop controls, paired stop and observable evidence", () => {
    const html = renderDetail();
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("aria-controls=");
    expect(html).toContain("Arrêt 2 · Livraison");
    expect(html).toContain("Arrêt 1 · Ramassage");
    expect(html).toContain("Départ + 10 min");
    expect(html).toContain("fixture-road-source");
    expect(html).toContain(
      "Fenêtres, charge à cet arrêt et certificat non exposés",
    );
    expect(html).toContain("Fermer les détails de l’arrêt");
    expect(html).not.toContain("GPS");
  });
  it("reports cancelled pending work as unserved rather than complete", () => {
    expect(renderDetail({ ...trip, status: "cancelled" })).toContain(
      "Non desservi · annulé",
    );
  });
  it("marks a missing paired stop as unavailable instead of guessing a delivery", () => {
    const html = renderDetail({ ...trip, stops: [trip.stops[1]] });
    expect(html).toContain("Non exposé");
    expect(html).not.toContain("Arrêt 1 · Ramassage");
  });
  it("preserves completed simulation status and the schedule when the map is unavailable", () => {
    const completed = {
      ...trip,
      stops: trip.stops.map((stop) => ({
        ...stop,
        status: "completed" as const,
      })),
    };
    expect(renderDetail(completed)).toContain("Arrêt terminé");
    const noSelection = renderDetail(trip, "");
    expect(noSelection).toContain(
      "La liste reste utilisable si le fond de carte est indisponible",
    );
    expect(noSelection.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(noSelection).not.toContain("dispatch-stop-address");
  });
});
