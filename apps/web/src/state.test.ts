import { describe, it, expect } from "vitest";
import {
  readSelection,
  selectionSearch,
  mergeEvents,
  comparable,
  delta,
  filterRuns,
} from "./state";
import type { Run, TraceEvent } from "./types";
describe("linked state", () => {
  it("preserves filters and comparison across reloads", () => {
    const s = readSelection(
      "?view=compare&run=a&left=a&right=b&scenario=S03&agent=monitoring&q=fen%C3%AAtre",
    );
    expect(readSelection(selectionSearch(s))).toEqual(s);
  });
  it("rejects unknown route names", () =>
    expect(readSelection("?view=bad").view).toBe("overview"));
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
