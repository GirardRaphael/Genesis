# Genesis technical presentation

The current French editable PowerPoint contains 38 slides: 32 teaching slides and six reference slides. It follows a fictitious delivery request through the architecture and explains what each principal library receives, does and returns. Five conceptual illustrations show the architecture, validation, map layers, proposal/control separation and two data stores. Detailed notes retain every function, actual use, dependency relationship, example and source for all 87 pinned Python and 17 direct web/QA packages. Previous 36-, 32- and 64-slide decks are preserved.

## Reading the deck

| Slides | Subject |
|---|---|
| 1–6 | Example order, vocabulary, architecture, process/language placement and persisted request journey |
| 7–11 | React/React DOM, TypeScript versus runtime validation, Uvicorn/FastAPI, Pydantic and HTTPX/Photon |
| 12–14 | OSRM matrix, MapLibre layers and synthetic application screenshot |
| 15–20 | LangGraph roles/state, OR-Tools, strategies, independent validation and Anthropic |
| 21–25 | Tokens/cost, SQLAlchemy, SQLite/checkpoints, route memory and SSE events |
| 26–32 | ECharts/React Flow, Vite, tests, dependencies, integrations, diagnostics and responsibility recap |
| 33–38 | Python and direct web/QA references; all 104 individual records in notes |

The main slides explain mechanisms using familiar language. Speaker notes expand the concepts and link implementation evidence. The architecture illustration shows the main persisted workflow; notes clarify that the API also calls providers for geocoding/preview. The route/map drawings are conceptual, matrix numbers are explicitly fictional and the screenshot comes from synthetic QA. No real delivery, live traffic or GPS is implied. Omitted model usage remains non-applicable, distinct from measured zero-token usage. Separate application and checkpoint stores do not imply atomic recovery.

The reference pages preserve the verified catalogue. Installed Python metadata matched all 87 pins during U21; no claim of latest releases is made. Installation does not prove active feature use. npm transitives remain in lockfiles. Text and native tables are editable. Raster illustrations and the screenshot preserve their proportions. The scope remains a prototype local architecture, with company-release gaps identified in notes.

## Source and regeneration

- `content-architecture.mjs`: current 32-slide pedagogical narrative.
- `content-libraries.mjs`: preserved U21 narrative plus reused six reference tables.
- `content-condensed.mjs`: preserved U20 narrative.
- `build-condensed.mjs`: retains original cover/theme and builds current narrative/package notes. Guards assert all 104 entries, every field/evidence reference, local citations and encoding.
- `package-inventory.json`: inherited package classifications.
- `package-details.json`: 104 sourced records. Local installed metadata establishes dependency edges and code establishes use. Metadata paths describe the audited Windows environment; reproduction elsewhere needs matching metadata or a fresh audit.
- `output/Genesis-Architecture-Bibliotheques-2026-10-11-v9.pptx`: current deliverable.
- `output/Genesis-Synthese-Technique-2026-10-11-v6.pptx`: preserved 36-slide version.
- `output/Genesis-Synthese-Technique-2026-10-11-v4.pptx`: preserved 32-slide version.
- `content.mjs`, `build.mjs`, `output/Genesis-Architecture-Technologies-2026-10-11-v4.pptx`: preserved original 64-slide version and sources.
- `assets/u22/manifest.json`: built-in ImageGen prompts, original image paths and conceptual-use disclosure. The five PNG files are in the same directory.
- `assets/dispatch-qa.png`: existing public-place synthetic QA screenshot, used on slide 14.

Authoring uses the bundled Codex Presentations runtime and adds no application dependency. Set `GENESIS_DECK_RUNTIME` to the bundled dependency directory, `GENESIS_DECK_SKILL` to the Presentations skill directory and `GENESIS_DECK_REVISION` to a fresh value such as `v10`. Run `presentations/build-condensed.mjs` with bundled Node. Follow the skill operation-marker workflow for every new authoring operation. The finalizer refuses to overwrite outputs/receipts. Historical builders can be recovered from their recorded Git commits to reproduce prior narrative versions.

Private drafts, individual PNG renders, layouts and receipts are in ignored `artifacts/private/presentation-condensed/<revision>`. The final slides were individually inspected across lead and independent reviewer, with revised slides rechecked. Validation and actual PPTX note coverage are recorded in `docs/reviews/architecture-teaching-review.md` and `docs/work/U22-architecture-teaching.md`. Native PowerPoint, Google Slides and a timed rehearsal remain unverified.
