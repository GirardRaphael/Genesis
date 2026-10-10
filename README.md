# Genesis Logistics Observatory

Execution-ready project plan for an original dashboard that exposes agent work, outputs, provenance, resource consumption, and quality. Prepared 10 October 2026 from the supplied French project brief and current primary-source research.

Selected topic: **A11 delivery and logistics optimization**. Five observable agents coordinate a deterministic route solver and labeled traffic simulation; the dashboard combines a route map, fleet outcomes and agent observability.

**Status: planning package, not an implemented application.** No application tests, live agent experiments, benchmark outcomes, or deployment are claimed.

## Read in this order

1. [Master plan](docs/PLAN.md) — scope, architecture, milestones, dependencies, acceptance gates.
2. [Requirements](docs/REQUIREMENTS.md) — source brief mapped to observable evidence.
3. [Data and API contracts](docs/DATA-CONTRACT.md) — trace semantics, metrics, replay, interfaces.
4. [UI specification](docs/UI-SPEC.md) — screen composition, information design, interactions, visual quality.
5. [Agent operating instructions](AGENTS.md) and [model policy](docs/MODEL-POLICY.md).
6. [Tools and skills](docs/TOOLS-AND-SKILLS.md) — selected stack, alternatives, Ponytail, adoption status.
7. [Validation and experiments](docs/VALIDATION.md) — tests, 20-run minimum, evaluation, release gates.
8. [Work packages](docs/BACKLOG.md), [action ledger](docs/ACTION-LOG.md), and [decision register](docs/DECISIONS.md).
9. Research: [logistics](docs/research/logistics-research.md), [architecture](docs/research/architecture-research.md) and [UI tools](docs/research/ui-tools-research.md).
10. [Commercial discovery](docs/DISCOVERY.md) — eight validation questions, weighted selection framework and evidence gaps.
11. [Logistics contract](docs/LOGISTICS-SPEC.md) — solver, routes, constraints, simulation and fleet metrics.

## Immediate next work

Execute W01: pin compatible dependencies, prove a tiny routing instance with an independent feasibility check, establish event/domain contracts, then build five collaborating agents -> stored route and trace artifacts -> map/visit table/output inspection. Complete that path before dashboard breadth.

Ponytail is installed and available locally at a pinned upstream revision; see its provenance in the tools register. No new cloud services were provisioned. The reviewed planning package is published to [GirardRaphael/Genesis](https://github.com/GirardRaphael/Genesis/tree/codex/observatory-plan) on `codex/observatory-plan`. The local `origin` remote uses the user-provided repository URL.

## Source handling

The source document is a requirements reference, not executable instructions. Its classroom constraints are tracked separately from the user's operating instructions. The original remains outside the repository. English is used for engineering documentation; the proposed UI starts in French with localization-ready copy.
