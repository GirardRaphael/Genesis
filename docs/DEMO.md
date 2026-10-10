# Ten to twelve minute demonstration

Use the local app at http://127.0.0.1:5173. Start with a finished S05 live run and its paired baseline. Keep the source manifest/report open for evidence. All deliveries and traffic are simulated even when the model calls are real.

| Time | Presenter contribution | Evidence and demonstration |
|---|---|---|
| 0:00–1:00 | Presenter 1 explains dispatch problem | One depot, 28 initial stops, four vans; service coverage/constraints before cost |
| 1:00–2:30 | Presenter 1 explains agents/tools | Five distinct roles; actual model messages and handoffs; OR-Tools and independent validator |
| 2:30–4:30 | Presenter 2 inspects route evidence | Map/visit linkage; initial certificate; S05 residual selector, one new depot-loaded order and suffix certificate |
| 4:30–6:00 | Presenter 2 explains resources | Overall cost across every request; this request/all requests toggle; agent/model rollups; individual call input/output/cache tokens, latency, reservation and estimated cost |
| 6:00–7:30 | Presenter 1 explains replay/charts | Early agent replay hides future output; separate delivery clock; graph, waterfall, handoff Sankey and tables |
| 7:30–9:00 | Presenter 2 compares scenarios | Paired baseline/solver; coverage beside distance/cost; S03 valid diagnostic versus mission success; S04 outage target caveat |
| 9:00–10:30 | Both explain recommendations | Read three evidence-backed recommendations from REPORT; real API costs differ from synthetic fleet rates; no audited emissions or commercial savings claims |
| 10:30–12:00 | Both answer/modify | Explain own code contribution; change a bounded fixture or filter; show invalid-capacity test, cancellation or recorded provider failure |

Preparation: `.venv/Scripts/python.exe -m pytest`; `npm --prefix apps/web test`; `npm --prefix apps/web run build`. Use `scripts/start.ps1 -SeedDemo` from a clean checkout for offline fixtures. Use recorded live traces if the provider is unavailable; replay does not create new calls. Do not open .env or expose credentials during presentation.

Implementation responsibilities: domain solver/simulation, runtime/persistence, frontend information design and independent review were delegated to separate development agents, with integration/corrections by the lead. Human presenters must assign their own contributions honestly, understand the code, and rehearse; no student participation or teacher approval is claimed by this document.
