import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  agentSnapshot,
  simulationSnapshot,
  revealedStops,
} from "./replayState";
import { OutputInspector } from "./Observability";
import type { Detail, TraceEvent } from "./types";

const event = (
  run_seq: number,
  kind: string,
  invocation_id = "",
  payload = {},
): TraceEvent => ({
  event_id: String(run_seq),
  run_seq,
  kind,
  invocation_id,
  payload,
  occurred_at: `2026-10-10T12:00:${String(run_seq).padStart(2, "0")}Z`,
});
const detail = {
  id: "test-run",
  status: "succeeded",
  provenance: "fixture",
  created_at: "2026-10-10T12:00:00Z",
  duration_ms: 10000,
  finished_at: "2026-10-10T12:00:10Z",
  final_kind: "accepted_plan",
  final_output: { summary: "FINAL SECRET" },
  dataset: { stops: [] },
  selected_plan: { id: "final-plan" },
  certificate: { valid: true, scope: "initial_full_plan" },
  metrics: { served: 29 },
  agents: ["planning", "monitoring"].map((role, i) => ({
    id: role,
    role,
    name: role,
    status: "succeeded",
    duration_ms: 1000,
    model: "model-final",
    input_tokens: 50,
    output_tokens: 50,
    cost: "1",
    output: { summary: i ? "Final fleet outcome" : "FINAL SECRET" },
    tool_calls: [{ name: "future-tool" }],
    started_at: "2026-10-10T12:00:01Z",
    finished_at: "2026-10-10T12:00:08Z",
  })),
  handoffs: [
    {
      id: "handoff",
      sender_id: "planning",
      receiver_id: "monitoring",
      actual: true,
      run_seq: 4,
    },
  ],
  simulation: {
    metrics: { served: 29 },
    replan_applied: true,
    replan_plan: { id: "residual" },
    replan_certificate: { valid: true },
    replan_dataset: { stops: [{ id: "new" }] },
    diagnostics: ["final diagnostic"],
    events: [
      { id: "start", kind: "departure", sim_time_s: 0 },
      {
        id: "new",
        kind: "new_order",
        sim_time_s: 10,
        revealed_order: { id: "new" },
      },
      { id: "load", kind: "depot_loading", sim_time_s: 10 },
      { id: "end", kind: "depot_return", sim_time_s: 20 },
    ],
  },
} as unknown as Detail;
const events = [
  event(1, "run.started"),
  event(2, "agent.started", "planning"),
  event(3, "agent.completed", "planning", {
    output: { summary: "Initial work order" },
  }),
  event(4, "handoff"),
  event(5, "route.validated"),
  event(6, "route.replanned"),
  event(7, "run.completed"),
];

describe("as-of replay boundaries", () => {
  it("withholds future artifacts, outcomes, handoffs and agent usage before execution", () => {
    const snapshot = agentSnapshot(detail, events, 0);
    expect(snapshot.selected_plan).toBeUndefined();
    expect(snapshot.certificate).toBeUndefined();
    expect(snapshot.simulation).toBeUndefined();
    expect(snapshot.metrics).toBeNull();
    expect(snapshot.final_kind).toBeNull();
    expect(snapshot.final_output).toBeUndefined();
    expect(snapshot.duration_ms).toBeNull();
    expect(snapshot.handoffs).toEqual([]);
    expect(
      snapshot.agents.every(
        (a) =>
          a.status === "pending" &&
          a.duration_ms === 0 &&
          a.model === null &&
          !a.tool_calls.length &&
          !a.finished_at,
      ),
    ).toBe(true);
  });
  it("uses the recorded intermediate output, never the final overwritten output or certificate in its drawer", () => {
    const snapshot = agentSnapshot(detail, events, 2);
    expect(snapshot.agents[0].output).toEqual({
      summary: "Initial work order",
    });
    expect(snapshot.agents[1].output).toEqual({});
    const html = renderToStaticMarkup(
      <OutputInspector
        detail={snapshot}
        agent={snapshot.agents[0]}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Initial work order");
    expect(html).toContain("Résultat intermédiaire");
    expect(html).not.toContain("final-plan");
    expect(html).not.toContain("FINAL SECRET");
    expect(html).not.toContain("future-tool");
    expect(html).not.toContain("Validation du plan");
  });
  it("releases each artifact at its own trace event", () => {
    expect(agentSnapshot(detail, events, 3).handoffs).toHaveLength(1);
    const initial = agentSnapshot(detail, events, 4);
    expect(initial.certificate?.valid).toBe(true);
    expect(initial.simulation?.replan_plan).toBeNull();
    expect(initial.metrics).toBeNull();
    expect(agentSnapshot(detail, events, 5).simulation?.replan_plan?.id).toBe(
      "residual",
    );
    expect(agentSnapshot(detail, events, 6).final_kind).toBe("accepted_plan");
  });
  it("withholds the future simulation journal, new orders, residual inputs and final totals", () => {
    const early = simulationSnapshot(detail, 0);
    expect(early.simulation.events).toHaveLength(1);
    expect(early.metrics).toBeNull();
    expect(early.simulation.metrics).toBeNull();
    expect(early.simulation.replan_plan).toBeNull();
    expect(early.simulation.replan_dataset).toBeNull();
    expect(early.simulation.diagnostics).toEqual([]);
    expect(revealedStops(early)).toEqual([]);
    expect(revealedStops(simulationSnapshot(detail, 1))[0].id).toBe("new");
    expect(simulationSnapshot(detail, 2).simulation.replan_plan?.id).toBe(
      "residual",
    );
    expect(simulationSnapshot(detail, 3).simulation.metrics?.served).toBe(29);
  });
  it("does not mutate the persisted source or invoke providers during replay", () => {
    agentSnapshot(detail, events, 0);
    simulationSnapshot(detail, 0);
    expect(detail.agents[0].model).toBe("model-final");
    expect(detail.simulation.events).toHaveLength(4);
    expect(agentSnapshot(detail, events, null)).toBe(detail);
    expect(simulationSnapshot(detail, null)).toBe(detail);
  });
});
