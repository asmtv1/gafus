import { describe, it, expect, vi } from "vitest";
import { syntheticG05Create } from "./g05SyntheticCreateAdapter";
const body = {
  name: "Бим",
  type: "DOG" as const,
  breed: "Корги",
  birthDate: "2020-02-29",
  weightKg: 4.25,
  clientRequestId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
};
const user = { ownerId: "A", accessToken: "synthetic-token" };
const url = "http://127.0.0.1:4128/api/v1/pets";
const resp = (status: number, data: unknown, replay = false) =>
  new Response(JSON.stringify(data), {
    status,
    headers: replay ? { "Idempotent-Replayed": "true" } : {},
  });
describe("G05 synthetic Mobile HTTP adapter contract", () => {
  it("sends JSON UUID body and never Idempotency-Key header, replay preserves owner and pet", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resp(201, { data: { id: "pet1", ownerId: "A" } }))
      .mockResolvedValueOnce(resp(201, { data: { id: "pet1", ownerId: "A" } }, true));
    const first = await syntheticG05Create(body, user, { url, fetcher });
    const repeat = await syntheticG05Create(body, user, { url, fetcher });
    expect(first.petId).toBe("pet1");
    expect(repeat).toMatchObject({ petId: "pet1", replayed: true });
    for (const [, options] of fetcher.mock.calls) {
      expect(JSON.parse(options!.body as string)).toEqual(body);
      expect(options!.headers).not.toHaveProperty("Idempotency-Key");
    }
  });
  it("refuses external URL and forged owner response", async () => {
    await expect(
      syntheticG05Create(body, user, {
        url: "https://production.example/api/v1/pets",
        fetcher: vi.fn(),
      }),
    ).rejects.toThrow("ENDPOINT_DENIED");
    await expect(
      syntheticG05Create(body, user, {
        url,
        fetcher: vi.fn().mockResolvedValue(resp(201, { data: { id: "p", ownerId: "B" } })),
      }),
    ).rejects.toThrow("UNTRUSTED");
  });
  it("treats lost ACK and 503 as uncertain; 409 conflict as terminal; no automatic repeat", async () => {
    const lost = vi.fn().mockRejectedValue(new Error("socket closed"));
    expect(await syntheticG05Create(body, user, { url, fetcher: lost })).toMatchObject({
      uncertain: true,
      status: 0,
    });
    expect(lost).toHaveBeenCalledTimes(1);
    const unavailable = vi
      .fn()
      .mockResolvedValue(resp(503, { code: "PET_CREATE_RESULT_UNCONFIRMED" }));
    expect(await syntheticG05Create(body, user, { url, fetcher: unavailable })).toMatchObject({
      uncertain: true,
      status: 503,
    });
    const conflict = vi.fn().mockResolvedValue(resp(409, { code: "PET_CREATE_REQUEST_CONFLICT" }));
    expect(await syntheticG05Create(body, user, { url, fetcher: conflict })).toMatchObject({
      uncertain: false,
      status: 409,
    });
  });
});
