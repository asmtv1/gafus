import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: m.api }));
import { consultationCancelGuarded } from "./consultationCancelGuarded";
const ack = { success: true, data: { bookingId: "book-A" } };
beforeEach(() => {
  m.api.mockReset().mockResolvedValue(ack);
});
describe("V90 existing Hono consultation booking cancellation guarded wire adapter", () => {
  it("uses exact existing POST :encodedBookingId/cancel empty JSON with epoch guard and no 401 replay", async () => {
    const guard = vi.fn(() => true);
    await expect(consultationCancelGuarded("book/A", guard)).resolves.toEqual(ack);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/consultations/bookings/book%2FA/cancel",
      {
        method: "POST",
        body: {},
        requestGuard: guard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      },
    );
  });
  it("unverified actor blocks without any POST", async () => {
    await expect(consultationCancelGuarded("book-A", () => false)).rejects.toThrow(
      "CONSULTATION_CANCEL_SESSION_CHANGED",
    );
    expect(m.api).not.toHaveBeenCalled();
  });
  it("A->B->A while HTTP awaits fences even positive-looking response", async () => {
    let live = true;
    let resolve!: (v: unknown) => void;
    m.api.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = consultationCancelGuarded("book-A", () => live);
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    live = false;
    resolve(ack);
    await expect(pending).rejects.toThrow("CONSULTATION_CANCEL_SESSION_CHANGED");
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("preserves negative 409 for caller to decide without inventing ACK", async () => {
    const conflict = { success: false, code: "CONSULTATION_SLOT_TAKEN", error: "status changed" };
    m.api.mockResolvedValueOnce(conflict);
    await expect(consultationCancelGuarded("book-A", () => true)).resolves.toEqual(conflict);
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("preserves missing-data success for strict UI ACK to reject, never fakes id", async () => {
    m.api.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(consultationCancelGuarded("book-A", () => true)).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(m.api).toHaveBeenCalledTimes(1);
  });
});
