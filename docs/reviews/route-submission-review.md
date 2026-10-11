# U16 selected-address submission review

Date: 2026-10-11. Independent reviewer: Codex delegated route-validation agent, configured as `gpt-6-astra`, high reasoning, separate context (`fork_turns=none`), confirmed from the lead's actual spawn arguments. The reviewer did not implement the fix. Sole edit ownership: this review record.

Scope: U16, U09/U10/U12 and R14; shared address selection, strict request schemas, preview/manual/broker serialization, realistic geocoder fixtures and regression evidence. Dependencies inspected: `Place`, `Delivery`, `PreviewRequest`, `TripRequest`, `BrokerRequest`, all three `PlaceSearch` callers, route-library draft copies, fixture storage and broker runtime. Excluded: paid providers, operator database writes, browser automation and unrelated UI/architecture changes. Applied the reviewed Ponytail skill.

Verdict: the recorded source/test/documentation changes are approved for the focused submission repair, with no blocking findings. This is not browser-interaction acceptance or commercial-readiness approval.

## Findings and verification

- Before the fix, the real geocoder emits an `id` at `services/genesis/dispatch.py:213`; the shared picker forwarded that whole result. The strict `Place` schema correctly rejects unknown fields. Independent pure-schema reproduction yielded `extra_forbidden` for pickup/drop-off IDs in all three request types, plus depot ID in broker requests; the projected place was accepted.
- The fix at `apps/web/src/Dispatch.tsx:1068` explicitly retains `label` and `coordinates`. Pickup, drop-off and depot all use this picker, so the root boundary is corrected once. Preview/manual delivery projections continue removing broker-only fields; broker retains allowed deadlines and rates. Example drafts and validated historical places do not require additional normalization. No server validation, route feasibility or billing boundary is weakened.
- QA `search()` adds stable IDs to returned search results while leaving direct API seed places clean. Browser assertions verify the fixture contains IDs and submitted nested places contain exactly the two allowed fields. Coverage includes multiple-delivery preview, manual creation and broker submission. Browser tests were inspected but not executed.
- `tests/test_geocoded_routes.py` exercises the actual geocoder response transformation, verifies old payload rejection without stored trips/runs, then tests projected multiple-delivery preview, manual creation/start and five-role fixture broker execution with a valid independent certificate, committed trips, no model attempts and completed simulations. It uses the existing temporary SQLite fixture and synthetic road/matrix stand-ins. This API test does not execute the React click handler; the pending browser regression supplies that separate check.
- Independently executed `.venv/Scripts/python.exe -m pytest tests/test_geocoded_routes.py tests/test_dispatch.py tests/test_route_memory.py tests/test_broker_runtime.py -q`: all 39 tests passed, exit 0. Three existing SWIG deprecation warnings remain. Final `git diff --check` passed, with non-failing CRLF normalization notices for README.md, DECISIONS.md and DISPATCH.md.
- Lead-reported checks, not rerun by this reviewer: 60 frontend tests passed, TypeScript/Vite build passed, Ruff passed, and browser discovery parsed five tests without launching a browser. Existing bundle-size warnings remain. Lead also reported a running-service preview through the web proxy using three public Montréal geocoder results with IDs: HTTP 200, four stops, 727 geometry points, 14.72 km, no fleet reservation or model calls.
- Documentation review completed after requesting the repository-required README and architecture-decision updates. README records old-draft reload/reselection, D34 explains the shared boundary and retained strict validation, DISPATCH states the selected-place contract, and U16/implementation status/A089 distinguish executed API evidence from pending browser acceptance. The lead additionally reported that the running Vite module contains the corrected projection. No implementation changes followed the test run.

## Recorded implementation tree

Base commit: `8e23032912c7a81590d1c1834240779b3c21b42f`. SHA-256 hashes identify the reviewed working-tree files; subsequent material changes require relevant re-review.

| File | SHA-256 |
|---|---|
| `apps/web/src/Dispatch.tsx` | `7622453D48003CF67C0EF8BC686ED0B0EE2C1A07D3FB86DAF0827C94C8B98BF5` |
| `qa/route_memory_server.py` | `DACF8CA80109F2CA54B6F8E5E1E27B3676B350834F0E6759ED3787F29529D339` |
| `qa/tests/routes.browser.spec.ts` | `2BD9F4A789FFA14FDA85801E9D9DD46C289BC866D19E14D41A6D4A1FD8FA56E4` |
| `tests/test_geocoded_routes.py` | `843300B03F20892F8F738CDDC2E98E340AE1D430377741B7331BA359337CFAFC` |
| `README.md` | `C953405EC4AA5DF2407AD06194E24D7315249C344D298A0E55130F4DDDC937AA` |
| `docs/DECISIONS.md` | `8658F4CFA472EC08090866838DEAE6439F775A2446D8AE53C6121BF47E5251E3` |
| `docs/DISPATCH.md` | `94F1C21057B6731931E1144CBFD9277DCE37182A6397A862ADC4638A42F039A4` |
| `docs/IMPLEMENTATION-STATUS.md` | `AEDDF728544E5D97F1FCD90C20AC3F8C7A1129018686A90AB300F1DA57340D6F` |
| `docs/ACTION-LOG.md` | `49DBF364B7F33849EE4ACA7E4AA27002958FB8790B1063970D6C7081209DBDB3` |
| `docs/work/U16-route-submission.md` | `BA99660315977786A892C8FA83136A345660377B2527DDDB15F8A25766668422` |

## Limits and next check

The current MCP browser surface is blocked by its error-tab URL policy. This reviewer made no browser attempt and used no alternate surface. Run the prepared browser regression when authorized browser access works before claiming complete UI interaction coverage. Existing hot-reloaded drafts can still hold old metadata; reload or reselect addresses before retrying. The generic API validation message remains unchanged.

Read-only audit command failures were a guessed nonexistent U12 work filename and an unsupported Windows glob; targeted reads resolved both. No credentials were printed, no operator records changed, and no paid calls were made by this reviewer.
