# Genesis technical presentation

The current French editable PowerPoint contains 32 slides: 26 narrative slides and six reference slides. Detailed speaker notes retain sources and all 87 pinned Python packages and 17 direct web/QA dependencies, including their purposes and classifications. It incorporates U17–U19 order intake, optional explanations, configurable local fleet, isolated QA and application-database recovery. The original 64-slide deck remains available as the earlier detailed reference.

## Reading the deck

| Slides | Subject |
|---|---|
| 1–6 | Purpose, delivery scope, three workspaces, order journey and architecture |
| 7–12 | Frontend, API, persistence, five roles, explanation policies and Anthropic |
| 13–18 | Maps, allocation strategies, certificates, configured fleet, application view and route memory |
| 19–24 | Six visualizations, cost accounting, budget/email, historical benchmark, QA and recovery |
| 25–26 | Company-release priorities and demonstration flow |
| 27–31 | Python runtime, support, optional, tooling and installed-only groups; full inventory in notes |
| 32 | All direct web and QA dependencies; purposes and classifications in notes |

Speaker notes explain why technologies are used, how they connect to Genesis and their operational limits. Text, tables and the policy chart remain editable. The chart describes expected explanation-call counts, not a new experiment. The application screenshot is an existing synthetic QA view. The npm transitive graph remains in the lockfiles. No client savings, real GPS, live traffic, globally optimal routes, inbox receipt or production readiness are asserted. Operator-worker activation remains distinct from isolated QA evidence.

## Source and regeneration

- `content-condensed.mjs`: current 26-slide narrative and detailed source notes.
- `build-condensed.mjs`: imports the original cover/theme, builds varied native layouts and generates six inventory slides from manifests. It checks all 104 package entries, local citations and encoding, renders all slides and finalizes the new output.
- `package-inventory.json`: descriptions/classifications; package versions are read from actual manifests at build time.
- `output/Genesis-Synthese-Technique-2026-10-11-v4.pptx`: current condensed deliverable.
- `content.mjs`, `build.mjs` and `output/Genesis-Architecture-Technologies-2026-10-11-v4.pptx`: preserved original authoring sources and 64-slide reference.
- `assets/dispatch-qa.png`: public-place synthetic QA screenshot used on slide 17.

Authoring uses the bundled Codex Presentations runtime; it adds no application dependency. Set `GENESIS_DECK_RUNTIME` to the bundled dependency directory, `GENESIS_DECK_SKILL` to the Presentations skill directory and `GENESIS_DECK_REVISION` to a fresh value such as `v5`. Invoke `presentations/build-condensed.mjs` with the bundled Node executable. The builder derives Node module and Python paths from that runtime. Use a new revision for each build: the finalizer refuses to overwrite a published output or receipt. Follow the skill's operation-marker and validation workflow for each new authoring operation. Archive finalizer-created `.chart-data-*` scratch directories under the ignored private build directory after verification.

Private drafts, renders and receipts are under ignored `artifacts/private/presentation-condensed/<revision>`; original evidence remains under `artifacts/private/presentation`. Every current slide was rendered and individually reviewed with Artifact Tool. Native PowerPoint and Google Slides rendering remain unverified. See `docs/reviews/condensed-presentation-review.md` for current coverage, artifact hash and review scope, and `docs/reviews/presentation-review.md` for the preserved original.
