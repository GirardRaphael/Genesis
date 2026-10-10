# UI tools research and visual quality gates

**Scope note after user selection of A11:** this note originated in the A1 planning phase. Shared accessibility and component/tool findings remain useful; current UI-SPEC.md and LOGISTICS-SPEC.md add map/visit inspection, fleet metrics and dual-clock simulation. Use those current contracts for product-specific behavior.

Research date: 2026-10-10. Status: planning recommendations; no application or UI has been implemented or tested. Evidence below comes from primary maintainers and W3C. Product decisions and numeric acceptance targets are research proposals, not vendor guarantees. Canonical PLAN.md, DATA-CONTRACT.md, UI-SPEC.md, and TOOLS-AND-SKILLS.md supersede these exploratory recommendations wherever they differ.

## Decision

Build a purpose-designed operational workbench around agent outputs, execution evidence, and exceptions. A graph is a supporting inspection mode. The default screen must answer: what finished, what needs attention, what changed, and which outputs are trustworthy enough to use. Do not make a decorative node canvas the only way to inspect work.

Use TanStack Table for the run/output inventory, TanStack Virtual only where measured list size requires it, React Flow for focused lineage, Apache ECharts for operational trends, Storybook for component states, and Playwright for complete flows and visual regression. Pin compatible versions after a small integration spike; documentation under `latest` changes and is not a dependency lock.

## Tool selection

