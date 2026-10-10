export type Coordinates = [number, number];

export type Place = {
  label: string;
  coordinates: Coordinates;
};

export type Delivery = {
  pickup: Place;
  dropoff: Place;
  parcels: number;
};

export type DispatchStop = Place & {
  id: string;
  delivery_id: string;
  kind: "pickup" | "dropoff";
  eta_seconds: number;
  eta_at: string | null;
  status: "pending" | "completed";
};

export type DispatchTrip = {
  id: string;
  name: string;
  vehicle_id: string;
  status: "ready" | "running" | "completed" | "cancelled";
  deliveries: Delivery[];
  stops: DispatchStop[];
  route: {
    coordinates: Coordinates[];
    distance_km: number;
    duration_minutes: number;
    source: string;
    source_url: string;
    computed_at: string;
  };
  progress: {
    coordinate: Coordinates;
    fraction: number;
    completed_stop_count: number;
    elapsed_simulation_seconds: number;
    remaining_simulation_seconds: number;
  };
  tracking_mode: "simulation";
  speedup: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type GeocodeResult = Place & { id?: string };

export type Roadwork = {
  id: string;
  label: string;
  borough: string;
  coordinates: Coordinates;
  starts_at: string | null;
  ends_at: string | null;
  reason: string | null;
};

export type Traffic = {
  items: Roadwork[];
  source_url: string;
  fetched_at: string | null;
  source_updated_at: string | null;
  available: boolean;
  stale: boolean;
  total: number;
  limits: string;
};
