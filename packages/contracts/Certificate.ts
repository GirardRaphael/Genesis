/* Generated from executable Python serialization schemas. Run scripts/export_contracts.py then qa/generate-types.mjs. */

export type Scope = string;
export type Valid = boolean;
export type Issues = string[];
export type InputHash = string;
export type MatrixHash = string;
export type PlanHash = string;
export type Served = number;
export type Total = number;
export type MandatoryServed = number;
export type MandatoryTotal = number;
export type RecomputedDistanceM = number;
export type RecomputedOperatingCostCents = number;
export type RecomputedObjectiveCents = number;
export type FeasibleStatus = string;

export interface Certificate {
  scope: Scope;
  valid: Valid;
  issues: Issues;
  input_hash: InputHash;
  matrix_hash: MatrixHash;
  plan_hash: PlanHash;
  served: Served;
  total: Total;
  mandatory_served: MandatoryServed;
  mandatory_total: MandatoryTotal;
  recomputed_distance_m: RecomputedDistanceM;
  recomputed_operating_cost_cents: RecomputedOperatingCostCents;
  recomputed_objective_cents: RecomputedObjectiveCents;
  feasible_status: FeasibleStatus;
}
