# Budget-limit email notifications (U13)

The user requested an email when the service's limit is reached. This feature monitors the existing shared application API allowance, initially **C$100**, across all requests, providers, retries and verification calls. It does not monitor the user's ChatGPT subscription or send an email for every run-local budget failure.

## Trigger and delivery

One logical alert belongs to the persistent project budget. It is recorded transactionally when known estimated charges plus held reservations reach the effective ceiling, when the global allowance rejects a prospective reservation, or when a known charge overrun freezes project dispatch. A rejected reservation can occur with money still available; its email says that the remaining allowance could not cover that request, rather than claiming C$100 was spent. Known costs, held funds and conservative CAD valuation are separate in the immutable trigger snapshot.

The worker checks the queue every five seconds in a separate thread, including while a workflow is waiting on a model. It also backfills an already exhausted/frozen budget after restart. The alert survives a budget exception and process restart; changing providers, releasing a hold or changing SMTP settings does not create repeated alerts for the same project budget. No automatic monthly reset or new-budget lifecycle is implemented.

SMTP connections occur outside database transactions. A durable sending claim prevents two workers from dispatching the same notification concurrently. The message includes only the budget reason, limit, known/held amounts, remaining allowance, valuation policy and detection time. It contains no deliveries, customer details, model prompts or credentials.

## Private configuration

The fields are available in `.env.example` and were appended to the existing private `.env` without replacing its values:

```dotenv
GENESIS_SMTP_HOST=
GENESIS_SMTP_PORT=587
GENESIS_SMTP_SECURITY=starttls
GENESIS_SMTP_USER=
GENESIS_SMTP_PASSWORD=
GENESIS_SMTP_FROM=
GENESIS_BUDGET_ALERT_TO=
```

Use the chosen email service's actual SMTP host and a sender it authorizes. `starttls` normally uses port 587; `smtps` normally uses 465. Supply SMTP username and password together if authentication is required. From/To each accept one ASCII email address, without display names, lists or control characters. Credentials stay in the ignored `.env`; they never appear in the status endpoint, UI, event snapshot or logs. Restart the worker after editing its private environment.

A syntactically complete configuration enables sending; it does not prove provider login or inbox delivery. No sender, recipient or external SMTP credentials have been invented. The setup remains pending until the operator configures them. Ordinary external transport requires verified TLS. Plain SMTP exists only behind `GENESIS_SMTP_ALLOW_LOCAL_FIXTURE=1`, with a literal loopback host and no credentials, for isolated capture tests.

## Visible status and recovery limits

`GET /api/v1/budget-alerts` is read-only, inherits loopback/origin restrictions, ignores dashboard cohort filters and exposes configuration readiness plus the current guard and alert state. It does not connect to SMTP or reveal transport settings. The global-cost card polls its status independently: slow or failed mail-status requests cannot hide or stall cost monitoring. Historical replay still hides the entire current global-cost card.

| State | Meaning |
|---|---|
| No event | The global guard has not triggered an alert |
| Configuration needed | A queued event remains durable until valid settings are provided |
| Pending / sending | Waiting for the worker or holding a persisted sending claim |
| Retry wait | A known failure before DATA may be retried after 30/60 seconds; at most three total attempts |
| Sent | The SMTP server accepted DATA; receipt in the inbox is not established |
| Failed | Retry allowance exhausted or DATA explicitly rejected; automatic sending has stopped |
| Uncertain | DATA may have been accepted, or a sending process/lease was lost; automatic resend is prohibited |

Failure diagnostics use fixed safe codes. Inspect the recorded state, email service and destination inbox, and correct the private configuration where needed. Restarting the worker does **not** reset terminal `failed`, `uncertain` or `sent` states. There is no resend/reset endpoint in this release. Any future reset must be reviewed as a state transition; never reset an uncertain/sent record merely because a message was not found in an inbox.

SMTP cannot provide an application-wide exactly-once guarantee. A crash after acceptance but before the database update remains uncertain. Stable Message-ID helps identify the logical message but does not force provider deduplication. A QUIT error after successful DATA does not erase acceptance; a late sender cannot overwrite a newer uncertain state or report a fenced completion as durably sent.

## Verification and evidence

Automated checks cover effective ceiling/cushion consistency, known/held amounts, run-local exclusion, atomic denial snapshots, concurrent deduplication, restart/backfill, invalid runtime configuration without lost charges, TLS/header validation, pre-DATA retries, DATA ambiguity, crash/lease fencing, credential redaction and independent UI states. The real loopback SMTP test captures one message and verifies that restart causes no resend and no budget-ledger change. It never contacts an external mail service.

Three isolated browser journeys cover setup, SMTP-accepted/uncertain/stale labels, privacy, mobile accessibility and a stalled status response while the global ledger remains visible. Exact results and independent approval are in ACTION-LOG and reviews/budget-email-review.md. Real SMTP login/deliverability, PostgreSQL operation and production deployment remain unverified.

Implementation uses the standard-library [SMTP client](https://docs.python.org/3.13/library/smtplib.html) and [EmailMessage](https://docs.python.org/3.13/library/email.message.html), with no new package or mail-provider account.
