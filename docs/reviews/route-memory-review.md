# Independent U12 route-memory review

Status: **approved for the explicitly scoped local prototype; not approved for commercial dispatch**. Date: 2026-10-10. Reviewed content SHA256: `a6a55eed46d4b92624eec265d4ffa3a84356f312eaa6829010054ddf8ea6ab63` over 34 normalized-LF source, contract, test and evidence files listed in [route-memory-manifest.json](route-memory-manifest.json). Reviewer: independent Codex verifier task, separate from implementation owners. No paid model calls, operator database mutations, commit or push were performed by this reviewer.

## Task record

- Scope: U12 arbitrary-address/multiple-delivery previews, recurring-route history and bounded model context; U07 truthful usage; U09/U10 dispatch and independent admission; R18 privacy. Dependency documents read: AGENTS, Ponytail, README, PLAN, REQUIREMENTS, DATA-CONTRACT, LOGISTICS-SPEC, MODEL-POLICY, DISPATCH, ROUTE-MEMORY and the prior broker/transport reviews.
- Owned files: this review and its content manifest, additionally authorized by the lead at freeze. Implementation owners own source/tests; lead owns contracts, ACTION-LOG and publication.
- Acceptance: preview cannot reserve fleet or bill models; address/direction/load/service/deadline identities remain comparable; only complete successful broker missions qualify for omission; current matrix, solver, independent certificate and atomic admission remain authoritative; provider changes and missing evidence cannot yield unsafe reuse; cancellation/recovery/idempotency preserve fleet and billing; UI distinguishes simulations, omitted explanations and final admission failure; replay hides future outcomes.
- Exclusions: production tenancy, customer privacy operations, GPS/proof of delivery, current traffic, cargo recovery, owned provider infrastructure and commercial route-quality validation. The existing company release gates remain open.

## Reproduced findings and corrections

1. **P2 — reused manual route omitted travel from the van's known position.** A disposable SQLite fixture completed pickup `[-73.554,45.502]` to drop `[-73.581,45.524]`. Fleet state correctly reported the drop as the known current origin, but the new reuse endpoint returned HTTP 201 with the route starting at the pickup, 120 seconds total and stop ETAs `[0,120]`. The author changed reuse to prepend every frozen vehicle origin and include all approach legs in timing/deadline checks. New tests assert a 240-second route with ETAs `[120,240]`, rejection of a now-missed three-minute deadline, and the explicit unknown-origin fallback. Independent rerun of the 14 route-history tests passed after the change.
2. **P2 — example loading silently replaced the depot.** The optional example button unconditionally set the depot to Gare Centrale, including when the operator had already selected another depot. This contradicted the U12 contract and could change assumed origins. The author removed this assignment; source inspection confirms the depot now changes only through its own address selector. The independent final browser run verified that loading the example preserves a previously chosen depot.
3. **P2 — fleet polling erased eligibility preferences and prevented repeat recognition.** The lead's fourth isolated browser journey created and completed a broker trip, then repeated the mission. Polling had permanently removed its temporarily busy van from the selected cohort, so the next request correctly failed the exact-policy history match and attempted the miss-path explanations. The test's raising adapter blocked paid calls. The correction preserves the operator's eligibility selection across temporary availability changes and separately requires at least one selected available vehicle before submission. Independent preference tests and the final four-journey browser rerun passed; the recurring mission produced no provider attempts.

## Independent evidence obtained

