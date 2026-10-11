# Broker intake and planning — local pilot

U17 implements the first operational slice of the broker priority review. It centralizes requests and turns selected orders into a certified route proposal. It does not constitute an authenticated transport management system or communicate with a real carrier.

## Operator path

1. Enter and select pickup/drop-off addresses in **Préparer les livraisons**. Add parcels and the delivery deadline in minutes after departure. The route draft can contain up to ten deliveries.
2. Save these deliveries in **Carnet de commandes**, supplying a reference for each. Customer and service date organize the backlog. The date is not a scheduled departure or a solver time window; the deadline remains relative to departure.
3. Alternatively, download the CSV template, fill its labeled coordinates and import it. Preview reports row/field errors without persisting data. Commit only a valid batch. Ten rows per batch, with the existing 16 KiB HTTP payload ceiling; UTF-8 and quoted commas are supported. Coordinates are required: this import does not guess which ambiguous address is correct.
4. Search/filter the backlog, select up to ten open orders and choose **Préparer ces commandes**. Review the pickup/drop-off pairs and choose the assumed depot for vans without a known position. Linked order deliveries are read-only to prevent silent divergence from the saved request.
5. Choose the objective and eligible vehicles. **Comparer les tournées** uses the existing road matrix, bounded strategy search and independent certificate without requiring Anthropic. Optional explanation policies remain in advanced settings; only those actual calls consume the model budget.
6. Review the selected strategy, estimated fleet cost, route sequence and certificate. Prepared trips reserve the relevant vans but remain ready. Starting a trip is a separate explicit **simulation** action. No driver is contacted and no real delivery is confirmed.

## Persistence and concurrency

Each order has a stable ID, trimmed case-insensitive unique reference, customer, optional ISO service date, strict pickup/drop-off places, parcels, deadline, version and timestamps. Batch creation is all-or-nothing. An exact repeat returns the existing order; reusing a reference for different content is a conflict. Cancellation retains history and requires the observed version.

The order IDs in a plan must exactly match the persisted delivery contents. The order claim and queued run share one database transaction. A second active plan cannot claim the same order; retrying an identical idempotency key returns its existing run. Failed or diagnostic plans release the order safely. Rejecting a proposal by cancelling **every** trip before any departure reopens its orders; the immutable original run retains the order IDs. Missing trip records, any departure or partial cancellation cannot release them. Successful route proposals remain linked even after simulated completion, preventing accidental duplicate dispatch.

Statuses are deliberately bounded: **open** (available), **planning** (claimed by a pending run), **planned** (linked to a successful proposal) and **cancelled**. Planned is not delivered or accepted by a carrier. Changing the specification of an existing order requires cancellation while it is still open and a new reference; in-place editing and real operational event history are later work.

## Cost and evidence

`mode=live` plus `explanation_policy=none` uses actual configured road services and deterministic tools, omits every model explanation, and records the reason `not_applicable_deterministic_policy`. The legacy live/fixture provenance field is retained for compatibility; it does not imply a model call, live traffic or GPS. The detail policy ID is `deterministic-tools-v1`. Five role durations/tool results remain visible. Tokens and model prices are inapplicable, not fabricated zero-usage responses.

The road calculation still depends on routing/geocoding availability. Fleet estimates in CAD are separate from optional model cost in USD; neither is an invoice or measured margin. Existing shared API budget guards, cancellation fencing and unresolved-cargo locks remain active.

## Next release gates

- Editable real vehicles, drivers, shifts and calibrated capacities, with constraints represented in both solver and independent validator.
- Authenticated assignment acceptance and actual pickup/drop-off/POD events, with offline retry and source timestamps.
- Explicit return/unload/transfer workflows before releasing vehicles with unresolved cargo.
- Carrier qualification/tender/acceptance and commercial records if the target customer is a subcontracting transport broker.
- Identity/tenant isolation, contracted routing, database restore rehearsal and a staffed pilot measuring service coverage and planning time.

See [the transport checklist](TRANSPORT-CHECKLIST.md) and [work/verification record](work/U17-broker-order-workflow.md). This release adds no hosted infrastructure, telemetry destination, provider account or recurring fee.
