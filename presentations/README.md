# Genesis technical presentation

The French editable PowerPoint contains 64 slides, detailed speaker notes, source references and a complete inventory of the 87 pinned Python packages and 17 direct web/QA dependencies. It distinguishes application runtime, dependency infrastructure, optional integrations, installed-only packages and proposed work. The npm transitive graph remains in the repository lockfiles.

## Reading the deck

| Slides | Subject |
|---|---|
| 1–6 | Business purpose, actual delivery scope, three workspaces, architecture and repository |
| 7–13 | React/TypeScript, visualization libraries, build, API, storage and durable worker |
| 14–24 | LangGraph, roles, broker request, maps, optimization, validation, Anthropic and route memory |
| 25–31 | Memory metrics, metering, C$100 cap, unknown billing, email, replay and analytics |
| 32–42 | Optional integrations, testing, evidence, demonstration, production gates, SSE and workflow distinctions |
| 43–60 | Complete Python environment inventory, with purpose and classification in notes |
| 61–64 | Complete direct web and QA dependencies |

The main narrative is slides 1–42; the remaining slides are a technical reference appendix. Speaker notes explain why the technology is used, how it is wired into Genesis, sources and operational limits. Tables and text remain editable. No client savings, real GPS tracking, live traffic, globally optimal routes, SMTP inbox receipt or production readiness are asserted.

## Source and regeneration

- `content.mjs`: main narrative and notes, citing repository paths and official library documentation.
- `package-inventory.json`: descriptions/classifications; package versions are read from actual manifests at build time.
- `build.mjs`: creates native slide tables/text using the desktop's bundled `@oai/artifact-tool`, renders every slide, checks local citations and text encoding, and runs package/layout/import validation.
- `output/Genesis-Architecture-Technologies-2026-10-11-v4.pptx`: reviewed deliverable. Earlier drafts remain private.

Authoring uses the bundled Codex Presentations runtime; it adds no library to the Genesis application. Set `GENESIS_DECK_RUNTIME` to the bundled dependency directory and `GENESIS_DECK_SKILL` to the installed Presentations skill directory, then invoke `presentations/build.mjs` with the bundled Node executable. The builder derives its Node module and Python paths from that runtime. To create a revision, choose new candidate, final and receipt filenames in the builder first; the finalizer refuses to overwrite a published output or receipt. Follow the skill's operation marker and validation workflow for a new authoring operation.

Private drafts, slide renders and validation receipts are in the ignored `artifacts/private/presentation` directory. This deck was rendered and visually reviewed with Artifact Tool. It was not opened or edited in native PowerPoint or Google Slides. See `docs/reviews/presentation-review.md` for the reviewed artifact hash and verification scope.
