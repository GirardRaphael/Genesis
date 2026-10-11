# UI and information design specification

## Product character

Create a precise logistics dispatch workbench. A route map, visit schedule and exception queue show operational decisions; an integrated **execution evidence rail** links each plan version to its producing agent, solver/tool results, independent certificate and simulation outcome. Use strong typography, alignment and selective color; avoid giant empty cards, decorative gradients and animated network wallpaper.

The first screen should show usable outputs and exceptions within one glance. Every agent output has its producer, status, timestamp, version, citations, validation result and a clear final/draft/superseded label. A graph alone does not satisfy the need to see agent work.

## Information architecture

| Route | Main content | Primary decision |
|---|---|---|
| Overview | Fleet distance/delay/coverage/cost summary, recent plan exceptions and separate eight-metric AI-observability group | Which route or agent execution needs investigation? |
| Fleet workspace | Map, vehicle/stop selection, visit schedule and frozen plan version | Is the proposed plan feasible, and which deliveries are affected? |
| Runs | Filter toolbar and high-density sortable inventory | Which comparable cohort should I inspect? |
| Run workspace | Five-role timeline/graph, route artifact and evidence inspector | Which agent produced this route or diagnostic and why did validation pass/fail? |
| Compare | Baseline/candidate map and route table; paired outcomes; separate AI spend | Were distance/cost/delay changes achieved at comparable service coverage? |
| Experiments | Five logistics scenarios, feasibility/coverage matrix, latency/error heatmap and policy outcomes | Which logistics policy helps under which disruption, with what limitations? |

At 1440px: navigation rail about 200px, central workspace flexible, inspector 360–440px when open. These are prototype values, not hardcoded minimums. At tablet width collapse navigation and move inspector below or into a route. At narrow widths prioritize run status, result and evidence; let inherently two-dimensional charts/table regions scroll with labels. Never shrink all labels until unreadable.

## Visual system

Proposed first palette: canvas `#F5F6F7`, surfaces `#FFFFFF`, text `#182026`, secondary `#52606D`, borders `#D7DEE3`, primary accent `#146C78`. Status colors: success dark green, warning dark amber, failure dark red, running blue; always add a word/icon/pattern. Verify final combinations against contrast requirements; these tokens are starting candidates. Use one locally served licensed sans-serif family and tabular numerals; monospace only for identifiers/code. Body 14–16px, table content >=13px, captions >=12px with optional density setting. Spacing scale 4/8/12/16/24/32; restrained 4–8px radii.

Give related metrics one shared visual group rather than eight equally dominant cards. Right-align numeric columns and align units. Currency and duration formatting is locale-aware. Show a metric's timeframe, denominator and missing-data marker without requiring hover. Keep a small semantic token file; chart palette and CSS must share the same definitions. Add dark mode only after light mode, contrast and charts pass; a half-finished second theme reduces quality.

## Run workspace wireframe

```text
Navigation | Mission / Run ID         verified status     timestamp / freshness
           | Fleet cost   Served/Total   Delays   Plan version   [Compare]
           | AI cost/coverage   Runtime   Tokens   [Agent replay] [Simulation]
           | ---------------------------------------------------------------
           | Timeline / Agent graph / Task flow | Output / Evidence / Verdict
           | Selected task and attempt rows    | Agent, model, artifact version
           | Linked handoffs and retry markers | Readable result and citations
           | ----------------------------------| Validation criteria and issues
           | Replay controls + current event   | Prior versions / safe export
```

Output is readable without opening every graph node. Default to the accepted final artifact if one exists; otherwise show the current task and newest clearly labeled draft. Preserve long output with bounded previews, explicit expansion/download and stable scroll. Expose redacted/missing content honestly. Streaming uses small batched updates and a Jump to latest affordance, never forced scrolling.

## Six visualizations and captions

1. Graph: stable layout by role, invocation expansion, arrow direction, sequence badges and active-status text. Selecting a node/edge reveals the corresponding artifact/task. Show observed versus planned relations explicitly.
2. Waterfall: lane per invocation with model/tool attempts nested on demand; elapsed seconds on x-axis, task labels on y-axis, visible parallelism, queue time and retry markers.
3. Sankey: two columns, sender roles and receiver roles, with separate node identities on each side. Width measures observed handoffs, including repair messages and fan-out. Count labels and an accessible sender/receiver table accompany it; sequence details are in the timeline. Do not imply flow conservation through agents.
4. Comparison: aligned horizontal cost/duration bars per agent or model; separate panels rather than a misleading dual axis. Quality/cost scatter is supplemental and includes sample counts.
5. Heatmap: scenario by agent, latency in milliseconds or error rate with explicit mode. Missingness uses a distinct pattern; keyboard details have a table equivalent.
6. KPI group: all eight mandatory values, denominators and coverage. Estimated cost is labeled estimated or partial. Active runs are excluded from finished-duration calculations per the metric contract.

The route map is an additional seventh visualization. Use MapLibre road layers with explicit depot, numbered visits, arrow direction, selected vehicle, late/unserved stop symbols, plan version and planned/simulated state. Assign a stable vehicle palette separate from status colors. Selecting a stop highlights its schedule row and opens constraint/evidence details; selecting an agent output opens its exact plan version. Baseline/candidate have a synchronized split-map or toggle with identical extent and comparable cohort labels, not confusing unlabeled overlaid paths. Map/geometry/tiles unavailable state exposes the complete route table. Display attribution and keep controls/legend readable.

