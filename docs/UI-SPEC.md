# UI and information design specification

## Product character

Create a precise analytical workbench. Use strong typography, consistent alignment and selective color; avoid giant empty cards, decorative gradients, excessive rounded containers, stock landing-page sections and animated network wallpaper. Distinctiveness comes from an integrated **execution evidence rail** that links a selected task to its timeline, output version, evidence and verification verdict.

The first screen should show usable outputs and exceptions within one glance. Every agent output has its producer, status, timestamp, version, citations, validation result and a clear final/draft/superseded label. A graph alone does not satisfy the need to see agent work.

## Information architecture

| Route | Main content | Primary decision |
|---|---|---|
| Overview | Compact eight-metric strip; trend/comparison; recent runs table; exceptions | Which run needs investigation? |
| Runs | Filter toolbar and high-density sortable inventory | Which comparable cohort should I inspect? |
| Run workspace | Summary header; timeline and graph tabs; synchronized output/evidence inspector | What happened, what was produced, and why did validation pass/fail? |
| Compare | Two pinned runs; aligned metrics; artifact diff; policy/scenario metadata | What changed and is it a credible improvement? |
| Experiments | Scenario matrix, latency/error heatmap, quality/cost comparison, recommendations | Which policy earns a measured advantage? |

At 1440px: navigation rail about 200px, central workspace flexible, inspector 360–440px when open. These are prototype values, not hardcoded minimums. At tablet width collapse navigation and move inspector below or into a route. At narrow widths prioritize run status, result and evidence; let inherently two-dimensional charts/table regions scroll with labels. Never shrink all labels until unreadable.

## Visual system

Proposed first palette: canvas `#F5F6F7`, surfaces `#FFFFFF`, text `#182026`, secondary `#52606D`, borders `#D7DEE3`, primary accent `#146C78`. Status colors: success dark green, warning dark amber, failure dark red, running blue; always add a word/icon/pattern. Verify final combinations against contrast requirements; these tokens are starting candidates. Use one locally served licensed sans-serif family and tabular numerals; monospace only for identifiers/code. Body 14–16px, table content >=13px, captions >=12px with optional density setting. Spacing scale 4/8/12/16/24/32; restrained 4–8px radii.

Give related metrics one shared visual group rather than eight equally dominant cards. Right-align numeric columns and align units. Currency and duration formatting is locale-aware. Show a metric's timeframe, denominator and missing-data marker without requiring hover. Keep a small semantic token file; chart palette and CSS must share the same definitions. Add dark mode only after light mode, contrast and charts pass; a half-finished second theme reduces quality.

## Run workspace wireframe

```text
Navigation | Mission / Run ID         verified status     timestamp / freshness
           | Cost + coverage   Duration   Tokens   Policy   [Compare] [Replay]
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

Every chart has a short computed description stating the strongest measured observation and scope, e.g. which agent has the highest measured latency and how many observations support it. Do not generate confident causal prose from a chart. A no-data view states why a claim cannot be made.

## Interaction contract

- URL parameters preserve scenario, agent, model, status, date range, selected run and comparison IDs. Browser back/forward and reload reproduce the same view.
- Shared filters update affected views against one snapshot. Debounce free-text queries, cancel stale requests, and reject late responses from old filters.
- A selected run is stable while live data arrives. Reordering requires explicit sort or refresh; highlight new rows without stealing focus.
- Replay supports pause/play, previous/next event, speed, scrub and reset. It reconstructs as-of state, including which artifacts existed then. It never shows future results early or calls providers.
- Hover details have focus/click equivalents. All primary tasks work without drag, hover, graph animation or color perception.
- Include loading, empty, no-match, stale, reconnecting, partial, forbidden, failed, cancelled and retrying states. Never display an empty chart as a successful zero result.

## Acceptance gates

Target WCAG 2.2 AA with keyboard and screen-reader task review, visible focus, reduced motion, text resizing and reflow. Meet at least 4.5:1 normal text contrast and appropriate graphical-control contrast; validate final tokens rather than asserting compliance. Test 1440x900, 1280x800, 1024x768, 768x1024 and 390x844, plus 320 CSS-pixel reflow where applicable. Record deliberate table/graph two-dimensional exceptions.

Visual fixtures cover long multilingual labels, zero/missing data, 1 MB artifacts with bounded rendering, rejected outputs, hundreds of spans, interrupted streams and citations. Baselines run in a pinned browser/font environment. Review every changed screenshot, never bulk-accept snapshots to clear CI.

Initial performance profile: 100,000 synthetic server-side runs; API pages at most 200 rows; event/output lists up to 1,000 loaded entries with bounded rendering; focused graph up to 200 nodes/400 edges. Profile larger traces with collapse/drilldown, not unlimited canvases. Proposed p95 local selection/filter rendering <200ms after data arrival, p95 metrics API <500ms on the documented baseline, initial usable route <2.5s on that baseline. Report network and compute separately. Measure memory over 30 minutes and set a numeric regression budget in M1.

Usability acceptance: five representative testers can find the latest accepted output, identify the most expensive agent and explain one failed run. Target >=4/5 completing each task unaided within two minutes; document failures and iterate. These are planned tests, not collected results. Formal stakeholder approval is not required for routine visual corrections.
