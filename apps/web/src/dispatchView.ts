import type {
  Coordinates,
  DispatchPreview,
  DispatchTrip,
  Place,
  ConfiguredVehicle,
} from "./dispatchTypes";

const VEHICLE_COLORS = [
  "#167887",
  "#65649a",
  "#925e27",
  "#366a4d",
  "#a2466f",
  "#345bb0",
  "#997019",
  "#87533d",
  "#5c7b2d",
  "#745bb3",
];

export function vehicleColors(ids: string[]): Record<string, string> {
  const unique = [...new Set(ids)].sort();
  const colors: Record<string, string> = {};
  const used = new Set<number>();
  for (const id of unique) {
    if (/^van[1-4]$/.test(id)) {
      const index = Number(id.slice(3)) - 1;
      colors[id] = VEHICLE_COLORS[index];
      used.add(index);
    }
  }
  for (const id of unique) {
    if (colors[id]) continue;
    let index =
      [...id].reduce(
        (hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0,
        0,
      ) % VEHICLE_COLORS.length;
    // Current rosters have at most ten vans; longer historical lists may reuse colors.
    for (
      let count = 0;
      used.has(index) && count < VEHICLE_COLORS.length;
      count++
    )
      index = (index + 1) % VEHICLE_COLORS.length;
    colors[id] = VEHICLE_COLORS[index];
    used.add(index);
  }
  return colors;
}

export const dispatchColor = (id: string) => vehicleColors([id])[id];

export function vehicleLabel(
  id: string,
  vehicles: { id: string; name?: string }[],
): string {
  return (
    vehicles.find((vehicle) => vehicle.id === id)?.name ||
    (/^van\d+$/.test(id) ? id.replace("van", "Véhicule ") : id)
  );
}

export function selectedVehicleAfterConfig(
  current: string,
  vehicles: ConfiguredVehicle[],
): string {
  return vehicles.some((vehicle) => vehicle.id === current)
    ? current
    : vehicles[0]?.id || "";
}

export function selectedVehiclesAfterRefresh(
  current: string[],
  vehicles: { id: string; available: boolean }[],
  first: boolean,
): string[] {
  return first
    ? vehicles
        .filter((vehicle) => vehicle.available)
        .map((vehicle) => vehicle.id)
    : current.filter((id) => vehicles.some((vehicle) => vehicle.id === id));
}

export function mapFocusCoordinates(
  trips: DispatchTrip[],
  selected: string,
  draft: Place[],
  preview: DispatchPreview | null,
  target: "selected" | "draft" | "all",
): Coordinates[] {
  const draftPoints = [
    ...(preview?.route.coordinates || []),
    ...draft.map((place) => place.coordinates),
  ];
  if (target === "draft") return draftPoints;
  if (target === "all")
    return [...trips.flatMap((trip) => trip.route.coordinates), ...draftPoints];
  return trips.find((trip) => trip.id === selected)?.route.coordinates || [];
}
