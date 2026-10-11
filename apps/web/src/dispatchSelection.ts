import type { DispatchStop, DispatchTrip } from "./dispatchTypes";

export type StopSelection = { tripId: string; stopId: string };

export function selectedDispatchStop(
  selection: StopSelection | null,
  trip: DispatchTrip | undefined,
  routeVisible: boolean,
): DispatchStop | null {
  if (!routeVisible || !trip || selection?.tripId !== trip.id) return null;
  return trip.stops.find((stop) => stop.id === selection.stopId) || null;
}
