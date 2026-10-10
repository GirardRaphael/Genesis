# Commercial discovery and topic selection

Owner: lead/product researcher under W00. Status: hypotheses documented; interviews, market validation and teacher approval not yet completed. This record covers Annex B before product development. Technical compatibility experiments may proceed, but no statement of validated demand or approved academic topic is permitted without evidence.

## Eight validation questions

| Question | Current hypothesis / decision | Required evidence and validation method |
|---|---|---|
| Customer: who pays? | AI operations lead or engineering manager at a data company operating several agent workflows | Interview three qualified users; record role, purchasing involvement and workflow scale without personal identifiers |
| Problem: what costs time or money? | Investigating failed outputs and finding avoidable model/tool spend requires disconnected logs | Obtain a recent specific incident, actual investigation steps, time estimate and missing evidence; do not invent baseline savings |
| Decision: what does dashboard change? | Keep/change model policy, retry strategy or communication step based on accepted-output cost and failures | Have users identify a concrete decision using prototype evidence; document whether it changes their action |
| Data: lawful and reproducible? | Initial dataset is generated synthetic operational data and deliberately authorized public examples | Manifest records origin, license/permission, immutable hash, generation procedure and permitted external-model use; private company data excluded |
| Measure: what proves value? | Diagnosis time and cost per accepted output at a maintained quality threshold | Capture baseline task times and compare equivalent tasks; route-policy experiments follow VALIDATION.md; no causal savings claim from unpaired cohorts |
| Differentiation: why not report/chatbot? | Linked artifact versions, observable handoffs, replay and exact metric provenance may reduce investigation effort | Compare the same task against a static report and Langfuse's existing inspection flow; retain negative findings |
| Price: monthly, usage or project? | A one-off diagnostic pilot is the simplest initial commercial hypothesis; subscription is unvalidated | Ask buyer preference and actual budget process; record price quotes only if supplied, not fabricated market rates |
| Risk: errors, rules or data? | Misleading costs/quality, secret exposure, unreliable replay and overconfident recommendations | Data review, failure taxonomy, redaction tests, billing coverage and independent review; jurisdiction-specific review only if deployment/data scope requires it |

## Weighted topic-selection matrix

Score candidate topics from 1 (weak evidence) to 5 (strong evidence) only with a linked rationale. Unknown is `U`, not zero, and prevents a numeric ranking. Weighted score = sum(weight × score / 5), on a 0–100 scale. Record author, date and confidence for each score. Separate proposed judgment from user/interview evidence. Do not fill scores merely to justify the already preferred topic.

| Criterion | Weight | A1 cost optimizer | A2 service control | A8 content observatory |
|---|---:|---|---|---|
| Real frequent problem | 20% | U | U | U |
| Clearly identifiable customer | 15% | U | U | U |
| Measurable economic value | 20% | U | U | U |
| Accessible data | 15% | U | U | U |
| Visualization relevance | 15% | U | U | U |
| Feasibility within session | 15% | U | U | U |
| Total | 100% | Not ranked | Not ranked | Not ranked |

A1 is the current scope choice because it directly matches the user's requested agent-output observatory, not because an unperformed matrix proves commercial superiority. W00 completes evidence-backed scoring before committing to a commercially validated positioning. If demand is unproven, the project may proceed as an explicitly educational prototype with that limitation retained in the report.

## Discovery exit record

Before W01 product implementation, record all eight answers as evidence or explicit hypothesis, complete lawful-data manifest for the first fixture, classify the selected topic as provisional/validated, and record academic approval as pending/obtained with evidence. Before claiming commercial validation, complete interviews and the weighted comparison. Owner records outcome and any scope change in DECISIONS.md. Current state: eight questions captured as hypotheses, weighted framework ready, selection provisional; no interviews, scores or approvals invented.
