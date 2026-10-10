# Initial executable interface

Implementation authorized 2026-10-10. This compact interface connects domain, worker/API and frontend owners. Canonical correctness rules remain in LOGISTICS-SPEC and DATA-CONTRACT. Actual live models need a locally configured key, selected model, pricing and approved budget. Fixture workflows must say deterministic fixture and report null model usage, never pretend to be live AI.

## Domain package boundary

`services/genesis/models.py`, `scenarios.py`, `solver.py`, `simulation.py`, `metrics.py`, `roads.py` belong to domain owner. Export `build_scenario(scenario_id: str, seed: int) -> Dataset`, `baseline_plan(dataset) -> Plan`, `optimize_plan(dataset, time_limit_s=2) -> Plan`, `validate_plan(dataset, plan) -> Certificate`, `simulate_plan(dataset, plan, scenario_id, seed, allow_replan=False) -> dict`. Domain models are Pydantic and JSON serializable. Dataset contains depot, stops, vehicles, directed distance/time matrices, scenario metadata and hashes. Plan contains routes/visits, unserved IDs, totals, objective, geometry and solver status. Certificate contains scope, valid flag, issues and input hashes. Domain owner publishes exact schema early to other owners.

## Runtime boundary

`db.py`, `workflow.py`, `worker.py`, `api.py`, `llm.py` belong to runtime owner. Lead owns root dependencies/config, scripts, infrastructure and integration docs. Runtime imports domain functions rather than duplicating solver logic. Durable queue/worker and LangGraph workflow create actual recorded tool/role events. Fixture mode supplies typed deterministic outputs and null token/cost values; live mode uses versioned prompts and a budget-gated provider adapter.

## Browser API

Base `/api/v1`. `GET /scenarios` -> `{items:[{id,label,description}]}`; `GET /runs` -> `{items:[RunSummary],total}` with scenario/status/policy/provenance filters, bounded pagination. `GET /runs/{id}` -> full bounded initial detail; event history paginated separately; `GET /runs/{id}/events` -> `{items,next_seq}`; stream endpoint SSE. `POST /runs` accepts `{scenario_id,policy,seed,mode:"fixture"|"live"}` and budget where live; returns 202 summary. Cancel endpoint. GET `/metrics` returns common filtered cohort, coverage/units. Unauthorized/invalid requests never silently use fixtures.

`RunSummary`: id, scenario_id, scenario_label, policy (`baseline_only`/`solver_with_one_replan`), seed, provenance (`fixture`/`live`), status, created_at, started_at, finished_at, duration_ms, metrics (distance_km, fleet_cost_cad, served, total, on_time, late_minutes, utilization), final_kind.

`RunDetail` adds dataset, baseline, candidate (nullable), selected_plan, certificate, simulation `{events,metrics}`, agents, handoffs and final_output. Agent record: id, role, name, status, model nullable, duration_ms, input_tokens/output_tokens/cost nullable, output structured JSON, tool_calls and timestamps. Events: event_id, run_seq, kind, occurred_at, invocation_id and typed payload. Handoffs identify sender/receiver agent IDs and summary.

Frontend reads real persisted data via API; no independent random dashboard numbers. Six required observatory views plus MapLibre route view, graph, outputs, linked filters, comparison and independent agent/simulation replay. Map fixture geometry is schematic and labeled. Empty/loading/error/disconnect/no-key states are truthful. Frontend owns apps/web only.

## Metering and analytics extension

Live dispatch accepts Anthropic only. Historical provider attempts remain immutable for inspection. `/runs/{id}/usage?as_of_seq=...` projects attempts at an event boundary; `/usage` provides filtered full-cohort totals and bounded individual rows; `/usage/overall` provides the unfiltered all-request ledger, known/held cost and the shared C$100 policy ceiling. Terminal recovery marks unresolved model attempts interrupted with null tokens/cost and retained reservations; it cannot manufacture provider usage.

The analytics page uses the same scenario/status/policy/agent/model filters as the API. Donut segments and keyboard-accessible table controls link back to those filters. Charts distinguish model API USD estimates, fleet CAD estimates and actual call latency. Cache categories are input subsets; fixture usage stays unavailable. Its descriptive scenario summaries do not imply paired causal improvements. The global ledger remains independent of analytics filters and is not included in historical replay.
