import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("surfaces the API error envelope instead of hiding actionable field errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "invalid_input",
            message: "Champs invalides : deliveries.0.parcels",
          },
        }),
        { status: 422 },
      ),
    ),
  );
  await expect(api("/orders")).rejects.toThrow("deliveries.0.parcels");
});

it("keeps a usable status when an upstream response is not JSON", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
  );
  await expect(api("/orders")).rejects.toThrow("503");
});
