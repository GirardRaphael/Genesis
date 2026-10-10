import type {
  Coordinates,
  DispatchPreview,
  DispatchTrip,
  Place,
} from "./dispatchTypes";

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
