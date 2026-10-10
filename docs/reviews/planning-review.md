# Independent planning review

**Current verdict: approved as a planning package after correction.** No open blocking planning findings remain. Independent rereview on 2026-10-10 covers substantive content in staged tree `bd704e3b7e08c894136ccf8a56c98a5b164df850`; final report and action-log closeout may change the tree without changing those specifications. This is not approval of an implemented application or completion of future discovery/experiment gates. No GitHub remote is configured.

## Assignment and scope

- Review/work ID: W00 independent review, 2026-10-10.
- Reviewer: independent verification agent; assigned model `gpt-6-astra`, high-capability tier. No production or canonical-plan authorship by this reviewer.
- Requirements: R01–R19 and U01–U05, especially source fidelity, numerical semantics, privacy, model routing, handoff and honest evidence.
- Owned path: `docs/reviews/planning-review.md` only. Lead owns action-ledger integration and all remediation.
- Dependencies: source DOCX, AGENTS.md, README and every Markdown file under docs, plus installed Ponytail skill. Read .gitignore and repository state for publication context.
- Acceptance: complete source mapping; no contradictory implementation contracts; executable acceptance criteria for consequential boundaries; valid local links; actual checks distinguished from planned tests.
- Exclusions: application implementation, runtime/vendor interoperability, live experiments, UI rendering, external-service provisioning, commits and pushes.

## Initial verdict

**Changes required.** F01–F03 are medium findings affecting mandatory behavior or implementation correctness and block approval of the execution-ready planning package. They do not establish a defect in application code, which does not exist yet. Findings start open and require independent rereview after author corrections.

| ID | Severity | Location in initial review | Evidence and required remediation | Disposition |
|---|---|---|---|---|
| F01 | Medium, blocking | PLAN.md:7; REQUIREMENTS.md:25; BACKLOG.md | Annex B requires eight commercial-validation questions and a weighted 1–5 topic-selection matrix before development. Three proposed interviews and a generic assumptions ledger do not assign or specify this deliverable. Add an owned discovery deliverable and gate covering customer, problem/cost, decision, legally reproducible data, value metric, differentiation, pricing hypothesis and risks, plus the six source weights. Label hypotheses and unknown scores honestly; do not fabricate interviews or market validation. | Open |
| F02 | Medium, blocking | PLAN.md:56; DATA-CONTRACT.md budget/state/API sections; BACKLOG.md W04 | Concurrent calls and retries have caps but no budget reservation/settlement semantics. Two calls can each observe enough remaining budget and jointly exceed it; uncertain external outcomes can release budget prematurely. Define atomic pre-dispatch reservations including bounded output and retries/evaluation, reconciliation and fail-closed admission for missing bounds/rates/unknown usage. Require concurrent-cap and crash-boundary tests and avoid promising an invoice ceiling the provider cannot guarantee. Also replace "if neither exists" with an unambiguous requirement that both pricing and an explicit budget exist. | Open |
| F03 | Medium, blocking | DATA-CONTRACT.md:60; PLAN.md:52; UI-SPEC.md Sankey | The Sankey promises one unit per observed handoff and intermediate flow conservation, but verifier fan-out sends one received draft to coordinator and analyst. Stage indexing eliminates cycles, not the resulting one-in/two-out mismatch. Define conserved task units with explicit split/join semantics, or use a clearly described message-count flow that does not claim conservation. Add fan-out and repair-cycle semantic fixtures. | Open |
| F04 | Medium, corrected during review | research/architecture-research.md four-agent demonstrator and verification plan | Initial note substituted planner/analyst/critic/writer for canonical coordinator/researcher/analyst/verifier and left the two-policy experiment design implicit. Author corrected roles and 5 × 2 × 2 real-run matrix; current text reread and matches canonical plan. | Resolved in working tree; stage exact reviewed content |
| F05 | Low, corrected during review | research/ui-tools-research.md performance and Ponytail status | Initial research used a 1,000-row fetched page against the contract's 200-row API maximum and lacked current installation status. Author aligned 200-row pages versus 1,000 loaded entries and added scoped provenance. | Resolved in working tree; stage exact reviewed content |

## Checks actually performed

