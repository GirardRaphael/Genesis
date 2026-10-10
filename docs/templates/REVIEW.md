# Independent review record

> The reviewer must be independent of the implementation. Replace every bracketed prompt. Record evidence and uncertainty; never claim a check that was not run.

## Review identity and scope

- **Review/work ID:** [ID]
- **Independent reviewer:** [Name/agent]
- **Reviewer model actually used:** [Exact known model identifier; include tier if policy requires]
- **Reviewed commit or tree:** [Commit SHA, or tree identifier and how identified]
- **Requirements/work packages reviewed:** [IDs]
- **Paths and scope reviewed:** [Exact paths and boundaries]

## Checks

### Run

| Check | Command/tool and scope | Result and evidence |
|---|---|---|
| [Check] | [Exact invocation or action] | [Pass/fail, observed output or evidence reference] |

### Not run

| Check | Why not run | Impact / follow-up |
|---|---|---|
| [Check] | [Reason] | [Limitation and owner/next step] |

## Findings

| ID | Severity (Blocker / High / Medium / Low / Note) | Path and location | Evidence | Required remediation or rationale |
|---|---|---|---|---|
| [Finding ID] | [Severity] | [Path:line or artifact reference] | [Specific observed behavior] | [Concrete fix, or `None`] |

- **Disposition:** [Approve / Approve with follow-up / Changes required / Unable to review]
- **Release blocking:** [Yes / No]
- **Blocking finding IDs:** [IDs, or `None`]
- **Rationale and conditions:** [Brief evidence-based explanation]
- **Review limitations / next action:** [Unreviewed areas, required rerun after changes, owner, or `None`]
