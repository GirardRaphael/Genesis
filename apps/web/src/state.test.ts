import { describe, it, expect } from "vitest";
import {
  readSelection,
  selectionSearch,
  mergeEvents,
  comparable,
  delta,
  filterRuns,
  comparisonCandidate,
  montrealZone,
} from "./state";
import type { Run, TraceEvent } from "./types";
describe("linked state", () => {
  it("formats the actual Montréal offset in winter and summer", () => {
    expect(montrealZone(new Date("2026-01-10T12:00:00Z"))).toContain("5");
    expect(montrealZone(new Date("2026-07-10T12:00:00Z"))).toContain("4");
  });
  it("never silently picks an unrelated comparison or the same run", () => {
    const a = {
      id: "a",
      scenario_id: "S01",
      seed: 1,
      provenance: "fixture",
    } as Run;
    const unrelated = { ...a, id: "b", seed: 2 };
    const match = { ...a, id: "c", policy: "solver_with_one_replan" };
    expect(comparisonCandidate([a, unrelated], "a")).toBe("");
    expect(comparisonCandidate([a, unrelated, match], "a")).toBe("c");
    expect(comparisonCandidate([a, match], "missing")).toBe("");
    expect(
      comparisonCandidate([{ ...a, workflow_kind: "broker" }, match], "a"),
    ).toBe("");
  });
  it("preserves filters and comparison across reloads", () => {
    const s = readSelection(
      "?view=compare&run=a&left=a&right=b&scenario=S03&agent=monitoring&q=fen%C3%AAtre",
    );
    expect(readSelection(selectionSearch(s))).toEqual(s);
  });
  it("rejects unknown route names", () =>
    expect(readSelection("?view=bad").view).toBe("dispatch"));
  it("opens operations by default and preserves old execution links", () => {
    expect(readSelection("").view).toBe("dispatch");
    for (const view of [
      "overview",
      "fleet",
      "runs",
      "compare",
      "observatory",
      "analytics",
      "dispatch",
    ]) {
      const selection = readSelection(
        `?view=${view}&run=a&left=a&right=b&scenario=S03&status=succeeded&policy=baseline_only&agent=planning&model=claude&q=local`,
      );
      expect(selection.view).toBe(view);
      expect(readSelection(selectionSearch(selection))).toEqual(selection);
      expect({ ...selection, view: "analytics" }).toMatchObject({
        run: "a",
        left: "a",
        right: "b",
        scenario: "S03",
        agent: "planning",
        model: "claude",
        query: "local",
      });
    }
  });
  it("deduplicates stream history and orders committed sequence", () => {
    const event = (n: number) =>
      ({ event_id: String(n), run_seq: n }) as TraceEvent;
    expect(
      mergeEvents([event(3), event(1)], [event(2), event(3)]).map(
        (e) => e.run_seq,
      ),
    ).toEqual([1, 2, 3]);
  });
  it("does not compare unrelated service days and preserves zero baseline", () => {
    const a = { scenario_id: "S01", seed: 1, provenance: "fixture" } as Run;
    expect(comparable(a, { ...a, seed: 2 })).toBe(false);
    expect(delta(0, 10)).toEqual({ absolute: 10, percent: null });
  });
  it("intersects filters without losing selected run state", () => {
    const runs = [
      {
        id: "a",
        scenario_id: "S01",
        status: "succeeded",
        policy: "baseline_only",
        scenario_label: "Nominal",
      },
      {
        id: "b",
        scenario_id: "S02",
        status: "failed",
        policy: "baseline_only",
        scenario_label: "Congestion",
      },
    ] as Run[];
    expect(
      filterRuns(runs, readSelection("?scenario=S02&status=failed&run=a")).map(
        (r) => r.id,
      ),
    ).toEqual(["b"]);
  });
});
