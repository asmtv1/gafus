import { describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./client", () => ({ apiClient: (...args: unknown[]) => m.request(...args) }));
import { consultationsApi } from "./consultations";
const body = {
  slotId: "slotA",
  idempotencyKey: "e3519bbb-9e37-4eb2-bdd7-060268c5b66c",
  clientOwnerName: "Анна",
  clientPhone: "+79991234567",
  petName: "Бим",
  petGender: "MALE" as const,
  petAge: "2 года",
  petBreed: "Корги",
  clientProblem: "Собака очень возбуждается",
  clientSelfHelpAttempt: "Пытались тренировать дома",
};
describe("Mobile consultation booking transport exact JSON/401 session guard", () => {
  it("forwards body without new UUID or auto retry; guard is preserved for 401 refresh fence", async () => {
    m.request.mockReset().mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    let current = true;
    const requestGuard = () => current;
    await consultationsApi.book(body, requestGuard);
    expect(m.request).toHaveBeenCalledTimes(1);
    const [url, opts] = m.request.mock.calls[0] as [
      string,
      { method: string; body: typeof body; requestGuard: () => boolean },
    ];
    expect(url).toBe("/api/v1/consultations/book");
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual(body);
    expect(opts.body.idempotencyKey).toBe(body.idempotencyKey);
    expect(opts.requestGuard).toBe(requestGuard);
    expect(opts.requestGuard()).toBe(true);
    current = false;
    expect(opts.requestGuard()).toBe(false);
  });
  it("legacy callers keep identical body and require no requestGuard argument", async () => {
    m.request.mockReset().mockResolvedValue({ success: true, data: { kind: "created" } });
    await consultationsApi.book(body);
    const opts = m.request.mock.calls[0][1] as Record<string, unknown>;
    expect(opts).not.toHaveProperty("requestGuard");
    expect(opts).toMatchObject({ body, method: "POST" });
  });
});
