/* Generated from executable Python serialization schemas. Run scripts/export_contracts.py then qa/generate-types.mjs. */

export type Id = string;
export type ScenarioId = string;
export type Seed = number;
export type Id1 = string;
export type Label = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Coordinates = [number, number];
export type Id2 = string;
export type Label1 = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Coordinates1 = [number, number];
export type Demand = number;
export type ServiceS = number;
export type EarliestS = number;
export type LatestS = number;
export type Mandatory = boolean;
export type PenaltyCents = number;
export type Stops = Stop[];
export type Id3 = string;
export type Capacity = number;
export type ShiftStartS = number;
export type ShiftEndS = number;
export type ActivationCents = number;
export type DistanceCentsPerM = number;
export type TimeCentsPerS = number;
export type Vehicles = Vehicle[];
export type LocationIds = string[];
export type DistanceM = (number | null)[][];
export type DurationS = (number | null)[][];
export type InputHash = string;
export type MatrixHash = string;
export type Region = string;
export type Timezone = string;
export type ServiceDayOrigin = string;
export type Crs = string;
export type GeneratorVersion = string;
export type RoadSource = string;
export type Permission = string;
export type RateVersion = string;
export type Forecast = string;

export interface Dataset {
  id: Id;
  scenario_id: ScenarioId;
  seed: Seed;
  depot: Depot;
  stops: Stops;
  vehicles: Vehicles;
  location_ids: LocationIds;
  distance_m: DistanceM;
  duration_s: DurationS;
  input_hash: InputHash;
  matrix_hash: MatrixHash;
  region: Region;
  timezone: Timezone;
  service_day_origin: ServiceDayOrigin;
  crs: Crs;
  generator_version: GeneratorVersion;
  road_source: RoadSource;
  permission: Permission;
  rate_version: RateVersion;
  forecast: Forecast;
}
export interface Depot {
  id: Id1;
  label: Label;
  coordinates: Coordinates;
}
export interface Stop {
  id: Id2;
  label: Label1;
  coordinates: Coordinates1;
  demand: Demand;
  service_s: ServiceS;
  earliest_s: EarliestS;
  latest_s: LatestS;
  mandatory: Mandatory;
  penalty_cents: PenaltyCents;
}
export interface Vehicle {
  id: Id3;
  capacity: Capacity;
  shift_start_s: ShiftStartS;
  shift_end_s: ShiftEndS;
  activation_cents: ActivationCents;
  distance_cents_per_m: DistanceCentsPerM;
  time_cents_per_s: TimeCentsPerS;
}
