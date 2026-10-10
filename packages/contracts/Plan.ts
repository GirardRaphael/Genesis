/* Generated from executable Python serialization schemas. Run scripts/export_contracts.py then qa/generate-types.mjs. */

export type Id = string;
export type InputHash = string;
export type MatrixHash = string;
export type Policy = string;
export type VehicleId = string;
export type StopIds = string[];
export type StopId = string;
export type ArrivalS = number;
export type ServiceStartS = number;
export type DepartureS = number;
export type LoadAfter = number;
export type Visits = Visit[];
export type DepartureS1 = number;
export type ReturnS = number;
export type InitialLoad = number;
export type DistanceM = number;
export type TravelS = number;
export type ServiceS = number;
export type WaitingS = number;
export type DutyS = number;
export type OperatingCostCents = number;
export type Geometry = [number, number][];
export type GeometrySource = string;
export type Routes = Route[];
export type UnservedIds = string[];
export type DistanceM1 = number;
export type OperatingCostCents1 = number;
export type PenaltyCents = number;
export type ObjectiveCents = number;
export type SolverStatus = string;
export type SolverRuntimeMs = number;
export type SolverVersion = string | null;
export type SearchLimitS = number | null;
export type Diagnostics = string[];
export type Scope = "initial_full_plan" | "residual_suffix";
export type ParentPlanId = string | null;

export interface Plan {
  id: Id;
  input_hash: InputHash;
  matrix_hash: MatrixHash;
  policy: Policy;
  routes: Routes;
  unserved_ids: UnservedIds;
  distance_m: DistanceM1;
  operating_cost_cents: OperatingCostCents1;
  penalty_cents: PenaltyCents;
  objective_cents: ObjectiveCents;
  solver_status: SolverStatus;
  solver_runtime_ms: SolverRuntimeMs;
  solver_version: SolverVersion;
  search_limit_s: SearchLimitS;
  diagnostics: Diagnostics;
  scope: Scope;
  parent_plan_id: ParentPlanId;
}
export interface Route {
  vehicle_id: VehicleId;
  stop_ids: StopIds;
  visits: Visits;
  departure_s: DepartureS1;
  return_s: ReturnS;
  initial_load: InitialLoad;
  distance_m: DistanceM;
  travel_s: TravelS;
  service_s: ServiceS;
  waiting_s: WaitingS;
  duty_s: DutyS;
  operating_cost_cents: OperatingCostCents;
  geometry: Geometry;
  geometry_source: GeometrySource;
}
export interface Visit {
  stop_id: StopId;
  arrival_s: ArrivalS;
  service_start_s: ServiceStartS;
  departure_s: DepartureS;
  load_after: LoadAfter;
}
