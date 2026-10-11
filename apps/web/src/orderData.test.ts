import { describe, expect, it, vi, afterEach } from "vitest";
import {
  draftOrderInput,
  ORDER_PAYLOAD_BYTES,
  OrderApiError,
  orderApiError,
  ordersRequest,
  payloadBytes,
  selectedOpenOrders,
  reconcileOrderDraft,
  toggleOrderSelection,
  validateOrderBatch,
  type BrokerOrder,
} from "./orderData";

const delivery = {
  id: "existing-delivery",
  pickup: {
    label: "Gare Centrale",
    coordinates: [-73.5673, 45.5003] as [number, number],
    provider_id: "metadata",
  },
  dropoff: {
    label: "Marché Jean-Talon",
    coordinates: [-73.6145, 45.5362] as [number, number],
  },
  parcels: 2,
};
const metadata = {
  reference: "  COM-001  ",
  customer: " Client ",
  service_date: "",
};
const input = draftOrderInput(delivery, metadata);
const order: BrokerOrder = {
  ...input,
  id: "order-1",
  status: "open",
  version: 1,
  plan_id: null,
  created_at: "2026-10-11T12:00:00Z",
  updated_at: "2026-10-11T12:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("order intake boundaries", () => {
  it("preserves metadata through identified edits, removal, reorder and temporary draft hiding", () => {
    const first = { ...delivery, id: "draft-a" };
    const second = { ...delivery, id: "draft-b", parcels: 3 };
    const makeReference = vi
      .fn()
      .mockReturnValueOnce("REF-A")
      .mockReturnValueOnce("REF-B");
    const original = reconcileOrderDraft([first, second], [], makeReference);
    original[1].metadata = {
      reference: "CUSTOM-B",
      customer: "Client conservé",
      service_date: "2026-10-12",
    };
    const edited = reconcileOrderDraft(
      [
        {
          ...second,
          parcels: 5,
          dropoff: { ...second.dropoff, label: "Nouvelle adresse" },
        },
        first,
      ],
      original,
      makeReference,
    );
    expect(edited[0].metadata).toBe(original[1].metadata);
    expect(edited[1].metadata.reference).toBe("REF-A");
    expect(
      reconcileOrderDraft([second], original, makeReference)[0].metadata,
    ).toBe(original[1].metadata);
    expect(reconcileOrderDraft([], original, makeReference)).toEqual([]);
    expect(
      reconcileOrderDraft([first, second], original, makeReference).map(
        (row) => row.metadata,
      ),
    ).toEqual(original.map((row) => row.metadata));
    expect(makeReference).toHaveBeenCalledTimes(2);
  });
  it("matches unchanged anonymous survivors before falling back to an edited row index", () => {
    const first = { ...delivery, id: undefined };
    const second = { ...first, parcels: 3 };
    const original = reconcileOrderDraft([first, second], [], () => "stable");
    original[1].metadata.customer = "Survivant";
    expect(
      reconcileOrderDraft([second], original, () => "new")[0].metadata.customer,
    ).toBe("Survivant");
    const edited = reconcileOrderDraft(
      [{ ...first, parcels: 4 }, second],
      original,
      () => "new",
    );
    expect(edited[0].metadata).toBe(original[0].metadata);
    expect(edited[1].metadata).toBe(original[1].metadata);
  });
  it("serializes strict place fields, trims metadata and defaults deadlines without mutating drafts", () => {
    expect(input).toEqual({
      reference: "COM-001",
      customer: "Client",
      service_date: null,
      pickup: { label: "Gare Centrale", coordinates: [-73.5673, 45.5003] },
      dropoff: delivery.dropoff,
      parcels: 2,
      deadline_minutes: 120,
    });
    expect(input).not.toHaveProperty("id");
    expect(input.pickup).not.toHaveProperty("provider_id");
    expect(input.pickup.coordinates).not.toBe(delivery.pickup.coordinates);
    expect(metadata.reference).toBe("  COM-001  ");
    expect(validateOrderBatch([input])).toEqual([]);
  });
  it("validates duplicate trimmed/case-insensitive references and atomic batch bounds", () => {
    expect(
      validateOrderBatch([input, { ...input, reference: " com-001 " }]),
    ).toContainEqual({
      row: 2,
      field: "reference",
      message: "Cette référence figure déjà dans le lot.",
    });
    expect(validateOrderBatch([])[0].field).toBe("items");
    expect(
      validateOrderBatch(
        Array.from({ length: 11 }, (_, index) => ({
          ...input,
          reference: `COM-${index}`,
        })),
      )[0].field,
    ).toBe("items");
    expect(
      validateOrderBatch(
        Array.from({ length: 10 }, (_, index) => ({
          ...input,
          reference: `COM-${index}`,
        })),
      ),
    ).toEqual([]);
  });
  it("reports row/field issues for date rollovers, noninteger load, NaN coordinates and invalid deadlines", () => {
    expect(
      validateOrderBatch([
        {
          ...input,
          reference: "",
          customer: "x".repeat(121),
          service_date: "2026-02-30",
          parcels: 1.5,
          deadline_minutes: 481,
          pickup: { ...input.pickup, coordinates: [NaN, 45.5] },
        },
      ]).map((issue) => issue.field),
    ).toEqual([
      "reference",
      "customer",
      "service_date",
      "pickup",
      "parcels",
      "deadline_minutes",
    ]);
    expect(
      validateOrderBatch([{ ...input, service_date: "2028-02-29" }]),
    ).toEqual([]);
    expect(
      validateOrderBatch([{ ...input, service_date: "2026-02-29" }])[0].field,
    ).toBe("service_date");
  });
  it("enforces encoded JSON bytes, including multibyte CSV and escaping overhead", async () => {
    expect(payloadBytes({ csv: "é" })).toBe(12);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      ordersRequest("/import/preview", {
        csv: "é".repeat(ORDER_PAYLOAD_BYTES / 2),
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(fetch).not.toHaveBeenCalled();
    expect(
      validateOrderBatch([{ ...input, customer: "界".repeat(6000) }]).some(
        (issue) => issue.row === 0 && issue.field === "items",
      ),
    ).toBe(true);
  });
});

describe("open-order selection", () => {
  it("toggles stable IDs and prevents inactive selections or an eleventh order", () => {
    expect(toggleOrderSelection([], order)).toEqual([order.id]);
    expect(toggleOrderSelection([order.id], order)).toEqual([]);
    for (const status of ["planning", "planned", "cancelled"] as const)
      expect(toggleOrderSelection([], { ...order, status })).toEqual([]);
    const selected = Array.from({ length: 10 }, (_, index) => `order-${index}`);
    expect(toggleOrderSelection(selected, { ...order, id: "order-11" })).toBe(
      selected,
    );
    expect(toggleOrderSelection(selected, order)).toHaveLength(9);
  });
  it("reconciles refreshed orders, removes duplicates and never prepares a claimed or hidden order", () => {
    const second = { ...order, id: "order-2", version: 4 };
    expect(
      selectedOpenOrders(
        ["order-2", "order-1", "order-2", "hidden"],
        [order, second],
      ),
    ).toEqual([second, order]);
    expect(
      selectedOpenOrders([order.id], [{ ...order, status: "planning" }]),
    ).toEqual([]);
  });
});

describe("safe order request failures", () => {
  it("reads the sanitized error envelope and field issues without serializing arbitrary validation input", () => {
    const error = orderApiError(422, {
      error: {
        message: "Request fields or query bounds are invalid",
        errors: [{ row: 1, field: "reference", message: "Référence requise" }],
        input: "private input",
      },
    });
    expect(error).toBeInstanceOf(OrderApiError);
    expect(error.message).toContain("champs sont invalides");
    expect(error.message).not.toContain("private input");
    expect(error.issues).toEqual([
      { row: 1, field: "reference", message: "Référence requise" },
    ]);
    expect(
      orderApiError(409, { detail: [{ input: "private input" }] }).message,
    ).toContain("Conflit");
    expect(orderApiError(500, null).message).toContain("500");
  });
  it("handles invalid error bodies and preserves POST payload exactly across retries", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => {
          throw new Error("not JSON");
        },
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [order], total: 1 }),
      });
    vi.stubGlobal("fetch", fetch);
    await expect(
      ordersRequest("/batch", { items: [input] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      ordersRequest("/batch", { items: [input] }),
    ).resolves.toMatchObject({ items: [order] });
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/orders/batch");
  });
});