| Tool | Decision | Evidence and project use | Limits / adoption gate |
| --- | --- | --- | --- |
| TanStack Table | Adopt | Headless table state allows project-owned markup and visual design. Use server-side filtering, sorting, and pagination for the complete inventory. [Overview](https://tanstack.com/table/latest/docs/overview), [pagination](https://tanstack.com/table/latest/docs/framework/react/guide/pagination). | Own accessibility and styling. The researched latest documentation describes v9; do not paste v8 examples into v9 code. Select and lock a compatible stable release during implementation. |
| TanStack Virtual | Adopt selectively | Table virtualization is separate from table state. Window long output/event lists and large fetched result pages; do not download an entire large database merely because the DOM is virtualized. [Virtualization](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization). | Start with ordinary pagination. Test focus preservation, browser Find limitations, screen-reader access, export of all authorized matching rows, and stable row IDs. |
| TanStack Virtual feed anchoring | Spike, then adopt for long streams | Maintainer documentation describes stable IDs, end anchoring, and follow-on-append for chat/log views. [Chat contract](https://tanstack.com/virtual/latest/docs/chat). | Verify these APIs exist in the pinned version. Reading history must never snap the user back to the bottom; expose a new-events count and Jump to latest. |
| React Flow | Adopt for lineage | Built-in node/edge keyboard focus, selection, focus panning, and configurable accessible instructions support trace exploration. [Accessibility](https://reactflow.dev/learn/advanced-use/accessibility). | This is not a compliance certificate. Custom nodes need their own labels and focus rules. Provide a synchronized textual hierarchy; prohibit graph edits in read-only observatory mode. |
| React Flow performance practices | Adopt | Memoize node components and callbacks, avoid broad subscriptions to changing graph arrays, collapse detail, and simplify expensive styles. [Performance](https://reactflow.dev/learn/advanced-use/performance). | Profile production builds with representative topology. Never promise unlimited nodes; bound the visible graph and show omitted-node counts. |
| Apache ECharts | Adopt for trends | ARIA descriptions and decal patterns support additional chart interpretation. [Accessibility handbook](https://apache.github.io/echarts-handbook/en/best-practices/aria/), [API](https://echarts.apache.org/en/api). | Import required ARIA support, verify the pinned-version option names, and supply human-authored summaries plus accessible data tables. Do not equate generated descriptions with full keyboard access. |
| Storybook | Adopt | Component accessibility tests and isolated states support systematic review. [Accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing). | Cover failure and long-content states, not just attractive populated examples. Automated checks do not replace manual keyboard and assistive-technology review. |
| Playwright | Adopt | Screenshot comparisons and accessible-browser test integration provide repeatable checks. [Visual comparisons](https://playwright.dev/docs/test-snapshots), [accessibility testing](https://playwright.dev/docs/accessibility-testing). | Fix browser, operating system, fonts, time, and fixture data for visual baselines. A model must inspect changed screenshots; baseline regeneration is not approval. |
| W3C WCAG 2.2 / APG | Adopt as requirements | Target WCAG 2.2 AA and use APG patterns for genuine interactive grids. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/). | Prefer native semantic tables for ordinary read-only results. A grid role creates additional keyboard obligations. Document applicable exceptions and manual test results. |

## Ponytail: identified, required, bounded

The strongest match for the user's explicit request is **DietrichGebert/ponytail**, an MIT-licensed agent coding/review skill with Codex integration. This is an identified candidate, not confirmation of the user's unstated intended URL. It is not Tailwind CSS, a monitoring backend, or the similarly named service-tail-latency research toolkit. Primary evidence: [repository and installation guidance](https://github.com/DietrichGebert/ponytail), [skill source](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md).

**Current project status:** the lead installed the skill-only directory at commit `9b58c1ffb790c075ca32e70a89cf1d80588f4abf` into `C:\Users\xxrap\.codex\skills\ponytail`, as recorded in [the tools register](../TOOLS-AND-SKILLS.md). Hooks, marketplace configuration, and upstream root AGENTS.md were not imported. This researcher did not perform that installation. The updated session catalog now lists the skill; availability is distinct from application on a task.

**Decision: retain Ponytail in the implementation toolchain.** Its role is simplicity review, reuse of existing capabilities, and reduction of unjustified code. Keep independent verification and project acceptance criteria authoritative. Upstream benchmark percentages are author-reported and do not establish this project's expected savings or correctness.

Integration procedure for future updates (the pinned skill-only installation above is complete):

1. Record the exact upstream commit and license; inspect the skill, command adapters, and lifecycle hooks.
2. Install a reviewed pinned skill or supported plugin using the approved project tooling. Record what was actually installed and its path/version. Do not claim activation from merely linking the repository.
3. Preserve project instructions; do not replace the project `AGENTS.md` with an upstream file. Reconcile conflicting instructions explicitly.
4. Apply Ponytail at solution selection and before independent review. It may suggest removing complexity; it may not remove required validation, authorization, accessibility, tests, documentation, or data-loss protections.
5. Keep hooks disabled until their actual behavior is reviewed and host trust requirements are met. The instruction-only skill remains useful without hooks.
6. Record accepted and rejected simplification findings with reasons. Any code rewrite is retested before push.

## Design tooling and skills

The session catalog exposes the following relevant skills. Catalog availability is not evidence that a skill has been read, activated, or its service authenticated. Load the relevant `SKILL.md` immediately before use and follow its prerequisites.

| Skill / capability | Planned use | Adoption |
| --- | --- | --- |
| `figma:figma-use`, `figma:figma-create-new-file` | Build a source design file when connected; define workbench layouts and inspector behavior. | Optional design artifact path; local token/spec files remain executable requirements. |
| `figma:figma-generate-library` | Tokenized typography, semantic colors, density variants, tables, badges, inspectors, empty/error states. | Adopt if Figma is used; do not create a generic component catalog without the core workflow. |
| `figma:figma-design-to-code`, `figma:figma-code-connect` | Translate approved designs and maintain component mappings. | Conditional on actual design source and supported connection. |
| `figma:figma-generate-diagram` | Explain ingestion, provenance, review, and output flow in FigJam. | Optional; text contracts and Mermaid suffice initially. |
| `vercel:react-best-practices` | Review multiple TSX changes for hooks, structure, accessibility, and rendering concerns. | Adopt during React implementation. |
| `vercel:verification` | Validate browser-to-API-to-data behavior. | Adopt when applicable to implementation; does not replace project-specific checks. |
| `computer-use:computer-use` | Inspect real responsive layouts and keyboard behavior when browser automation tools are available. | Adopt for manual-style inspection; use purpose-built test tools for repeatability. |
| `visualize:visualize` | Review an interactive information architecture or screen-density prototype. | Optional planning artifact; no production dependency. |
| `imagegen` | Small original brand assets only if the visual direction needs them. | Defer: generated decoration does not improve operational information quality. |
| `skill-creator` | Encode repeated project review and trace-inspection procedures after the workflow stabilizes. | Defer until repetition justifies a reusable skill. |

Do not install every available skill. Additional plugins require a concrete missing capability, provenance review, and a documented maintenance owner. Figma, screenshots, and AI design generation do not independently establish usability.

## Proposed visual direction

Use an editorial operations style: warm neutral canvas, precise typography, strong column alignment, compact but readable tables, restrained borders, and a single brand accent. Status colors are semantic and supplemented by text and shape. Display numbers with tabular figures; reserve monospace for identifiers, timestamps, and code. No ornamental gradients, glowing graph edges, giant metric cards, repetitive rounded boxes, or animated background noise.

The desktop workbench has a stable navigation rail, global environment/time scope, an inventory pane, and a resizable contextual inspector. Detail pages preserve the selected run and filter context in the URL. The main run record connects final output, intermediate artifacts, tool activity, latency/cost, lineage, evaluator results, and source evidence. Output text receives enough space to read; raw JSON is a secondary view. An explicit provenance panel distinguishes observed events, agent claims, deterministic validation, and model judgments.

Provide Overview, Runs, Outputs, Agents, Evaluations, and Alerts only when each has distinct user tasks. A failure must link to the exact failing span and affected output. Never label an unevaluated output as verified. Distinguish completed execution from successful business outcome. Unknown cost remains unknown; missing data is not zero.

## Visual and usability acceptance gates

These are proposed gates to validate during the first working slice. Save fixtures, screenshots, browser traces, and reviewer findings with the exact commit.

| Gate | Required evidence and pass condition |
| --- | --- |
| V01 Task hierarchy | Five representative operator tasks: find failed run, read final output, inspect evidence, compare runs, locate cost outlier. In a small formative test, at least 4 of 5 participants complete each without coaching; record task times and failures. Initial target: median under 60 seconds for finding a specified failure and its output. This is a usability target, not a measured claim. |
| V02 Density | At 1440x900, inventory, key filters, status meaning, and selected-run context are visible without page-level horizontal scrolling. Comfortable and compact density share the same hierarchy. No information available only on hover. |
| V03 Responsive layout | Review 1920x1080, 1440x900, 1024x768, 768x1024, and 390x844. On narrow screens, inspector becomes a dedicated route/sheet; preserve back navigation. Two-dimensional tables/graphs may scroll within labeled regions; ordinary prose must reflow. |
| V04 Long and difficult data | Fixtures include 200-character agent names, empty output, 1 MB text artifact with bounded preview, deeply nested JSON, RTL text, mixed-language output, missing metrics, expired artifact link, hundreds of spans, partial streaming, duplicate events, and redacted content. No overlap, unreadable clipping, layout explosion, or unsafe rendering. |
| V05 States | Screenshot and behavior coverage for initial load, background refresh, empty dataset, no filter matches, disconnected, stale, reconnecting, unauthorized, forbidden, server error, partial data, canceled, and retrying. Each state offers an accurate next action and explains its data freshness. |
| V06 Accessibility | WCAG 2.2 AA target: text contrast at least 4.5:1 (3:1 for qualifying large text), appropriate non-text contrast, visible unobscured focus, full keyboard task completion, 200% text resizing, and reflow review at 320 CSS pixels with applicable two-dimensional exceptions. Controls target at least 24x24 CSS pixels or satisfy the standard's exceptions. Automated axe results have no unresolved serious/critical issues; manually review remaining issues and keyboard/screen-reader tasks. |
| V07 Motion and focus | Reduced-motion mode removes nonessential transitions. Incoming events do not reorder the selected row, steal focus, restart reading, or force scrolling. Announce summarized status changes, not every token. Dialogs restore focus to the trigger. |
| V08 Truthful charts | Units, timezone, aggregation window, sample count, data gaps, and denominator are explicit. Tooltips work by keyboard or have equivalent accessible information. Zero and unavailable differ. Charts have concise summaries and tabular alternatives. No smoothed curves suggesting nonexistent measurements. |
| V09 Graph usefulness | Selected path and relation type remain legible; direction is explicit. Grouping and depth limits have visible counts. Search and inspector selection synchronize with the hierarchy/table. The graph remains supplemental; all core inspection tasks work without it. |
| V10 Performance | First benchmark profile: production build, documented hardware/browser, 100,000 server-side run records, API pages of at most 200 rows and event/output lists up to 1,000 loaded entries with bounded rendering, and a 200-node/400-edge focused graph. Proposed p95 filter/selection response under 200 ms after data availability; measured route load and API latency reported separately. No unbounded memory growth during a 30-minute event stream; establish numeric memory budget from the baseline before release. |
| V11 Regression control | Freeze clocks and fixtures; run screenshot comparisons in a consistent CI image. Reviewer checks every intentional baseline change against requirements. No blanket large pixel tolerances or automatically accepted diffs. Functionality assertions accompany visual snapshots. |
| V12 Independent review | A verification model reads the change, acceptance criteria, fixtures, actual screenshots, and test results. It reports file/line or screenshot-region findings, severity, evidence, and retest requirements. Critical/high issues block push; lower issues require recorded disposition. Model approval cannot fabricate missing test evidence. |

## Immediate implementation experiments

1. Build one vertical slice: authenticated run inventory -> selected run -> output and evidence. Use realistic synthetic fixtures, then one real authorized integration. Do not build six empty dashboard routes first.
2. Prove table filtering against server results, stable selection during incoming events, and a refreshable URL.
3. Compare bounded text rendering and virtualized long output against the same fixture; keep the simplest approach meeting the gate.
4. Prototype a focused graph of the selected run, never the entire organization. Compare it against a textual span tree for diagnosis time.
5. Render one latency chart and one cost breakdown, validating denominators and missing-data semantics against fixture calculations.
6. Establish Storybook states and Playwright baselines only after the core hierarchy is reviewed. Keep a small explicit token file and a visual decision log.

## Research action record and limitations

Searched for the exact Ponytail name and investigated a primary repository rather than substituting another tool. Read official React Flow accessibility/performance, TanStack table/virtualization/feed, ECharts ARIA, Storybook testing, Playwright testing, and W3C materials. An initial TanStack virtualization URL returned 404; replaced it with the current framework-specific guide. Read the session skill catalog to identify relevant available workflows; no skill installation or activation was performed by this research task. Only this research file was authored; no application code, dependency installation, browser UI validation, or benchmark was performed. No claim of visual perfection, complete WCAG conformance, or guaranteed error-free implementation is made.


### Alignment task record (2026-10-10)

Work W00; requirements U01/U02/U04 and R03/R12. Actor: delegated UI research agent; exact runtime model was not exposed in this task. Owned file: this research note only. Dependencies read: README, PLAN, REQUIREMENTS, DATA-CONTRACT, BACKLOG, UI-SPEC, and TOOLS-AND-SKILLS. Updated the precedence statement, aligned the performance fixture with the 200-row API page limit and 1,000-entry loaded-list profile, and recorded the lead's completed pinned Ponytail installation without attributing it to this researcher. Exclusions: application code, installation, canonical contracts, action ledger, commits and pushes. Acceptance: compare revised text to canonical specifications and run whitespace checks. The lead owns the corresponding ACTION-LOG entry and independent review.
