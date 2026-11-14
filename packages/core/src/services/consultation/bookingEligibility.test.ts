import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConsultationBookingEligibilityService } from "./bookingEligibility";

const read = vi.fn();
const service = createConsultationBookingEligibilityService(read);
const { getConsultationBookingEligibility, requireConsultationBookingEligibility } = service;
const completedAt = new Date("2026-10-04T12:30:00.000Z");
const next = new Date("2026-10-11T12:30:00.000Z");
const tx = { id: "same-transaction" };

beforeEach(() => read.mockReset());

describe("Core consultation booking policy with injected read port", () => {
  it("blocks an active booking across all trainers without additional queries", async () => {
    read.mockResolvedValue({ hasActiveBooking: true, lastCompletedAt: null });
    expect(await getConsultationBookingEligibility("client", tx, completedAt)).toMatchObject({
      canBook: false, reason: "ACTIVE_BOOKING", nextBookingAt: null,
    });
    expect(read).toHaveBeenCalledExactlyOnceWith("client", tx);
  });

  it("blocks until exactly 168 hours after completion and displays Moscow date", async () => {
    read.mockResolvedValue({ hasActiveBooking: false, lastCompletedAt: completedAt });
    const result = await getConsultationBookingEligibility("client", tx, new Date(next.getTime() - 1));
    expect(result).toMatchObject({ canBook: false, reason: "WEEKLY_COOLDOWN", nextBookingAt: next.toISOString() });
    expect(result.message).toContain("11 октября");
    expect(result.message).toContain("15:30");
    expect(result.message).toContain("МСК");
  });

  it.each([0, 1])("allows booking at/after cooldown expiration (+%i ms)", async offset => {
    read.mockResolvedValue({ hasActiveBooking: false, lastCompletedAt: completedAt });
    expect(await getConsultationBookingEligibility("client", tx, new Date(next.getTime() + offset))).toEqual({
      canBook: true, reason: null, nextBookingAt: null, message: null,
    });
  });

  it("ignores missing/legacy completions, cancellations and no-shows", async () => {
    read.mockResolvedValue({ hasActiveBooking: false, lastCompletedAt: null });
    expect((await getConsultationBookingEligibility("client", tx, completedAt)).canBook).toBe(true);
    expect(read).toHaveBeenCalledExactlyOnceWith("client", tx);
  });

  it("throws a structured restriction for API error mapping", async () => {
    read.mockResolvedValue({ hasActiveBooking: false, lastCompletedAt: new Date() });
    await expect(requireConsultationBookingEligibility("client", tx)).rejects.toMatchObject({
      code: "CONSULTATION_WEEKLY_COOLDOWN", statusCode: 403,
      eligibility: { canBook: false, reason: "WEEKLY_COOLDOWN" },
    });
    expect(read).toHaveBeenCalledExactlyOnceWith("client", tx);
  });
});
