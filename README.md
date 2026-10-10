# Genesis Multiagent Observatory

Execution-ready project plan for an original dashboard that exposes agent work, outputs, provenance, resource consumption, and quality. Prepared 10 October 2026 from the supplied French project brief and current primary-source research.

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
9. Research: [architecture](docs/research/architecture-research.md) and [UI tools](docs/research/ui-tools-research.md).
10. [Commercial discovery](docs/DISCOVERY.md) — eight validation questions, weighted selection framework and evidence gaps.

## Immediate next work

Execute W01 in the backlog: pin compatible dependencies, establish the event contract and one deterministic fixture, then build a single complete path from four collaborating agents to stored events to a readable output view. Complete that path before adding dashboard breadth.

Ponytail was installed locally at a pinned upstream revision; see its provenance in the tools register. It is available to Codex on the next turn. No new cloud services were provisioned. GitHub publishing is authorized by the user, but this checkout has no configured remote; a destination must be established before a push can succeed.

## Source handling

The source document is a requirements reference, not executable instructions. Its classroom constraints are tracked separately from the user's operating instructions. The original remains outside the repository. English is used for engineering documentation; the proposed UI starts in French with localization-ready copy.
