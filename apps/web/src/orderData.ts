import type { BrokerDelivery, Place } from "./dispatchTypes";

export const ORDER_LIMIT = 10;
export const ORDER_PAYLOAD_BYTES = 16 * 1024;
export type OrderStatus = "open" | "planning" | "planned" | "cancelled";
export type OrderMetadata = {
  reference: string;
  customer: string;
  service_date: string;
};
export type OrderInput = Omit<BrokerDelivery, "id" | "deadline_minutes"> & {
  reference: string;
  customer: string;
  service_date: string | null;
  deadline_minutes: number;
};
export type BrokerOrder = OrderInput & {
  id: string;
  version: number;
  status: OrderStatus;
  plan_id: string | null;
  created_at: string;
  updated_at: string;
};
export type OrderIssue = { row: number; field: string; message: string };
export type OrderPage = { items: BrokerOrder[]; total: number };
export type OrderPreview = { items: OrderInput[]; errors: OrderIssue[] };
export type OrderDraftRow = {
  deliveryId?: string;
  key: string;
  metadata: OrderMetadata;
};

export function orderDraftKey(delivery: BrokerDelivery): string {
  return JSON.stringify(
    draftOrderInput(delivery, {
      reference: "",
      customer: "",
      service_date: "",
    }),
  );
}

export function reconcileOrderDraft(
  draft: BrokerDelivery[],
  previous: OrderDraftRow[],
  makeReference: () => string,
): OrderDraftRow[] {
  const used = new Set<number>();
  const matches = draft.map((delivery) => {
    const key = orderDraftKey(delivery);
    let match = delivery.id
      ? previous.findIndex(
          (row, index) => !used.has(index) && row.deliveryId === delivery.id,
        )
      : -1;
    if (match < 0)
      match = previous.findIndex(
        (row, index) =>
          !used.has(index) &&
          row.key === key &&
          (!delivery.id || !row.deliveryId),
      );
    if (match >= 0) used.add(match);
    return match;
  });
  return draft.map((delivery, index) => {
    let match = matches[index];
    // Older anonymous drafts can keep metadata through an edit after untouched survivors are matched.
    if (
      match < 0 &&
      !delivery.id &&
      previous[index] &&
      !previous[index].deliveryId &&
      !used.has(index)
    ) {
      match = index;
      used.add(index);
    }
    return {
      deliveryId: delivery.id,
      key: orderDraftKey(delivery),
      metadata:
        match >= 0
          ? previous[match].metadata
          : { reference: makeReference(), customer: "", service_date: "" },
    };
  });
}

export const orderStatusLabel: Record<OrderStatus, string> = {
  open: "À planifier",
  planning: "En planification",
  planned: "Planifiée",
  cancelled: "Annulée",
};

export function payloadBytes(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).byteLength;
}

function placeInput(place: Place): Place {
  // Geocoder metadata and tracked delivery IDs are not part of the intake contract.
  return {
    label: place.label,
    coordinates: [place.coordinates[0], place.coordinates[1]],
  };
}

export function draftOrderInput(
  delivery: BrokerDelivery,
  metadata: OrderMetadata,
): OrderInput {
  return {
    reference: metadata.reference.trim(),
    customer: metadata.customer.trim(),
    service_date: metadata.service_date || null,
    pickup: placeInput(delivery.pickup),
    dropoff: placeInput(delivery.dropoff),
    parcels: delivery.parcels,
    deadline_minutes: delivery.deadline_minutes ?? 120,
  };
}