Fleet KPIs: km, served/total and mandatory coverage, on-time/serviced, late minutes, estimated operating CAD cost, parcel capacity utilization and duty utilization. Emissions is optional until factor coverage is established and always labeled estimated. A dedicated observatory view retains all eight mandatory agent metrics; cost cards never combine fleet and API currencies/accounts silently. An infeasible diagnostic is visibly different from a valid plan and from a solver timeout.

Certificate labels distinguish initial full plan from future residual suffix. A valid suffix after a disruption does not turn already late deliveries or unreachable mandatory cargo green. Cumulative fleet outcomes preserve the full day's history.

Every chart has a short computed description stating the strongest measured observation and scope, e.g. which agent has the highest measured latency and how many observations support it. Do not generate confident causal prose from a chart. A no-data view states why a claim cannot be made.

## Interaction contract

- URL parameters preserve scenario, agent, model, status, date range, selected run and comparison IDs. Browser back/forward and reload reproduce the same view.
- Shared filters update affected views against one snapshot. Debounce free-text queries, cancel stale requests, and reject late responses from old filters.
- A selected run is stable while live data arrives. Reordering requires explicit sort or refresh; highlight new rows without stealing focus.
- Agent replay supports pause/play, previous/next event, speed, scrub and reset; it reconstructs artifacts available at that actual event. Simulation playback has a separate labeled delivery clock and stored vehicle/stop events. Selecting an associated event links views without merging clocks, exposing future disruptions or calling providers.
- Hover details have focus/click equivalents. All primary tasks work without drag, hover, graph animation or color perception.
- Include loading, empty, no-match, stale, reconnecting, partial, forbidden, failed, cancelled and retrying states. Never display an empty chart as a successful zero result.

## Acceptance gates

### U14 implementation refinement — 2026-10-11

The dark slate navigation rail separates workspace switching from the light data canvas; the established teal accent remains reserved for actions/selection. Compact navigation retains accessible names, and the narrow layout uses labeled horizontal navigation instead of unidentified icons. Native controls remain keyboard reachable. The noninteractive workspace label has no dropdown affordance.

Active-filter chips expose scenario/policy/status/agent/model even when the editor is closed. Inventory free text is labeled local and applies only to its loaded rows; typed search/model edits replace URL state rather than adding one history entry per character. Selected runs and comparison IDs survive filter clearing. No new server search or pagination is claimed: the inventory states its loaded/total counts and newest-200 bound. A comparison auto-selects only an available matching scenario/seed/provenance candidate, never an arbitrary unrelated fallback.

Primary navigation has exactly three workspaces: Opérations (default and brand destination), Analytique and Agents. The Agents context selector retains activity, history, comparison, execution summary and simulated plan without making them primary tabs. Explicit legacy URLs remain valid and workspace changes preserve run IDs and filters. Cohort dashboards and the global budget appear in Analytique only; the global budget remains independent of its cohort filters. Execution pages retain individual-call evidence and per-run results. Montréal timezone labels use America/Toronto and follow daylight saving.

Analytics adds a local CSV export and stronger chart/table hierarchy, retaining every table alternative and coverage label. Export is disabled until a matching-query snapshot is available, can export the last good same-query snapshot with stale metadata, and contains no full model outputs, addresses or secrets. Dispatch schedule buttons select map stops and a detail panel; paired stop navigation uses the same trip, with no invented certificate/window/load values. Selection is cleared when its route becomes hidden or disappears. Polling retains marker elements and does not continually recenter a selected stop.

Historical screenshots informed this refinement. MCP inventory subsequently identified a stopped web server and a data: browser error page. The web server was restored, but MCP still rejects navigation from that error page; user reload is pending. No alternate browser automation was used. Unit/static-render/build evidence does not certify rendered responsive layout, MapLibre focus, download delivery or WCAG compliance. A fresh visual/browser review remains a release gate.

### Original visual and usability gates

Target WCAG 2.2 AA with keyboard and screen-reader task review, visible focus, reduced motion, text resizing and reflow. Meet at least 4.5:1 normal text contrast and appropriate graphical-control contrast; validate final tokens rather than asserting compliance. Test 1440x900, 1280x800, 1024x768, 768x1024 and 390x844, plus 320 CSS-pixel reflow where applicable. Record deliberate table/graph two-dimensional exceptions.

Visual fixtures cover long multilingual labels, zero/missing data, 1 MB artifacts with bounded rendering, rejected outputs, hundreds of spans, interrupted streams and citations. Baselines run in a pinned browser/font environment. Review every changed screenshot, never bulk-accept snapshots to clear CI.

Initial performance profile: 100,000 synthetic server-side runs; API pages at most 200 rows; event/output lists up to 1,000 loaded entries with bounded rendering; focused graph up to 200 nodes/400 edges. Profile larger traces with collapse/drilldown, not unlimited canvases. Proposed p95 local selection/filter rendering <200ms after data arrival, p95 metrics API <500ms on the documented baseline, initial usable route <2.5s on that baseline. Report network and compute separately. Measure memory over 30 minutes and set a numeric regression budget in M1.

Usability acceptance: five representative testers can locate an unserved/late stop and its reason, compare baseline/candidate service coverage and estimated fleet cost, inspect the latest independently validated plan, and identify the responsible agent/tool for one failed run. Target >=4/5 per task unaided within two minutes; record failures and iterate. These are planned tests, not collected results. Formal stakeholder approval is not required for routine visual corrections.
