# Address previews and recurring-route memory (U12)

User scope accepted 2026-10-10: enter different Montréal addresses and multiple deliveries, inspect the road route before dispatch, recognize repeated routes, and give agents concise prior-route context to avoid unnecessary model calls. This extends the local dispatcher; it does not add GPS, traffic learning, truck navigation or company tenancy.

## Design and trust boundaries

Address selection and road geometry remain provider operations. A route preview must work without assigning a van, reserving fleet capacity or invoking an LLM. The optional demonstration itinerary must never automatically replace operator-entered addresses or silently set the depot. Its explicit button replaces the draft only; the operator still chooses the depot.

Historical trips are immutable evidence. Loading a habitual route creates an editable draft or a new trip with new identity, current road evidence and current admission checks. It does not restart an old execution or copy its completion events. Directions matter: A → B and B → A are different work. Stop order, paired pickup/drop-off identity, parcel load and service/deadline assumptions determine whether comparisons are meaningful.

The route library derives its history from durable dispatch records. Only fully completed trips contribute successful elapsed-time and efficiency samples. Ready, running and cancelled records remain visible as history but cannot masquerade as successful work. Repeated use is a frequency observation, not proof of a daily schedule or better traffic prediction.

All current execution timings are **simulated**. Kilometer totals come from static road evidence; elapsed simulation time includes modeled service. Neither the mean/p50 nor deliveries per hour is a measured driver/GPS KPI. A fastest observed simulated variant is historical context, not a guarantee that it is today's best route. Real efficiency learning requires authenticated driver events and representative completed customer work.

Broker elapsed time also includes approach from the vehicle's current position. Origins can vary between otherwise identical workloads, so historical means do not isolate the effect of stop order or traffic. The UI and model aggregate guidance disclose this confounding factor; “lowest observed” is descriptive, not a causal efficiency result.

## Model-call policy

The broker API retains `explanation_policy: always` as its backward-compatible default: five role explanations in live mode. The operator interface initially selects the explicitly labeled `routine` policy to meet the user's request for reduced unnecessary spend.

Both policies execute the deterministic fleet snapshot, current road matrix, bounded solver comparison, independent certificate and atomic dispatch admission. Under `routine`, planning and traffic use tool evidence without model explanations. A matching successful route can omit the other three explanations only after its ordering/allocation has been rebuilt and independently validated against today's problem and matches the current selected candidate. A miss or changed selection uses the three remaining live explanation roles. Historical constraints or cost estimates never override the current solver/certificate.

Skipped explanations have explicit non-provider usage reasons. They do not create model attempts, spend reservations, invented zero-token provider responses or cached-token counts. The UI may report omitted roles and actual recorded usage. It must not invent dollars or tokens saved against an unexecuted counterfactual. Default synthetic course workflows and historical five-call benchmark evidence retain their existing semantics.

Model evidence contains bounded aggregate metrics and artifact/source references. Library samples describe trips; broker samples describe completed full missions, with elapsed time as fleet makespan and distance as fleet total. Mission completion cadence is distinct from vehicle/driver labor productivity. Raw addresses, coordinates, customer details and full trip histories stay outside the model prompt. This is ordinary local route memory, not an embedding database or an unbounded retrieval agent.

Dispatch admission can still fail if current geometry or the fleet changes after the selection check. In that case the final outcome is a diagnostic with the refusal reason, never a ready route. Actual omissions are retained; the system does not claim that replacement explanations were executed or that a trip was admitted.

## Research decisions

- [OSRM route/table documentation](https://project-osrm.org/docs/v26.5.0/http) defines ordered road geometry and directed duration/distance matrices. Reusing an old stop order still requires current road evidence and independent checks.
- [Photon documentation](https://github.com/komoot/photon/blob/master/README.md) supports bounded address lookup but warns that its public demo may throttle or become unavailable. Use explicit searches and bounded caching; owned services remain a customer-release gate.
- [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) requires matching eligible prefixes and has minimum lengths/short TTLs. It is not durable daily-route knowledge. Adding padded prompts or claiming cache savings without observed cache usage would defeat this requirement; no such change is made here.

## Verification scope

Acceptance requires different address pairs and multiple deliveries to produce different previews, no preview fleet/billing mutation, exact directional history recognition, successful-only comparable metrics, immutable originals, fresh checks on reuse, routine hit/miss provenance, redaction, current-constraint rejection and replay protection. Browser verification uses a separate disposable test database so it cannot consume operator vans or leave test cargo in the working fleet. Public-provider checks are separately labeled; no mocked geometry is claimed as a real street route.

Execution evidence and any deviations from this design are recorded in ACTION-LOG and the independent U12 review after verification. The commercial blockers in TRANSPORT-CHECKLIST remain open.

The portable `experiments/route-memory-road-smoke.json` records a separate real-provider check: a current OSRM broker fixture tour was simulated to completion, then an Anthropic-enabled routine request with the same workload was rebuilt on fresh road/fleet evidence. It admitted and completed a new simulated tour with all five explanations explicitly omitted and no model attempts. Its US$0.000001 request budget prevented an unexpected paid fallback. This demonstrates the real application omission path, not an executed Anthropic response, measured token savings or GPS performance.
