export async function api<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api/v1" + path, {
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let message = `Requête impossible (${res.status})`;
    try {
      const error = await res.json();
      message =
        error.message ||
        error.detail?.message ||
        (typeof error.detail === "string" ? error.detail : message);
    } catch {
      /* Keep safe HTTP status when body is unavailable. */
    }
    throw new Error(message);
  }
  return res.json();
}
