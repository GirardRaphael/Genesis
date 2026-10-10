# Tools skills and adoption register

Research date 2026-10-10. This register distinguishes installed agent capabilities, proposed application dependencies, and optional services. More tools do not automatically produce better work. Adopt only tools with a concrete work package and remove duplicated responsibilities.

## Ponytail installation evidence

Required tool identified as [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), a coding instruction skill. Reviewed `skills/ponytail/SKILL.md` at commit `9b58c1ffb790c075ca32e70a89cf1d80588f4abf`; upstream declares MIT licensing. Installed using the system skill-installer helper with `--repo DietrichGebert/ponytail --path skills/ponytail --ref 9b58c1ffb790c075ca32e70a89cf1d80588f4abf`.

Tool output confirmed installation at `C:\Users\xxrap\.codex\skills\ponytail`. Available to Codex on the next turn. Only the skill directory was installed; upstream hooks, marketplace configuration, and root AGENTS.md were not imported. Existing project instructions remain intact. Plugin directory search returned no Ponytail result; the maintainer repository supplied the verified skill. Its advertised benchmark improvements are not project guarantees. Use it for simplicity review while retaining all project quality gates.

Post-install verification found one file, `SKILL.md` (3,492 bytes), SHA256 `BA68FF26239C3C3B05B2A9A47EE0D9A6B93A69639A2555EC87A5D44BFFAF2F0C`. The pinned upstream LICENSE was fetched and identifies the MIT License, copyright 2026 DietrichGebert. No third-party source was copied into this repository.

## Application tool decisions

