# Architecture teaching presentation review

Date: 2026-10-11. Independent reviewer: gpt-6-astra, high reasoning, in a separate agent context (configuration confirmed by the lead). Status: final v9 deck and integration documentation approved within the scope below.

## Assignment

Review U22, the requested architectural teaching revision for nontechnical French readers. Requirement scope: U15/U20/U21 presentation follow-up, R14/R17, U02/U04/U05. Own only this review file. The lead owns deck content, generated outputs and integration documentation. Dependencies: governing README/PLAN/REQUIREMENTS/DATA-CONTRACT/LOGISTICS-SPEC, MODEL-POLICY, actual application sources, existing presentation sources and the 104-entry package catalogue. Apply the Presentations and Ponytail skills. Exclude application changes, private configuration, operational databases, runtime activation, provider calls, email and Git publication by this reviewer.

Acceptance checks: explain the browser/API/stored request/worker path, separate application and checkpoint stores, distinguish orchestration/route solving/independent validation/optional model explanations, distinguish direct code dependencies from network services, teach core library mechanisms with concrete examples, retain all 104 full package records, inspect assigned final slide renders individually, and check reviewed final source/output identity. Lead records the shared action log and publication evidence.

## Initial recommendations

- Replace general product/roadmap/benchmark material with one concrete order that travels through the architecture. Give each core library a visible input, transformation and output.
- Show the saved waiting list between API and worker. The API validates and records a request; a separate worker claims it from storage. A direct API-to-worker arrow alone hides the reliability mechanism.
- Name the two local stores: application SQLite holds orders, requests, events and budget, while a separate SQLite file holds LangGraph checkpoints. SQLAlchemy provides database access and transactions; it is not another storage engine.
- Teach a checkpoint as a saved workflow position without promising exactly-once effects or fully verified crash recovery. The application backup excludes checkpoints.
- Keep OR-Tools candidate search, Genesis constraint recalculation and optional Anthropic text distinct. LangGraph schedules the roles; React Flow visualizes them. Neither establishes route feasibility.
- Explain French everyday meaning before technical terms such as request, transaction, checkpoint, frontend/backend and dependency. Use short captions explaining what the reader should notice in each image.
- Make optional PostgreSQL, Langfuse and SMTP status explicit. A package being installed does not prove that its feature runs in this application.
- Date operational status such as the operator worker's pending restart if retained. It is a delivery status, not an architectural property.

## Evidence examined

The source check found `broker_api.create_plan` persists a run through `Store.create_run` before returning HTTP 202. `worker.run_once` claims a stored row, selects the runtime and maintains its lease with a heartbeat. `Runtime.execute` builds the five-role chain plus finalization with LangGraph `StateGraph` and `SqliteSaver`. `Store` defaults to `data/genesis.db`; checkpoints default to `data/checkpoints.sqlite`. This supports the recommended separation of responsibilities. Existing catalogue entries and reference slides already distinguish active imports, dependency support and optional configurations, so they should be preserved rather than rewritten indiscriminately.

## v7 substantive review

Read the complete new narrative, inherited six reference pages, new builder branches and image manifest. The architecture now distinguishes language/process locations, a persisted waiting request, the API/worker boundary, a separate checkpoint store, routing inputs, solver search, independent checks and optional model explanations. Concrete teaching examples include an address contract mismatch, a directed time matrix, atomic CSV import, a saved workflow position and event delivery to the screen. The reference section retains technical details outside the main explanatory story.

Individually inspected rendered slides 20–38 at 1280 × 720. No clipping, overlap or unreadable table cells were found. The two-memory illustration clearly separates the application register and workflow notebook. The lead owns the individual review of slides 1–19.

Findings returned to the author:

1. Correct the LangGraph notes' statement that omitted model usage stays zero. `Runtime.node` stores null input/output/cost with a `not_applicable` omission reason and no provider attempt. Change the troubleshooting symptom to absence of a model call so the teaching example preserves this distinction.
2. Shorten the last question on slide 32 to avoid an isolated question mark.
3. Prefer an unused-import example for Ruff instead of suggesting it generally detects nonexistent imported modules.

Independently read the actual v7 PPTX ZIP/XML, not just the source JSON. It contains 38 slides and 38 notes parts. Every one of the 104 package records retains its function, Genesis use, inclusion/dependency explanation, example and every evidence reference. All 87 Python pinned versions and 17 direct JavaScript declared versions are present. SHA256: `842946a1ccfe4f3bcd3e8df57b83b849b427fe0be74332703f29a0a33e344124`. The v7 finalization receipt reports zero package/layout findings and successful first-party import. No native chart exists in this revised explanatory deck; the editable matrix and other tables remain native tables.

