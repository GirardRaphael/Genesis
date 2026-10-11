# Genesis technical presentation

The current French editable PowerPoint contains 36 slides: 30 narrative slides and six reference slides. It explains what the core libraries do, why Genesis uses them and how their responsibilities connect. Four additional pages cover library/dependency/service distinctions, a command's flow, OR-Tools and build/test tools. Detailed speaker notes retain all 87 pinned Python and 17 direct web/QA packages with individual function, actual use, dependency inclusion, concrete example and sources. It incorporates U17–U19 implementation evidence. The previous 32-slide synthesis and original 64-slide deck remain unchanged.

## Reading the deck

| Slides | Subject |
|---|---|
| 1–6 | Purpose, delivery scope, three workspaces, order journey and architecture |
| 7–11 | Library/dependency/service distinctions, frontend, API, persistence and request flow |
| 12–18 | Five roles, model explanations, maps, allocation, OR-Tools and certificates |
| 19–25 | Fleet, application view, route memory, visualizations, cost/budget and benchmark |
| 26–30 | Build/test libraries, actual verification, recovery, company priorities and demonstration |
| 31–35 | Python dependency relationships, transport/validation/tracing, optional integrations, tests and packages without direct business imports |
| 36 | Direct web and QA dependency groups; all 17 individual entries in notes |

The visible tables pair general functions with concrete Genesis uses. The six reference pages illustrate dependency chains instead of showing only package counts. Notes distinguish direct imports, transitive support, conditional extras and optional integrations. All 87 Python installed versions matched their pins during this review; installation is not evidence of an active product feature. The reference classification is inherited from the original inventory, while the new per-package explanations clarify actual use. The npm transitive graph remains in lockfiles. Text, tables and the policy chart remain editable. The chart describes expected calls, not a new experiment; the screenshot remains synthetic QA. Production/worker-activation limitations remain explicit.

## Source and regeneration

- `content-condensed.mjs`: preserved 26-slide U20 narrative, reused as the base.
- `content-libraries.mjs`: expands that base to 30 narrative slides and defines the six reference-page tables.
- `build-condensed.mjs`: imports the original cover/theme, builds native layouts and generates detailed package notes from manifests/catalogue. It asserts all 104 entries, every explanatory field and evidence reference, source existence and encoding, renders all slides and finalizes the new output.
- `package-inventory.json`: descriptions/classifications; package versions are read from actual manifests at build time.
- `package-details.json`: 104 individually sourced package records. Local installed metadata establishes Python dependency links; code establishes use. Each record also links first-party documentation. Metadata paths are evidence from the verified Windows environment, not repository files. Reproduction needs that matching environment or a new metadata audit.
- `output/Genesis-Synthese-Technique-2026-10-11-v6.pptx`: current library-explanation deliverable.
- `output/Genesis-Synthese-Technique-2026-10-11-v4.pptx`: preserved 32-slide synthesis.
- `content.mjs`, `build.mjs` and `output/Genesis-Architecture-Technologies-2026-10-11-v4.pptx`: preserved original authoring sources and 64-slide reference.
- `assets/dispatch-qa.png`: public-place synthetic QA screenshot used on slide 20.

Authoring uses the bundled Codex Presentations runtime; it adds no application dependency. Set `GENESIS_DECK_RUNTIME` to the bundled dependency directory, `GENESIS_DECK_SKILL` to the Presentations skill directory and `GENESIS_DECK_REVISION` to a fresh value such as `v7`. Invoke `presentations/build-condensed.mjs` with the bundled Node executable. The builder derives Node module and Python paths from that runtime. Use a new revision for each build: the finalizer refuses to overwrite a published output or receipt. Follow the skill's operation-marker and validation workflow for each new authoring operation. Archive finalizer-created `.chart-data-*` scratch directories under the ignored private build directory after verification.

Private drafts, renders and receipts are under ignored `artifacts/private/presentation-condensed/<revision>`; original evidence remains under `artifacts/private/presentation`. Every current slide was rendered and individually reviewed with Artifact Tool. Native PowerPoint and Google Slides rendering remain unverified. See `docs/reviews/library-explanation-review.md` for current coverage/hash/scope, `docs/reviews/condensed-presentation-review.md` for the 32-slide version and `docs/reviews/presentation-review.md` for the original.