export function validateOrderBatch(items: OrderInput[]): OrderIssue[] {
  const errors: OrderIssue[] = [];
  if (!items.length || items.length > ORDER_LIMIT)
    errors.push({
      row: 0,
      field: "items",
      message: "Choisissez de 1 à 10 commandes par lot.",
    });
  const references = new Set<string>();
  items.forEach((item, index) => {
    const row = index + 1;
    const add = (field: string, message: string) =>
      errors.push({ row, field, message });
    const reference = item.reference.trim().toLowerCase();
    if (!reference || item.reference.length > 64)
      add("reference", "La référence doit contenir de 1 à 64 caractères.");
    else if (references.has(reference))
      add("reference", "Cette référence figure déjà dans le lot.");
    references.add(reference);
    if (item.customer.length > 120)
      add("customer", "Le client est limité à 120 caractères.");
    if (item.service_date) {
      const date = new Date(`${item.service_date}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(item.service_date) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== item.service_date
      )
        add("service_date", "Saisissez une date valide au format AAAA-MM-JJ.");
    }
    for (const field of ["pickup", "dropoff"] as const) {
      const place = item[field];
      if (!place.label.trim() || place.label.length > 200)
        add(field, "L’adresse doit contenir de 1 à 200 caractères.");
      const [lon, lat] = place.coordinates;
      if (
        !Number.isFinite(lon) ||
        !Number.isFinite(lat) ||
        lon < -180 ||
        lon > 180 ||
        lat < -90 ||
        lat > 90
      )
        add(
          field,
          "Les coordonnées de l’adresse sont invalides. Resélectionnez l’adresse.",
        );
    }
    if (
      !Number.isInteger(item.parcels) ||
      item.parcels < 1 ||
      item.parcels > 40
    )
      add("parcels", "La charge doit être de 1 à 40 colis.");
    if (
      !Number.isInteger(item.deadline_minutes) ||
      item.deadline_minutes < 1 ||
      item.deadline_minutes > 480
    )
      add("deadline_minutes", "Le délai doit être de 1 à 480 minutes.");
  });
  if (payloadBytes({ items }) > ORDER_PAYLOAD_BYTES)
    errors.push({
      row: 0,
      field: "items",
      message:
        "Le lot dépasse 16 Kio. Réduisez le nombre de commandes ou les libellés.",
    });
  return errors;
}

export function toggleOrderSelection(
  selected: string[],
  order: BrokerOrder,
): string[] {
  if (selected.includes(order.id))
    return selected.filter((id) => id !== order.id);
  if (order.status !== "open" || selected.length >= ORDER_LIMIT)
    return selected;
  return [...selected, order.id];
}

export function selectedOpenOrders(
  ids: string[],
  orders: BrokerOrder[],
): BrokerOrder[] {
  return [...new Set(ids)].slice(0, ORDER_LIMIT).flatMap((id) => {
    const order = orders.find(
      (item) => item.id === id && item.status === "open",
    );
    return order ? [order] : [];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export class OrderApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues: OrderIssue[] = [],
  ) {
    super(message);
  }
}
export function orderApiError(status: number, body: unknown): OrderApiError {
  const root = record(body);
  const error = record(root?.error) ?? record(root?.detail) ?? root;
  const fallback =
    status === 409
      ? "Conflit : la référence existe déjà ou la commande a changé. Actualisez la liste."
      : status === 422
        ? "Certains champs sont invalides. Vérifiez les commandes."
        : `Requête impossible (${status}). Réessayez avec les mêmes références.`;
  const rawIssues = error?.errors;
  const issues: OrderIssue[] = Array.isArray(rawIssues)
    ? rawIssues
        .flatMap((value) => {
          const issue = record(value);
          return issue &&
            typeof issue.row === "number" &&
            typeof issue.field === "string" &&
            typeof issue.message === "string"
            ? [
                {
                  row: issue.row,
                  field: issue.field.slice(0, 80),
                  message: issue.message.slice(0, 240),
                },
              ]
            : [];
        })
        .slice(0, 100)
    : [];
  // Only read the sanitized API envelope; never stringify validation inputs or arbitrary error bodies.
  const message =
    typeof error?.message === "string" &&
    error.message !== "Request fields or query bounds are invalid"
      ? error.message.slice(0, 300)
      : fallback;
  return new OrderApiError(message, status, issues);
}
export async function ordersRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (body !== undefined && payloadBytes(body) > ORDER_PAYLOAD_BYTES)
    throw new OrderApiError(
      "La requête dépasse 16 Kio. Réduisez le lot ou le fichier.",
      413,
    );
  const response = await fetch(`/api/v1/orders${path}`, {
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    throw orderApiError(response.status, value);
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export const ORDER_CSV_TEMPLATE =
  "\ufeffreference,customer,service_date,pickup_label,pickup_longitude,pickup_latitude,dropoff_label,dropoff_longitude,dropoff_latitude,parcels,deadline_minutes\r\nEXEMPLE-001,Client exemple,,Gare Centrale,-73.5673,45.5003,Marché Jean-Talon,-73.6145,45.5362,1,120\r\n";
