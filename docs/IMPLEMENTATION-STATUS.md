# Implementation evidence and remaining gates

User authorized implementation on 2026-10-10. This file tracks actual evidence rather than rewriting the original plan as completed. Detailed actions belong in ACTION-LOG.md.

## Current delivery profile

Local React/TypeScript dashboard and Python solver/API/worker, SQLite offline profile, configurable PostgreSQL. Five-role LangGraph fixture workflow is a deterministic replayable execution, not a live AI experiment. Actual models require locally configured API credentials, available model IDs, price records and an explicitly approved spending cap.

Docker CLI is installed but the Docker Linux daemon was unavailable at initial verification, including after a hidden Docker Desktop launch. SQLite is the runnable local demonstration profile allowed by the source brief. PostgreSQL remains the planned operational profile; do not claim its runtime behavior validated until corresponding integration tests run against it.

No API key, DATABASE_URL or Langfuse credentials were present initially. User supplied an OpenAI key locally; authentication/model availability succeeded, but generation returned rate-limit errors. User switched to Anthropic and removed OpenAI credentials. Anthropic authentication/model availability succeeded, and all 20 live runs completed with 100 model calls. No real customer/driver data is used.

## Evidence register

Published initial release: 59 Python tests, 12 frontend tests and seven local browser journeys covering residual/replay/failure/focus/mobile/analytics/dispatch passed; Python lint and production build passed. Full overview axe check found no violations; browser regression now includes contrast. Native one-line browser test entry handles Windows projected symlinks; canonical test cases remain in observatory.spec.ts. Corrected domain/hash/outage/budget/replay/filter/residual/failure-state findings are retained in implementation-review.md. Final independent rereview and publication are tracked in implementation-review.md and ACTION-LOG.md.

Twenty accepted live Anthropic runs across S01–S05, paired logistics policies and seeds 17/29 are exported in experiments/live-manifest.json, with exact stored IDs, input/manifest hashes and usage metadata. Total benchmark API estimate US$0.6696181; 100 model calls. Fixture workflows are separately exported and never counted as live. REPORT.md and sample-live-run.json derive from stored evidence. Prices expire 2026-10-17; provider calls must revalidate rates afterwards.

Delivered capabilities: solver/baseline/independent certificates; bounded depot-only S05 replan; local durable LangGraph worker/SQLite queue, event cursors/SSE, cancellation/leases; shared C$100 budget reservations and overrun freeze; Anthropic-only provider adapter with typed outputs; map/visit table, six observatory views, comparison, dual-clock replay, a filter-linked analytics page with donuts/bars/KPIs and outputs; overall cost plus agent/model/individual call metering. Models explain and exchange deterministic tool evidence; they do not autonomously alter hard constraints.

Remaining limits: PostgreSQL runtime, cloud Langfuse export, production identity/hosting, 100,000-run scale/memory profile, learned/real traffic, broad dynamic cargo reassignments, emissions factors, human-calibrated explanation quality, customer interviews and teacher approval are unverified or deferred. The tested local course-scale profile is the delivery; do not label it a production SaaS rollout or flawless system.

## Completion criteria

Do not mark R04 complete with fixture mode. Do not claim road-verified geometry for schematic generated paths. Do not call a solver candidate globally optimal. Maintain separate fleet cost/API spend, actual execution/simulation clocks, and full-plan/residual certificate scopes.

## Montréal operator extension

Keyless dispatch adds real street-map/address/routing sources, persistent multiple pickup/drop pairs and simulated vehicle motion. Municipal worksite permit data is timestamped and distinct from live speed/GPS. DISPATCH.md records verified API/provider behavior and company-release gates. Read projections now load only relevant metric events, preserving original sequence IDs; a local timing sample fell from about4.8s to0.4s for /metrics after eliminating repeated full artifact/event reads. This is a local observation, not a scale benchmark. Analytics and trip polling skip overlapping requests so slower responses cannot be discarded indefinitely.

## Broker and audit extension

Current verified broker source has 78 Python tests,13 frontend tests, Ruff and production build passing. The five-role actual Anthropic public-location pilot completed all roles with8,338 tokens and US$0.0335999 estimated API cost; portable evidence includes per-role outputs, tool names and handoffs. Synthetic benchmark evidence remains the original20-run cohort, not this one example.

The independent reviewer reproduced and drove fixes for output hash admission, wasted zero-fleet calls, matrix-to-geometry mismatch, service omission, cancellation/commit races, balanced objective scaling and cancelled cargo reuse. Known undelivered cargo now blocks vehicle reuse; return/unload/transfer recovery is an unimplemented operational gate. API malformed length/origin/stream-size defects were also reproduced and fixed. Company go/no-go and upgrade acceptance are in TRANSPORT-CHECKLIST.md. Final integrated browser results and publication are recorded in ACTION-LOG and broker-review, not assumed here.

Final scoped broker review approved in reviews/broker-review.md. Browser evidence: lead targeted8/8; independent repeat6/8 on exhausted persistent demo fleet. Test isolation remains an explicit P2 follow-up in the transport checklist. Approval applies to the local prototype only; P0 company gates are open.

## Entered-address and route-memory extension (U12)

The current integrated tree passes 100 Python tests, 21 web tests, Ruff and the production build; npm production audit reports no findings. Four new isolated browser journeys pass for both lead and independent verifier, including arbitrary address previews without fleet/spend writes, completed history/editing, selected-depot/error/mobile accessibility, and a repeat with zero model attempts. Older public-provider browser cases still depend on the operator profile; their earlier shared-fleet limitation is not erased by these dedicated checks.

Three actual Photon/OSRM project-API previews connect west/central/east public locations and multiple deliveries, with different real geometry and no model calls. A separate current-road broker tour was simulated to completion, then an Anthropic-enabled repeat admitted a freshly validated tour with five explicit explanation omissions and no provider attempts under a micro-USD fallback-blocking budget. Both tours were completed so the available test van was left free. Portable evidence is in address-preview-smoke.json and route-memory-road-smoke.json.

Independent review caught and closed reuse repositioning omission, sample depot replacement and silent vehicle-preference loss. Routine mode remains an explicit execution policy, with exact workload/policy/provider eligibility and current solver/certificate/admission checks; real performance learning, traffic/GPS and commercial launch remain outside this verified scope.

## Budget email extension (U13)

The final local budget-email candidate passes 148 Python tests, 39 web tests, Ruff and production build. Three isolated browser journeys pass for configuration/status/privacy/accessibility and mail-status independence from the global ledger. A real loopback SMTP capture received exactly one message; restarting did not resend or change the budget ledger. Portable results are in experiments/budget-email-verification.json.

The persistent shared budget triggers one durable alert, sent outside budget transactions by a separate worker thread. Effective stored/configured CAD cushions are now consistent across admission/status/alerts; malformed configuration cannot roll back known charges. SMTP ambiguity stays visibly uncertain with no automatic resend, and a late fenced completion cannot claim a durable sent result. Safe delivery diagnostics are visible in the cost panel.

External recipient/SMTP configuration is still pending. Fields were added to the ignored private .env without replacing existing values and that file was opened for operator entry. No external email, SMTP-provider login or model call was performed for U13. Terminal delivery states have no reset endpoint, and company-release gates remain open; BUDGET-EMAIL.md is the setup/operation contract.