| Check | Actual action | Result |
|---|---|---|
| Complete local document review | `rg --files` then `Get-Content -Raw` for AGENTS, README and all docs, including research and templates | Read plan, contracts, requirements, UI, model policy, validation, backlog, decisions, tools, action ledger and templates; compared source constraints and cross-document claims |
| Source content and identity | Read-only .NET ZipFile/XML extraction of every paragraph/table-cell paragraph in `word/document.xml`; `Get-FileHash -Algorithm SHA256` | Source hash matches requirements: `36ABCE11785407245313E1EFEE818D0ED99FA27508AD7C193ABDF5CE63301581`; four roles, two tools, 20/5, eight metrics, six charts, ten questions, report and presentation covered; Annex B gap recorded |
| Local links | PowerShell regex enumerated Markdown links, skipped external URLs/anchors and used `Test-Path` relative to each source document | 18 local link targets checked, zero broken at initial snapshot; anchor IDs and web links not validated |
| Monetary fixture | Independently calculated `(800×1 + 200×0.5 + 300×2)/1,000,000` | Stated 1,300 total tokens and $0.0015 estimate are consistent; this is a documentation calculation, not a runtime test |
| Skill presence | Read `C:/Users/xxrap/.codex/skills/ponytail/SKILL.md` | Installed file exists and is readable; no upstream hash comparison or hook execution by reviewer |
| Publication state | `git status --short`, `git remote -v`, `git ls-files --stage`, `git diff --cached --check` | No configured remote; initial staged whitespace check reported research/ui-tools-research.md:105 blank EOF. Working tree research corrections were not yet staged at this check; lead must stage and rerun before commit |

No application test, browser/UI review, statistical evaluation, API/model call, dependency compatibility test, secret-scanner execution, or live trace was performed. Source layout was not rendered; this review makes no page/layout claims. Existing researchers' web claims were reviewed for consistency but were not independently re-fetched. Paid experiments, classroom approval and GitHub destination remain external inputs.

## Reviewed initial working-file identities

SHA256 values below identify substantive files read after the research authors' first correction batch. This is a working-file manifest, not a claim that the index or a commit matched it. ACTION-LOG is expected to receive the lead's evidence update; material content changes elsewhere require rereview.

| File | SHA256 |
|---|---|
| AGENTS.md | `9468C164667B6C2662ED8BEBF26CC0147EF0E5904B314AEACF22B375DDE0AF8A` |
| README.md | `2824BA2410B28DDB1E0CEDE612E8FBE380F66A470DF3CA1A78EBAED278109252` |
| docs/PLAN.md | `8EE18C5922F512FC40F0FA5163B8EDE844B8D07E50E0DF198746F5114119607D` |
| docs/REQUIREMENTS.md | `1471A511E4B96FBBC0ADB7F4F8BF03269454254DA88C6FC6F3B00D33E7D11520` |
| docs/DATA-CONTRACT.md | `BDE52B9C59FB7297DC971459EF7E95D3099386E395B97BF8495E0D82FD1DB979` |
| docs/BACKLOG.md | `8ADC2123D1E30C1F03BC63539E17DBC7F008AAA349286D636E50ACF921E8E00B` |
| docs/VALIDATION.md | `B685AD094D9CCA2E4DA1CA15C535C66485A8E63A5F52631FF149253FACF8315D` |
| docs/UI-SPEC.md | `3EF1E75A38D854502423C0C0FF0F5B3F6064EBBC74442430AB7D4E779F995E80` |
| docs/MODEL-POLICY.md | `1E7F58A266270D23E77C90467404707DB1BE7F02D27F0AB692BCC21A4EBAA12F` |
| docs/TOOLS-AND-SKILLS.md | `DCB4D9E7AE37DA69305958A7CD79D87D27EBFB892FDC9D697FB1F14D83C73BC0` |
| docs/DECISIONS.md | `7D649173ABA049BDEC35108C9EADC7026744430A0F0D30158496ACD4206D7482` |
| docs/ACTION-LOG.md | `1841B8037EC0081EDE0647C1842C91FC74FD9F7906D203B9B8736BBAAC423DCE` |
| docs/research/architecture-research.md | `5CF5721E4974C52A47650BD0589AF3550EB93D39F1B5130DDF0D51DBCAE88E83` |
| docs/research/ui-tools-research.md | `BB88B33C70BDFAAB3F839488F197F30F7385A14FA7A3FBA65E4C11EC7E417440` |
| docs/templates/TASK.md | `E5F1A555F58FBF0EB5BA4B0F1A89A8C174B26CD6FFF2FD46C4DC10E93AE535C2` |
| docs/templates/REVIEW.md | `B62E39508854B6139DF9C0A3F8582B9395CDF21B79BCF5075E404C2C802CB525` |

## Handoff

