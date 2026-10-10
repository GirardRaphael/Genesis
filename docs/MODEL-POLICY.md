# Model routing and independent verification

## Development agents

Model IDs below are available choices reported by this Codex session, not guaranteed public API IDs or price tiers. Resolve availability again before each future session. Provider runtime models are selected separately.

| Work | Default development model | Effort | Escalation |
|---|---|---|---|
| Bounded templates, extraction, formatting, inventory | `gpt-6-luna` | low/medium | Ambiguous source or changed contract -> workhorse |
| Normal implementation, tests and source research | `gpt-6.1-sol` | medium/high | Cross-cutting reliability/security issue -> frontier |
| Architecture, concurrency, money, trust boundaries | `gpt-6-astra` | high | Narrow the question and use experiments when uncertain |
| Independent final review | `gpt-6-astra` in separate context | high | Blocking findings return to author; review again after correction |

Do not use a strong model for deterministic arithmetic when a checked function suffices. Do not use a small model as sole approver of authentication, billing, recovery or releases. A separate context reduces anchoring; a different model is useful but not proof of independence or correctness. Record actual configuration, not the table's default if it differs.

Task handoff specifies objective, requirements, owned files, exact output shape, inputs, exclusions, acceptance checks, budget/call limits and stop conditions. Subagents must not edit another owner's files, approve their own work, or invent test results. Hand back evidence and unresolved findings, not just a completion claim.

## Application runtime routing

Configure logical tiers `economy`, `standard`, `verifier` with actual provider model IDs, support for typed outputs/tools, available context, price record and fallback policy. No live model is pinned by this plan. Account availability, prices and capability checks occur in M1. A fallback is logged with reason and evaluated separately; never silently rename it to the requested model.

Baseline policy uses a capable standard model for all four roles. Candidate policy uses economy for researcher extraction, standard for routine analysis/coordinator work, and a capable verifier for difficult contradictions. Escalate when evidence is contradictory, schema repair fails, or deterministic checks identify an unresolved mismatch; cap repair and escalation counts. Route from observable task criteria rather than a model's self-reported confidence.

Choose the least expensive policy meeting quality and reliability requirements on the same versioned scenarios. Compare paired inputs, overall pass rate, criterion-level failures, latency, all-in cost and missing-usage coverage. A nominally cheaper model that increases retries may cost more per accepted output. Start with capabilities/evaluation, then optimize cost; see [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection).

## Verifier rubric

Numerical correctness 35, evidence support 30, completeness 20, constraint compliance 15. Deterministic checks run before judging. A fabricated source, incorrect central calculation, leaked sensitive data or invalid schema is a hard failure regardless of weighted score. Proposed acceptance threshold >=85/100 with no hard failure; calibrate against human-labeled examples before using the score for routing decisions.

Verifier returns criterion results, concise evidence references, error categories, accept/revise/reject and required correction. Do not request detailed hidden reasoning. Unknown evidence yields insufficient-evidence, not a confident pass. Missing judge evaluation stays null and reduces evaluation coverage.

Blind the judge to price and policy label where feasible; randomize comparison order. Keep at least ten labeled calibration artifacts separate from the final experiment set, including plausible wrong answers. Human-review disagreements and a sample of passes. Record rubric/prompt/model versions and judge cost separately. The official [evaluation guide](https://developers.openai.com/api/docs/guides/evals) is reference material; this project can execute its own reproducible local evaluation harness and does not require a hosted evaluation product.