| Tool | Status / owner | Purpose and rationale | Evidence or adoption gate |
|---|---|---|---|
| LangGraph Python | Selected, W01/W02 | Four-role bounded stateful workflow and checkpoints | [Persistence docs](https://docs.langchain.com/oss/python/langgraph/persistence); recovery spike |
| Langfuse | Selected integration, W04 | Secondary correlated traces and evaluation inspection | [Official docs](https://langfuse.com/docs); verify current deployment and SDK compatibility |
| OpenTelemetry | Selected, W04 | Portable telemetry mapping | [GenAI conventions](https://github.com/open-telemetry/semantic-conventions-genai); pin revision |
| PostgreSQL | Selected, W01 | Authoritative events, queryable metrics and checkpoints | [Official docs](https://www.postgresql.org/docs/); ordering/recovery tests |
| FastAPI | Selected, W01/W03 | Typed service boundary | [Background task caveats](https://fastapi.tiangolo.com/tutorial/background-tasks/); dedicated worker for durable execution |
| React + TypeScript + Vite | Proposed frontend foundation, W03 | Original SPA with explicit contracts | Lock compatible stable versions in W01; no runtime installed in planning |
| React Flow | Selected, W05 | Interactive agent/task graph | [Accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [performance](https://reactflow.dev/learn/advanced-use/performance) |
| Apache ECharts | Selected, W05 | Timeline, Sankey, heatmap and comparisons | [ARIA handbook](https://apache.github.io/echarts-handbook/en/best-practices/aria/); validate option names for locked version |
| TanStack Table | Selected, W03 | Project-styled run inventory | [Overview](https://tanstack.com/table/latest/docs/overview); version-specific pagination integration |
| TanStack Virtual | Conditional, W05 | Large loaded event/output lists | [Virtualization](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization); adopt after profiling |
| CSS variables + project components | Selected design approach | Shared semantic tokens and consistent hierarchy | UI-SPEC.md; use browser/platform primitives first |
| Storybook | Selected, W05 | Isolated component/state review | [Accessibility tests](https://storybook.js.org/docs/writing-tests/accessibility-testing) |
| Playwright + axe | Selected, W06 | Browser journeys, screenshots and accessibility checks | [Testing](https://playwright.dev/docs/accessibility-testing), [screenshots](https://playwright.dev/docs/test-snapshots); manual checks remain necessary |
| pytest, Ruff, mypy | Proposed Python checks, W01 | Behavior, style and type checks | Pin versions and verify configuration in implementation |
| Vitest, Testing Library, ESLint | Proposed frontend checks, W01 | Reducers, metric presentation, component behavior and lint | Spike with frontend versions; no duplicate screenshot framework |
| SQLAlchemy + Alembic | Proposed, W01 | Explicit database access and migrations | Compatibility spike; migration and restore tests |
| Docker Compose | Proposed local packaging, W01/W08 | Reproducible app/database profiles | Document actual CPU/RAM/disk needs on measured setup |
| GitHub Actions | Selected when remote exists, W06 | Repeatable release checks | [Secure use](https://docs.github.com/en/actions/reference/security/secure-use); minimal permissions, pin actions to commit SHAs |
| Gitleaks and dependency audit | Proposed, W06 | Secret and dependency checks | Verify maintained versions; tune false positives without blanket suppression |
| Figma | Optional design workspace, W00/W05 | Component variants and reviewable visual reference | Existing session tools available; create only if it helps deliver reviewed designs |
| CrewAI + AgentOps + Streamlit + Plotly | Alternative, not installed | Source brief's simpler Python path | [CrewAI](https://docs.crewai.com), [AgentOps](https://docs.agentops.ai), [Streamlit](https://docs.streamlit.io), [Plotly](https://plotly.com/python); choose instead only if advanced path misses delivery gates |
| Grafana/Prometheus, Sentry | Deferred | Infrastructure metrics/error diagnostics at hosted scale | Add only after an operational requirement; do not duplicate product trace storage |
| Kafka, Kubernetes, vector database | Deferred | No MVP requirement justifies them | Revisit against measured throughput, deployment or retrieval needs |
| Vercel / managed hosting | Optional after local delivery | Frontend preview if appropriate | Worker/database lifecycle requires a separate deployment decision; no automatic hosting assumption |

Proposed dependencies with no in-session feature verification are explicitly labeled proposed. Pinning and installation belong to W01; this planning task installs only Ponytail. No claim that every item has been interoperability-tested.

## Available skills and exact intended uses

The following are present in this session's skill catalog. Availability is not execution. Read a skill before invoking its gated tool. This table is an implementation routing guide, not a command to load every skill into every task.

| Skill | Use and trigger | Current status |
|---|---|---|
| documents:documents | Read original DOCX; later create/render report if DOCX requested | Read for source analysis; no DOCX authored |
| plugin-management:plugin-management | Discover requested provider/plugin and inspect connection needs | Used for Ponytail discovery |
| skill-installer | Add reviewed repository skill at pinned ref | Used to install Ponytail |
| ponytail | Minimal complete implementation and simplicity review | Installed; local source reviewed |
| openai-docs | Current provider/model guidance and availability | Used for model-selection research |
| figma:figma-create-new-file | Prerequisite if a Figma file is created | Available; conditional |
| figma:figma-use | Prerequisite for Figma edits/inspection | Available; conditional |
| figma:figma-generate-library | Tokens and genuine reusable components | Available; use after UI direction exists |
| figma:figma-design-to-code | Implement approved Figma designs | Available; conditional |
| figma:figma-code-connect | Bind mature design components to code | Deferred until component system is stable |
| vercel:react-best-practices | Review changes spanning React components | Available; use on implementation |
| vercel:verification | Verify complete browser/API/data flow | Available; use on implementation |
| vercel:deployments-cicd | Vercel release work if selected | Available; conditional |
| vercel:env-vars | Vercel-specific secrets/environment work | Available; conditional |
| vercel:access-protected-vercel-deployment | Test protected Vercel previews | Available; conditional |
| computer-use:computer-use | Actual interactive UI testing when relevant tools are needed | Available; read before use |
| visualize:visualize | Explain exploratory metric designs inline if useful | Available; not required for written plan |
| pdf:pdf | Read/export a requested PDF report and inspect rendering | Available; delivery phase only |
| presentations:Presentations | Build 10–12 minute demonstration deck | Available; delivery phase |
| spreadsheets:Spreadsheets | Inspect/export experiments if spreadsheet requested | Available; optional |
| hugging-face:huggingface-community-evals | Evaluate local HF models if a local-provider track is selected | Deferred; current scope does not require GPU/model hosting |

External skill candidates: Anthropic `frontend-design` and OpenAI `playwright` are discoverable upstream candidates, not installed or security-reviewed here. Browser fetches of their repository folder pages failed in this session; do not call them verified additions. Existing design/browser tools cover the plan. If later needed, retrieve official skill contents, inspect license/scripts/hooks, pin commit and record installation using the same process as Ponytail.

## Dependency admission policy

For each new dependency record requirement, maintainer/source, exact version, license, transitive footprint, known limitations, overlap and removal path. Run a small integration test before adoption. Third-party skills are instructions and potentially scripts; review both. Reject tool accumulation without evidence of a missing capability. Recheck dynamic versions and prices before implementation; links marked latest are research pointers, not locks.
