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

export type BrokerDelivery = Delivery & { deadline_minutes?: number };

export type BrokerCandidate = {
  strategy: string;
  status: string;
  reason: string | null;
  solution: {
    assignments: { delivery_id: string; vehicle_id: string }[];
    vehicle_routes: {
      vehicle_id: string;
      node_order: number[];
      duration_seconds: number;
      distance_meters: number;
      load_peak: number;
      operating_cost_cents: number;
    }[];
    fleet_cost_cents: number;
    makespan_seconds: number;
    solver_status: string;
  } | null;
  certificate: { valid: boolean; issues: string[] } | null;
};

export type BrokerPlan = {
  id: string;
  status: string;
  workflow_kind?: "broker";
  final_kind?: "accepted_plan" | "accepted_diagnostic" | null;
  request?: { mode?: "live" | "fixture" };
  created_at?: string;
  agents?: {
    role: string;
    status: string;
    model: string | null;
    requested_model?: string | null;
    duration_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
    cost: string | null;
  }[];
  broker_solution?: {
    selected_strategy: string | null;
    selected: BrokerCandidate["solution"];
  } | null;
  candidates?: BrokerCandidate[];
  certificate?: BrokerCandidate["certificate"];
  created_trip_ids?: string[];
  fleet_snapshot?: {
    vehicles: {
      id: string;
      available: boolean;
      origin?: Coordinates;
      origin_assumed?: boolean;
    }[];
    captured_at?: string;
  };
  error?: { code?: string; message?: string } | null;
  final_output?: { reason?: string | null; summary?: string };
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