The first attempted U22 task-record read found the guessed path absent; the lead was notified that the final work record still needs review. Read-only checks used repository text, source, exported XML, images and finalization receipts. No application tests or live evaluations were run for this presentation-only change. Native PowerPoint/Google Slides rendering and timed delivery remain unverified.

## Corrected v9 approval

All three findings are resolved. Individually inspected v9 slides 28, 31 and 32 after correction; the text fits and the question mark stays with its question. The remaining 35 slide PNGs are byte-identical to v7. The exported LangGraph note now correctly distinguishes non-applicable omitted usage from measured zero. The v8 check had failed that assertion because it was a redundant intermediate build before the source corrections; it is not approved as the final deliverable.

Repeated the actual final PPTX XML audit: 38 slides/38 notes, all 104 complete records and their evidence references, 87 Python pins and 17 direct JS versions retained. The finalizer receipt matches the output SHA256 and reports zero package/layout findings with successful first-party import. Read the updated presentation README; its page map, technical distinctions and limits match the deck.

Reviewed final output: `presentations/output/Genesis-Architecture-Bibliotheques-2026-10-11-v9.pptx`.

| Reviewed file | SHA256 |
|---|---|
| Final v9 PPTX | `36791f2e56e20fbe9bac099777f0819ab3b058b8ed6d94a7f8bff1027c1de345` |
| `presentations/content-architecture.mjs` | `821ed094c1d608531e748abb1620ecc6fc317d1f4c41512b89a9485e93e7a208` |
| `presentations/build-condensed.mjs` | `407ec5337466bc3ce8963d58d882dae5310a1aa9dea0f66b1e6650281297ac49` |
| `presentations/package-details.json` | `b6aa2ac2b8b7787c5eb348674f0e210cee1ab0509b67af3dfdff22521d3262ae` |
| `presentations/assets/u22/manifest.json` | `4457658e7b20010b331f2503e8d5f6a64935500111e95e3d32f5579f27038a91` |

## Integration documentation and publication scope

Read the final U22 work record, root and presentation READMEs, U22 implementation-status entry, requirement scope paragraph, D38 and action A105. Their counts, paths, corrected usage semantics, evidence and limits match the reviewed artifact. The work record distinguishes the five instructional images from application-provider activity and records the actual authoring failures. D38 is explicitly a presentation structure decision and does not claim application architecture changes. The earlier deck files remain present, and only v9 remains in the tracked output directory for this revision. `git diff --check` passed; Git reports line-ending normalization warnings but no whitespace errors.

| Reviewed documentation | SHA256 |
|---|---|
| `README.md` | `539195124aa97bb92a8ab5425a739822f4b1792f89d3ff8b20ee1988e701ff61` |
| `presentations/README.md` | `92355565073243c8bb5caa03bcaf1c334902adda427a6fb96758573f286baf80` |
| `docs/IMPLEMENTATION-STATUS.md` | `689f4dbdd1c1e2649c747dac9660eaae388a1f1f86cbefce6c99048200cb86e6` |
| `docs/work/U22-architecture-teaching.md` | `9281632d00b3da0bb917d25818bc5dc58ee99c9fc2d29a3767b3106e9e8201c9` |
| `docs/REQUIREMENTS.md` | `8ebf967cb55904adff05c858b3b7a0c2bf58e738d9eaa303eea73c413e464bbb` |
| `docs/DECISIONS.md` | `446d7e04f6b04c449ed1ca91559c65846ffc3b53833642d58a1369f3ca87fd04` |
| `docs/ACTION-LOG.md` | `903d787153349f401774c84fb37fddd5da965f174979c8cd16fea5aa4dd38c6b` |

| Final illustration asset | SHA256 |
|---|---|
| `presentations/assets/u22/architecture.png` | `ca4524476ddd24a6b354bda5595bf00915fbcc01fd0da322a57488282811c854` |
| `presentations/assets/u22/map.png` | `a0e04569e30aedffecf8b2a90832765d7683d6447e18d7f2519f53c1d7ddaecc` |
| `presentations/assets/u22/routing.png` | `661ed3fb3bfda0fa1ec3b59bca63be944558524b6200183fee816e873b437676` |
| `presentations/assets/u22/storage.png` | `d2f753bda00cdd4c08814a69693e76598c66fdf13a4d235c271714e92e77ddaf` |
| `presentations/assets/u22/validation.png` | `6df7e3f84b39690ef01376bf20b6c60123d75d420d39b2ccbafd2bd85fc02f63` |

No blocking finding remains within the independently reviewed deck/content/builder/package-retention and documentation scope. This approval concerns the teaching artifact and documented evidence, not application readiness, live provider operation or timed classroom compliance. The lead must still verify the actual branch/remote, exact staged paths and normal push outcome. A subsequent action-log-only addition may record factual commit/remote/push results without invalidating this scoped review; any material content, source, asset or readiness change requires relevant re-review. The review file itself is the review record, not an independently reviewed implementation artifact.