The initial handoff required lead corrections and independent rereview. Those corrections and rereview are now complete below. Lead stages this final report, records action-log closeout, checks the complete staged diff and records actual commit/publishing outcome. No remote currently exists; do not claim a push.

## Final rereview and disposition

Read changed canonical sections, the new DISCOVERY.md in full, revised research and ADRs, and the author action-log entries. Executed `git diff --cached --check` after restaging: pass, no output. Executed `git write-tree`: `bd704e3b7e08c894136ccf8a56c98a5b164df850`. Rechecked 20 local Markdown file links with relative `Test-Path`: zero broken. Inspected the complete local file contents across the initial review and correction diff; no executable application code exists to test. This report itself is reviewer-authored evidence, not self-approval of application work.

| Finding | Final status | Independently reviewed correction |
|---|---|---|
| F01 | Resolved | DISCOVERY.md covers all eight questions, exact six weights and explicit unknown scores; W00 owns evidence/provisional status and pre-implementation fixture provenance. Interviews/scoring remain future evidence gates, not claimed results. R19, README, PLAN and D13 link the requirement. |
| F02 | Resolved | DATA-CONTRACT defines atomic conservative reservations, settlement once per attempt, held unknown usage, deny-on-missing-bounds, concurrent/retry/judge handling and overrun freeze. W04/VALIDATION assign corresponding tests; PLAN requires both pricing and budget; D11 records the decision. |
| F03 | Resolved | DATA-CONTRACT and UI-SPEC define separate sender/receiver nodes, one edge contribution per observed message and no intermediate conservation claim. Fan-out/repair fixtures are mandatory. Architecture research and D12 match. |
| F04 | Resolved | Canonical four roles, two tools and paired 5 × 2 × 2 live experiment matrix are aligned in the research note. |
| F05 | Resolved | UI research uses at most 200 rows per API page and up to 1,000 bounded loaded entries; installation state is attributed accurately. Restaged whitespace check passes. |

Independently checked installed Ponytail: one SKILL.md, 3,492 bytes, SHA256 `BA68FF26239C3C3B05B2A9A47EE0D9A6B93A69639A2555EC87A5D44BFFAF2F0C`, matching TOOLS-AND-SKILLS. Independently executed decimal fixture arithmetic in PowerShell: `0.0015`.

**Final disposition: approve planning package; release-blocking planning findings: none.** Approval is limited to the reviewed specification. Future implementation requires the documented contracts, tests, screenshots, live experiments and independent release review. Commercial validation, topic approval, paid-model configuration and GitHub destination remain explicitly pending. Lead may append truthful review/commit metadata; any material specification change requires a new review.

### Final changed-file SHA256 identities

Unlisted substantive files retain the initial identities above. The staged tree additionally captures `.gitignore` and all reviewed file versions.

| File | SHA256 |
|---|---|
| README.md | `FA5B35CAA2C1E5F6470AA86E2FD066660F6DDAA2C16ED701C1A75F63FDD7CCC2` |
| docs/PLAN.md | `4DE553CA8C8931503363D08406A720B7005C0F1E81887D623FC0C823FC17462A` |
| docs/REQUIREMENTS.md | `2A2F48FB70C97C9A5B391D178374471E3F185507F01F905B72EEC50E2E0D3D71` |
| docs/DATA-CONTRACT.md | `AE0805293BADEF13A39CB354C78E012CAAC9372BEDD8DCF9AD3BB3EBAEEB347C` |
| docs/BACKLOG.md | `9284ACF84918AB7D586AC282336AF8E0BCE4F55773C2535411CD0F96A8332C72` |
| docs/VALIDATION.md | `B3A0AB6D33525EE55CB67C37F2579579255EC206402D949F85252FBD1D3CE661` |
| docs/UI-SPEC.md | `C81CDE363F04B1309C3DC3139C9C4F324495CFA3AED29EF1AB90C4290D4263C4` |
| docs/DECISIONS.md | `818B6395DA257368DADFC68CE9D34B66BD82E89D4E25EDEBCC128A1B3BFD2E17` |
| docs/DISCOVERY.md | `42C438FA8F140E0396625FE2331B5C03EED617BF58BCD636760E276CB8C23A55` |
| docs/research/architecture-research.md | `516A4F553A18B14682B2B555AC167F6B9FFDF3821ED81CB6F123EF138C4837BC` |
| docs/ACTION-LOG.md before final closeout | `29ECED2E53F1445F1E206639D21FB09BECB49283D056530468D5512892974DC2` |
