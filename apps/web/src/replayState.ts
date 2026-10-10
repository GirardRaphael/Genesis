import type { RunDetail, TraceEvent, Detail, Stop } from "./types";

// Project once at the data boundary so drawers, tables and charts share the same clock.
export function agentSnapshot(
  detail: RunDetail,
  events: TraceEvent[],
  index: number | null,
): RunDetail {
  if (index == null) return detail;
  const visible = events.slice(0, index + 1);
  const seq = visible.at(-1)?.run_seq ?? 0;
  const has = (kind: string) => visible.some((e) => e.kind === kind);
  const terminal = [...visible]
    .reverse()
    .find((e) =>
      [
        "run.completed",
        "run.failed",
        "run.cancelled",
        "run.timed_out",
        "run.budget_exceeded",
      ].includes(e.kind),
    );
  const finished = !!terminal;
  const validated = has("route.validated");
  const replanned = has("route.replanned");
  const agents = detail.agents.map((agent) => {
    const own = visible.filter((e) => e.invocation_id === agent.id);
    const completed = [...own]
      .reverse()
      .find((e) => e.kind === "agent.completed" || e.kind === "agent.failed");
    const started = own.find((e) => e.kind === "agent.started");
    const toolCalls = own
      .filter((e) => e.kind === "tool.completed" || e.kind === "tool.failed")
      .map((e) => ({
        ...e.payload,
        status: e.kind === "tool.completed" ? "succeeded" : "failed",
      }));
    if (completed)
      return {
        ...agent,
        status: completed.kind === "agent.completed" ? "succeeded" : "failed",
        duration_ms: Number(
          completed.payload.duration_ms ??
            (started
              ? Date.parse(completed.occurred_at) -
                Date.parse(started.occurred_at)
              : 0),
        ),
        started_at: started?.occurred_at,
        finished_at: completed.occurred_at,
        tool_calls: toolCalls,
        output:
          (completed.payload.output as Record<string, unknown> | undefined) ??
          (completed.kind === "agent.failed"
            ? { error_code: completed.payload.error_code }
            : {}),
      };
    return {
      ...agent,
      status: started ? "running" : "pending",
      model: null,
      duration_ms: started
        ? Math.max(
            0,
            Date.parse(visible.at(-1)!.occurred_at) -
              Date.parse(started.occurred_at),
          )
        : 0,
      input_tokens: null,
      output_tokens: null,
      cost: null,
      output: {},
      tool_calls: toolCalls,
      started_at: started?.occurred_at,
      finished_at: undefined,
    };
  });
  return {
    ...detail,
    agents,
    error: finished ? detail.error : undefined,
    handoffs: detail.handoffs.filter((h) => h.run_seq <= seq),
    status: finished
      ? detail.status
      : has("run.started")
        ? "running"
        : "queued",
    duration_ms: finished ? detail.duration_ms : null,
    finished_at: finished ? detail.finished_at : null,
    final_kind: finished ? detail.final_kind : null,
    final_output: finished ? detail.final_output : undefined,
    metrics: finished ? detail.metrics : null,
    baseline: validated ? detail.baseline : undefined,
    candidate: validated ? detail.candidate : undefined,
    selected_plan: validated ? detail.selected_plan : undefined,
    certificate: validated ? detail.certificate : undefined,
    simulation:
      validated && detail.simulation
        ? {
            ...detail.simulation,
            metrics: finished ? detail.simulation.metrics : null,
            events: visible
              .filter((e) => e.kind === "simulation.event")
              .map((e) => e.payload as Detail["simulation"]["events"][number]),
            diagnostics: finished ? detail.simulation.diagnostics : [],
            replan_applied: replanned,
            replan_dataset: replanned ? detail.simulation.replan_dataset : null,
            replan_plan: replanned ? detail.simulation.replan_plan : null,
            replan_certificate: replanned
              ? detail.simulation.replan_certificate
              : null,
          }
        : undefined,
  };
}

export function simulationSnapshot(
  detail: Detail,
  index: number | null,
): Detail {
  if (index == null) return detail;
  const events = detail.simulation.events.slice(0, index + 1);
  const finished = index >= detail.simulation.events.length - 1;
  const replanVisible =
    events.some((e) => e.kind === "depot_loading") &&
    events.some((e) => e.kind === "new_order");
  return {
    ...detail,
    metrics: finished ? detail.metrics : null,
    simulation: {
      ...detail.simulation,
      events,
      metrics: finished ? detail.simulation.metrics : null,
      diagnostics: finished ? detail.simulation.diagnostics : [],
      replan_applied: replanVisible && detail.simulation.replan_applied,
      replan_dataset: replanVisible ? detail.simulation.replan_dataset : null,
      replan_plan: replanVisible ? detail.simulation.replan_plan : null,
      replan_certificate: replanVisible
        ? detail.simulation.replan_certificate
        : null,
    },
  };
}

export function revealedStops(detail: Detail): Stop[] {
  return detail.simulation.events.flatMap((event) =>
    event.kind === "new_order" && event.revealed_order
      ? [event.revealed_order as Stop]
      : [],
  );
}
