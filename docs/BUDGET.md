# API execution budget

User authorized OpenAI API use with a maximum aggregate budget of **C$100** on 2026-10-10. This covers this project's application live-agent experiments, not unrelated ChatGPT account usage. No API key was configured at authorization time; no billable application calls had been executed at that point.

Subsequent execution: OpenAI generation was rate limited; rejected attempts remain in the event history. User then selected Anthropic and removed the OpenAI key. The **same aggregate C$100 ceiling** includes historical provider attempts and new Anthropic executions, all requests, retries and verifier calls; switching providers never resets spent or reserved funds. Twenty accepted Anthropic runs consumed US$0.6696181 in provider-usage-based estimates. OverallCost uses the persistent settlement ledger; model/agent/call views show categorized usage and coverage.

Anthropic defaults: Claude Haiku 5.5 for traffic/exception explanations, Sonnet 5.5 for planning/optimization, Opus 5.5 for monitoring. Standard first-party global pricing and cache categories are snapshotted in config/anthropic-prices.json from [official pricing](https://platform.claude.com/docs/en/about-claude/pricing). Cache writes use the conservative one-hour upper rate where duration is not supplied; cache reads and writes are input subsets and are not double-counted. No thinking content is stored.

The application reserves before each billable dispatch, includes retries/verifier calls, and keeps uncertain charges held. A persistent project-wide ceiling covers all runs, so concurrent individual run budgets cannot independently spend the same allowance. Default conservative spending policy: 2 CAD per USD, resulting in at most US$50 in reserved/settled API estimates. This is a precautionary conversion cushion, not a quoted FX rate. Provider invoicing, taxes and exchange may differ; use provider account limits as an independent backstop.

OpenAI execution and SDK dependency have been removed by user instruction. Its price snapshot is historical provenance only and cannot activate a run. New live requests require Anthropic configuration and a matching current Anthropic price record; stale or unknown billing configuration fails closed. Default per-run budget is US$1; the 20-run harness stops on any provider, schema or budget failure.

Bank of Canada latest daily observation retrieved during implementation: 2026-10-09 USD/CAD 1.4271 ([Valet series endpoint](https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1)). The 2.0 policy cushion remains deliberately separate from that historical observed rate. Runtime price snapshots expire 2026-10-17 and must be revalidated before further live calls after expiry.

The broker live integration pilot added five actual Anthropic calls and US$0.0335999 estimated spend within the same persistent project allowance. Its portable evidence is in experiments/broker-live-pilot.json. Neither a new workflow nor provider switch resets the global cap.
# U12 route-memory verification

Address previews and route-history computations do not invoke model providers. A completed actual-OSRM fixture tour and an Anthropic-enabled repeat tested the omission path in the operator database; the repeat used a US$0.000001 request allowance to prevent unexpected paid fallback, recorded no provider attempts/reservations/charges, and omitted all five model explanations. Both simulated tours completed and left the van free. This is evidence of avoided calls in that request, not a measured counterfactual dollar/token saving or an executed Anthropic response. The persistent C$100 global ceiling remains unchanged.

## U13 shared-budget email

The shared effective budget now drives a durable one-per-project email alert. Known plus held exposure, a globally rejected prospective reservation, or a persistent overrun freeze can trigger it; per-run-only denials cannot. Snapshot amounts distinguish estimated charges from holds and do not imply C$100 was spent when a larger prospective call was refused. SMTP settings are private and currently need operator configuration. Email delivery never releases reservations, unfreezes spending or resets the C$100 ceiling. See BUDGET-EMAIL.md for setup and terminal-delivery limits.

Reservation admission, status and alert snapshots now share the same maximum of stored/configured/minimum CAD cushions. This corrects a stored-cushion versus newly lowered CAD-cap inconsistency; malformed runtime settings still fail reservation admission closed while known settlements/freezes remain durable.