- Targeted Python suite: `python -m pytest tests/test_route_memory.py tests/test_broker_runtime.py -q` passed 28 cases before the additional origin regressions. The only warnings were existing SWIG deprecations. The post-correction route-history suite passed 14 cases.
- Disposable end-to-end history check used the actual durable `route_context`, a completed first broker mission, and a second live/routine request with a model adapter that raises if constructed. The second request succeeded with `outcome=reused`, `admission_outcome=created`, a changed current input hash from the moved vehicle origin, and five explicit non-provider omission reasons. No adapter was constructed and no paid call occurred. Road providers were deterministic stand-ins, not public-road validation.
- Reviewed the 500-trip scan cap, exact whole-mission `created_trip_ids` membership, successful owner/final-plan/certificate binding, semantic directional delivery mapping, exact constraint policy, missing source exclusion from reuse candidates, top-three candidate ranking, current provider match, current-road reconstruction, current independent validation and selected-order equivalence.
- Reviewed explicit late-admission diagnostics: rejection changes the final memory outcome while retaining `selection_outcome`, reports `admission_reason`, creates no ready trips and finalizes an `accepted_diagnostic`. The parameterized stub test exercises the zero-explanation hit followed by changed-road rejection.
- Reviewed aggregate-only model history context, explicit omission events/null provider usage, prior provider-intent recovery guard, immutable route-loading behavior, preview abort/invalidation, safe DOM text construction, map visibility/focus selection and terminal-only replay memory exposure.
- Independent final `npx.cmd playwright test --config playwright.routes.config.ts`: **4/4 passed in 34.3 seconds** on a new disposable SQLite fleet. The journeys cover different entered addresses/multiple previews with unchanged fleet and billing, immutable history loaded into an editable draft, provider failure/depot preservation/mobile Axe and overflow, and actual API/worker history reuse with all five omissions and zero provider attempts. A raising adapter prevents accidental paid generation; synthetic geocoder/road responses are not public-road validation. Inspected the populated preview and successful recurring-mission screenshots.
- Independent web checks: initial map/outcome/replay subset **11/11 passed**, then final map/preference tests **7/7 passed** and the admission-outcome test **1/1 passed** after the eligibility correction. The added mission-unit/redaction Python test passed independently.
- Lead's integrated evidence, recorded in ACTION-LOG: **100 Python tests, 21 web tests, Ruff, production build and production dependency audit passed**. The build retains its existing large-bundle warning; SWIG warnings remain. The old persistent-fleet browser suite was not independently rerun and retains its documented isolation limitation.
- Inspected the lead's public-provider preview manifest and asserted the recurring-road smoke manifest's consistency: repeat run `33613506-211c-4173-b4b4-f261701e949c` has a changed current input hash matching its valid certificate, five null provider-usage rows, no attempts, successful admission and one completed simulated trip. This is portable local/API evidence reported by the lead; this reviewer did not make those public-provider requests. It establishes no real driver efficiency or measured model-dollar savings.

Historical elapsed time includes approach travel from the van's current origin and service. Origins can differ within an otherwise equal workload/policy cohort, so the lowest observed mean does not isolate the causal effect of stop ordering. The visible library caveat makes this limitation explicit. Current-origin reconstruction and fresh validation keep that historical aggregation from becoming permission to execute an infeasible route.

## Frozen-content verification

The manifest covers the changed and nonignored untracked files relative to `06b0919`, excluding `docs/reviews/*`, `docs/ACTION-LOG.md` and `docs/IMPLEMENTATION-STATUS.md`. The latter exclusions are review/publication metadata; they cannot authorize an unreviewed source change. Each UTF-8 file is normalized by replacing CRLF and CR with LF. Its lowercase SHA256 is combined with its sorted repository-relative path as `path + NUL + hash + LF`; SHA256 of the concatenated UTF-8 records is the content fingerprint above.

Reproduce the checked contents from the repository root with Python:

```python
from pathlib import Path
import hashlib, json, subprocess

m = json.loads(Path("docs/reviews/route-memory-manifest.json").read_text())
paths = set(subprocess.check_output(
    ["git", "diff", "--name-only", m["reviewed_base"]], text=True).splitlines())
paths |= set(subprocess.check_output(
    ["git", "ls-files", "--others", "--exclude-standard"], text=True).splitlines())
paths = sorted(p for p in paths if not p.startswith("docs/reviews/")
               and p not in {"docs/ACTION-LOG.md", "docs/IMPLEMENTATION-STATUS.md"})
assert paths == [e["path"] for e in m["files"]]
records = []
for entry in m["files"]:
    value = Path(entry["path"]).read_bytes().decode("utf-8")
    value = value.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")
    digest = hashlib.sha256(value).hexdigest()
    assert digest == entry["sha256_lf"], entry["path"]
    records.append(entry["path"] + "\0" + digest + "\n")
assert hashlib.sha256("".join(records).encode()).hexdigest() == m["content_sha256"]
```

No unresolved blocking finding remains in this reviewed local scope. A material change to a manifested file invalidates the affected approval and requires a recheck. The final interpretation guidance and visible origin caveat were inspected after the browser run; the affected Python regression was independently rerun and passed. No additional paid explanation evaluation, production database/load test, real-driver efficiency study or complete legacy browser rerun was performed. Those limits, the existing bundle warning and the company gates remain explicit.
