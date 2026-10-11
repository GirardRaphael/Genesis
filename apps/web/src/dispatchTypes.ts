export type Coordinates = [number, number];

export type Place = {
  label: string;
  coordinates: Coordinates;
};

export type ConfiguredVehicle = {
  id: string;
  name: string;
  capacity_parcels: number;
};

export type DispatchConfig = {
  vehicles: ConfiguredVehicle[];
  fleet_config_version: string;
};

export type FleetSnapshot = {
  vehicles: (ConfiguredVehicle & {
    available: boolean;
    unresolved_cargo_parcels?: number;
    origin?: Coordinates;
    origin_assumed?: boolean;
  })[];
  fleet_config_version: string;
  captured_at?: string;
};

export type Delivery = {
  pickup: Place;
  dropoff: Place;
  parcels: number;
};

export type BrokerDelivery = Delivery & {
  id?: string;
  deadline_minutes?: number;
};

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
  provenance?: "live" | "fixture";
  explanation_policy?: "none" | "always" | "routine";
  final_kind?: "accepted_plan" | "accepted_diagnostic" | null;
  request?: {
    mode?: "live" | "fixture";
    explanation_policy?: "none" | "always" | "routine";
  };
  route_memory?: {
    outcome: "miss" | "changed" | "reused";
    admission_outcome?: "created" | "rejected" | "not_attempted";
    admission_reason?: string | null;
    selection_outcome?: "miss" | "changed" | "reused";
    reason?: string | null;
    source_run_id?: string | null;
    omitted_explanation_roles: string[];
    planned_explanation_calls: number;
    context?: {
      completed_mission_count?: number;
      completed_sample_count?: number;
      mean_elapsed_simulation_seconds?: number | null;
      p50_elapsed_simulation_seconds?: number | null;
      mean_distance_km?: number | null;
      deliveries_per_simulation_hour?: number | null;
      history_limit?: number;
      scanned_trip_count?: number;
    };
  };
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
      name?: string;
      capacity_parcels?: number;
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

export type DispatchPreview = Pick<
  DispatchTrip,
  "deliveries" | "stops" | "route" | "tracking_mode"
>;

export type RouteHistory = {
  id: string;
  name: string;
  deliveries: BrokerDelivery[];
  trip_count: number;
  completed_sample_count: number;
  mean_elapsed_simulation_seconds: number | null;
  p50_elapsed_simulation_seconds: number | null;
  mean_distance_km: number | null;
  deliveries_per_simulation_hour: number | null;
  on_time_rate: number | null;
  on_time_sample_count: number;
  latest_used_at: string | null;
  latest_completed_at: string | null;
  tracking_mode: "simulation";
  variant_count: number;
};

export type RouteVariant = Omit<
  RouteHistory,
  "name" | "deliveries" | "variant_count"
> & {
  stop_order: string[];
  latest_trip_id: string;
  stops: (Place & { kind: "pickup" | "dropoff"; delivery_id: string })[];
};
export type RouteHistoryDetail = RouteHistory & {
  variants: RouteVariant[];
  best_observed_variant_id: string | null;
};

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
