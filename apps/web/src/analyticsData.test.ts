import { describe, expect, it } from "vitest";
import {
  requestStatus,
  scenarioRows,
  share,
  tokensByRole,
} from "./analyticsData";
import type { UsageGroup } from "./analyticsData";
import type { Run } from "./types";

const group = (values: Partial<UsageGroup>): UsageGroup => ({
  calls: 2,
  completed: 2,
  running: 0,
  errors: 0,
  retries: 0,
  input_tokens: null,
  output_tokens: null,
  total_tokens: null,
  cost_usd: null,
  usage_coverage: 0,
  cost_coverage: 0,
  mean_latency_ms: null,
  latency_samples: 0,
  ...values,
});

describe("analytics projections", () => {
  it("excludes missing cost and keeps missing tokens unavailable", () => {
    const rows = [
      group({
        role: "planning",
        cost_usd: "0.25",
        input_tokens: 50,
        output_tokens: 10,
        usage_coverage: 0.5,
      }),
      group({ role: "traffic" }),
    ] as (UsageGroup & { role: string })[];
    expect(share(rows, "role")).toEqual([
      { name: "planning", key: "planning", value: 0.25 },
    ]);
    expect(tokensByRole(rows)[1]).toMatchObject({
      input: null,
      output: null,
      coverage: 0,
    });
  });

  it("groups only supplied run rows, retaining status and fleet cost coverage", () => {
    const runs = [
      {
        scenario_id: "S01",
        policy: "baseline_only",
        status: "succeeded",
        metrics: { fleet_cost_cad: "12.00" },
      },
      {
        scenario_id: "S01",
        policy: "solver_with_one_replan",
        status: "failed",
        metrics: null,
      },
      {
        scenario_id: "S02",
        policy: "baseline_only",
        status: "running",
        metrics: { fleet_cost_cad: "14.00" },
      },
    ] as Run[];
    expect(requestStatus(runs)).toEqual([
      { name: "succeeded", value: 1 },
      { name: "failed", value: 1 },
      { name: "running", value: 1 },
    ]);
    expect(scenarioRows(runs)[0]).toEqual({
      scenario: "S01",
      runs: 2,
      completed: 1,
      policies: ["baseline_only", "solver_with_one_replan"],
      meanFleetCostCad: 12,
      fleetCostSamples: 1,
    });
  });
});
