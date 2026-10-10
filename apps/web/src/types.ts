export type Metrics = {
  distance_km: number;
  fleet_cost_cad: string;
  served: number;
  total: number;
  on_time: number | null;
  on_time_count?: number;
  late_minutes: number;
  utilization: number;
  shift_utilization?: number;
  unserved_ids?: string[];
};
import type { Dataset } from "../../../packages/contracts/Dataset";
import type { Plan } from "../../../packages/contracts/Plan";
import type { Certificate } from "../../../packages/contracts/Certificate";
export type { Dataset, Stop } from "../../../packages/contracts/Dataset";
export type { Plan, Route, Visit } from "../../../packages/contracts/Plan";
export type { Certificate } from "../../../packages/contracts/Certificate";
export type Agent = {
  id: string;
  role: string;
  name: string;
  status: string;
  model: string | null;
  requested_model?: string | null;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost: string | null;
  output: Record<string, unknown>;
  tool_calls: Record<string, unknown>[];
  started_at?: string;
  finished_at?: string;
};
export type TraceEvent = {
  event_id: string;
  run_seq: number;
  kind: string;
  occurred_at: string;
  invocation_id?: string;
  payload: Record<string, unknown>;
};
export type SimEvent = {
  id: string;
  sim_time_s: number;
  kind: string;
  vehicle_id?: string;
  stop_id?: string;
  [key: string]: unknown;
};
export type Handoff = {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_role: string;
  receiver_role: string;
  summary: string;
  run_seq: number;
  actual: boolean;
};
export type Run = {
  id: string;
  scenario_id: string;
  scenario_label: string;
  policy: string;
  seed: number;
  provenance: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  metrics: Metrics | null;
  final_kind: string | null;
};
export type Detail = Run & {
  dataset: Dataset;
  baseline: Plan;
  candidate: Plan | null;
  selected_plan: Plan;
  certificate: Certificate;
  simulation: {
    events: SimEvent[];
    metrics: Metrics | null;
    replan_plan?: Plan | null;
    replan_dataset?: Dataset | null;
    replan_certificate?: Certificate | null;
    diagnostics?: string[];
    replan_applied?: boolean;
  };
  agents: Agent[];
  handoffs: Handoff[];
  final_output: Record<string, unknown>;
  error?: { code?: string; message?: string };
  events?: TraceEvent[];
};
export type RunDetail = Run &
  Partial<
    Pick<
      Detail,
      | "dataset"
      | "baseline"
      | "candidate"
      | "selected_plan"
      | "certificate"
      | "simulation"
      | "final_output"
      | "error"
    >
  > & { agents: Agent[]; handoffs: Handoff[] };
export function hasArtifacts(detail: RunDetail): detail is Detail {
  return !!(
    detail.dataset &&
    detail.selected_plan &&
    detail.certificate &&
    detail.simulation
  );
}
export type Scenario = { id: string; label: string; description: string };
export type AgentMetric = {
  role: string;
  count: number;
  mean_duration_ms: number | null;
  duration_count?: number;
};
export type Cohort = {
  total_runs: number;
  fixture_runs: number;
  live_runs: number;
  success_rate: number | null;
  success_numerator: number;
  success_denominator: number;
  mean_duration_ms: number | null;
  duration_count: number;
  total_tokens: number | null;
  api_cost_usd: string | null;
  usage_coverage: number;
  errors: number;
  most_used_agent: unknown;
  slowest_agent: unknown;
  agents: AgentMetric[];
  scenario_agents: (AgentMetric & { scenario_id: string })[];
  snapshot: string;
  refreshed_at?: string;
};
