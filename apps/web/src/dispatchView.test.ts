import { describe, expect, it } from "vitest";
import {
  mapFocusCoordinates,
  selectedVehiclesAfterRefresh,
  selectedVehicleAfterConfig,
  vehicleLabel,
  vehicleColors,
} from "./dispatchView";
import type { DispatchPreview, DispatchTrip, Place } from "./dispatchTypes";

describe("configured operator fleet", () => {
  const vehicles = [
    { id: "est", name: "Fourgonnette Est", capacity_parcels: 8 },
    { id: "ouest", name: "Fourgonnette Ouest", capacity_parcels: 20 },
  ];
  it("keeps a valid choice and replaces a retired vehicle without inventing IDs", () => {
    expect(selectedVehicleAfterConfig("ouest", vehicles)).toBe("ouest");
    expect(selectedVehicleAfterConfig("van1", vehicles)).toBe("est");
    expect(selectedVehicleAfterConfig("est", [])).toBe("");
  });
  it("uses configured names and preserves readable retired history", () => {
    expect(vehicleLabel("est", vehicles)).toBe("Fourgonnette Est");
    expect(vehicleLabel("van3", vehicles)).toBe("Véhicule 3");
    expect(vehicleLabel("retired", vehicles)).toBe("retired");
    expect(vehicleLabel("vanguard", vehicles)).toBe("vanguard");
  });
  it("distinguishes ten arbitrary vehicle IDs while preserving default colors and roster-order stability", () => {
    const ids = [
      "van1",
      "est",
      "ouest",
      "nord",
      "sud",
      "alpha",
      "beta",
      "gamma",
      "delta",
      "echo",
    ];
    const colors = vehicleColors(ids);
    expect(new Set(Object.values(colors)).size).toBe(10);
    expect(vehicleColors([...ids].reverse())).toEqual(colors);
    expect(colors.van1).toBe("#167887");
    expect(vehicleColors(["van1", "van2", "van3", "van4"])).toEqual({
      van1: "#167887",
      van2: "#65649a",
      van3: "#925e27",
      van4: "#366a4d",
    });
  });
});

describe("dispatch map bounds", () => {
  const places: Place[] = [
    { label: "Adresse personnalisée ouest", coordinates: [-73.88, 45.46] },
    { label: "Adresse personnalisée est", coordinates: [-73.49, 45.64] },
  ];
  const first = {
    id: "custom-west",
    route: {
      coordinates: [
        [-73.9, 45.45],
        [-73.8, 45.49],
      ],
    },
  } as DispatchTrip;
  const second = {
    id: "custom-east",
    route: {
      coordinates: [
        [-73.5, 45.6],
        [-73.49, 45.63],
      ],
    },
  } as DispatchTrip;
  const preview = {
    route: {
      coordinates: [
        [-73.85, 45.46],
        [-73.55, 45.6],
      ],
    },
  } as DispatchPreview;
  it("fits an arbitrary selected route without example coordinates", () => {
    expect(
      mapFocusCoordinates(
        [first, second],
        second.id,
        places,
        preview,
        "selected",
      ),
    ).toEqual(second.route.coordinates);
  });
  it("fits all entered endpoints before road geometry exists", () => {
    expect(mapFocusCoordinates([], "", places, null, "draft")).toEqual(
      places.map((place) => place.coordinates),
    );
  });
  it("includes preview road geometry, draft endpoints and every visible persisted route", () => {
    expect(
      mapFocusCoordinates([first, second], first.id, places, preview, "all"),
    ).toEqual([
      ...first.route.coordinates,
      ...second.route.coordinates,
      ...preview.route.coordinates,
      ...places.map((place) => place.coordinates),
    ]);
  });
  it("does not resurrect a hidden selected route", () => {
    expect(mapFocusCoordinates([], first.id, [], null, "selected")).toEqual([]);
  });
});

describe("selected fleet preferences", () => {
  const busyFleet = [
    { id: "van1", available: true },
    { id: "van2", available: false },
  ];
  it("initially selects only free vehicles", () => {
    expect(selectedVehiclesAfterRefresh([], busyFleet, true)).toEqual(["van1"]);
  });
  it("preserves selections while a vehicle is busy and after it becomes free", () => {
    const selections = selectedVehiclesAfterRefresh(
      ["van1", "van2"],
      busyFleet,
      false,
    );
    expect(selections).toEqual(["van1", "van2"]);
    expect(
      selectedVehiclesAfterRefresh(
        selections,
        busyFleet.map((vehicle) => ({ ...vehicle, available: true })),
        false,
      ),
    ).toEqual(["van1", "van2"]);
  });
  it("drops only removed vehicle IDs and preserves an explicit empty selection", () => {
    expect(
      selectedVehiclesAfterRefresh(["van2", "retired"], busyFleet, false),
    ).toEqual(["van2"]);
    expect(selectedVehiclesAfterRefresh([], busyFleet, false)).toEqual([]);
  });
});
