import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { consultationsApi } from "./consultations";

vi.mock("./client", () => ({
  apiClient: vi.fn(),
}));

describe("consultationsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient).mockResolvedValue({ success: true, data: undefined });
  });

  it("does not open the global paywall while loading the slots calendar", async () => {
    await consultationsApi.getSlotsCalendar(
      "trainer-1",
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z",
    );

    expect(apiClient).toHaveBeenCalledWith(
      "/api/v1/consultations/cynologists/trainer-1/slots?from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-08T00%3A00%3A00.000Z&includeBusy=1",
      { suppressSubscriptionPaywall: true },
    );
  });

  it("does not open the global paywall while verifying or booking a slot", async () => {
    await consultationsApi.verifySlotFree("trainer-1", "slot-1");
    await consultationsApi.book({
      slotId: "slot-1",
      idempotencyKey: "idem-1",
      clientOwnerName: "Анна",
      clientPhone: "+79990000000",
      petName: "Бим",
      petGender: "MALE",
      petAge: "2 года",
      petBreed: "Корги",
      clientProblem: "Тянет поводок",
      clientSelfHelpAttempt: "Пробовали лакомства",
    });

    expect(apiClient).toHaveBeenNthCalledWith(
      1,
      "/api/v1/consultations/cynologists/trainer-1/slots/slot-1/verify",
      { suppressSubscriptionPaywall: true },
    );
    expect(apiClient).toHaveBeenNthCalledWith(2, "/api/v1/consultations/book", {
      method: "POST",
      body: {
        slotId: "slot-1",
        idempotencyKey: "idem-1",
        clientOwnerName: "Анна",
        clientPhone: "+79990000000",
        petName: "Бим",
        petGender: "MALE",
        petAge: "2 года",
        petBreed: "Корги",
        clientProblem: "Тянет поводок",
        clientSelfHelpAttempt: "Пробовали лакомства",
      },
      suppressSubscriptionPaywall: true,
    });
  });
});
