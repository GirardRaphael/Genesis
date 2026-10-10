# Action ledger

Date basis: America/Toronto, 2026-10-10. Records summarize actual actions; future work belongs in BACKLOG.md. No application code or live project-model calls have been executed.

| ID | Actor / model | Action and evidence | Result and limits |
|---|---|---|---|
| A001 | Lead, session model inherited | Inspected workspace, git status, remote and log | Empty initialized repository; no commits or remote. No existing application to audit |
| A002 | Lead | Read documents skill; extracted paragraphs/table text using .NET ZipFile/XML from supplied DOCX; calculated SHA256 | Requirements captured; original unchanged; no visual/page-layout claims |
| A003 | Lead | Read plugin-management skill; searched Ponytail plugin catalog; web-searched exact name and official repository | Catalog returned none; maintainer repository identified |
| A004 | Lead | Read OpenAI Docs skill; opened official model-selection and evaluation guides | Model policy separates session models from future API availability |
| A005 | Architecture research agent, inherited model | Primary-source research on LangGraph, OTel, Langfuse, PostgreSQL and SSE | Authored research/architecture-research.md; no app changes |
| A006 | UI research agent, inherited model | Primary-source research on React Flow, ECharts, TanStack, Storybook, Playwright, W3C and Ponytail | Authored research/ui-tools-research.md; no browser implementation testing |
| A007 | Lead | Read skill-installer; fetched Ponytail source at 9b58c1ffb790c075ca32e70a89cf1d80588f4abf; ran install-skill-from-github.py with pinned ref | Tool confirmed local installation; no hooks/root instruction overwrite; available next turn |
| A008 | Lead | Searched external frontend-design and Playwright skills; attempted official GitHub folder opens | Folder fetches failed; candidates are not claimed installed or verified |
| A009 | Lead | Authored README, AGENTS, master plan, requirements, contracts, UI spec, model policy, tools, validation, backlog and decision register with apply_patch | Planning specification only; implementation checks scheduled, not fabricated |
| A010 | Template agent, gpt-6-luna low | Created TASK.md and REVIEW.md reusable templates | Bounded lower-tier work; no executable code; concurrent files absent when agent checked, later created by lead |
| A011 | Lead | One-off Python local Markdown link and requirement-ID assertions | 16 Markdown files checked initially; zero broken local links; R01–R19/U01–U05 present; installed Ponytail file exists |
| A012 | Lead | Created codex/observatory-plan branch; staged named planning paths; ran git diff --cached --check and --stat | Initial staged whitespace check found one trailing blank line in UI research; author corrected it; no GitHub remote |
| A013 | Research agents, inherited models | Reconciled research roles, tools, policy/scenario matrix, API page limit and installation status with canonical specs | Only owned research files edited; historical research status retained |
| A014 | Lead | Listed installed Ponytail directory, hashed SKILL.md, fetched pinned LICENSE | One instruction file; SHA256 and MIT provenance in tools register; no plugin hooks installed |
| A015 | Independent verifier, gpt-6-astra high | Assigned complete planning review with no implementation ownership | Review evidence and findings to be recorded in docs/reviews/planning-review.md |
| A016 | Lead, responding to independent findings | Added DISCOVERY.md covering Annex B questions/matrix; added atomic cost reservations, reconciliation and concurrent-budget tests to contracts/work packages | Two review findings corrected; verifier recheck required before approval |
| A017 | Lead, responding to independent finding | Replaced ambiguous conserved multi-stage handoff Sankey with two-column sender/receiver message-count contract and fan-out/repair fixture | Message count semantics are explicit without false conservation claim; verifier recheck pending |
| A018 | Lead + architecture researcher | Aligned research Sankey and decision register; corrected live-run gate to require both pricing and budget | No implementation changes; final independent planning review underway |
| A019 | Lead | Repeated local-link assertions on 18 Markdown files and limited private-key/API-key pattern check | Zero broken local links and zero pattern hits; limited scan, not full Gitleaks audit |
| A020 | Lead | Requested PLAN.md opening in Codex; reviewed staged file inventory and repeated whitespace check after corrections | UI open request queued; staged check passed; only planning files and .gitignore staged |
| A021 | Independent verifier, gpt-6-astra high | Rechecked F01–F05 and finalized docs/reviews/planning-review.md | Planning package approved; zero remaining review blockers; 20 local link targets valid; Ponytail hash and monetary fixture independently verified; no app/runtime test claims |

## Verification and publishing records

Records below are appended after execution. Application tests remain unrun because no application is implemented. No new external accounts, paid API experiments or deployments occurred.
