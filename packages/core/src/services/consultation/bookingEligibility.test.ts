import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@gafus/prisma";
import { getConsultationBookingEligibility, requireConsultationBookingEligibility } from "./bookingEligibility";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { consultationBooking: { findFirst } } }));
const db = { consultationBooking: { findFirst } } as unknown as Pick<Prisma.TransactionClient, "consultationBooking">;
const completedAt = new Date("2026-10-04T12:30:00.000Z");
const next = new Date("2026-10-11T12:30:00.000Z");

beforeEach(() => findFirst.mockReset());

describe("video consultation booking eligibility", () => {
  it("blocks an active booking across all trainers", async () => {
    findFirst.mockResolvedValueOnce({ id: "active" });
    expect(await getConsultationBookingEligibility("client", db, completedAt)).toMatchObject({
      canBook: false, reason: "ACTIVE_BOOKING", nextBookingAt: null,
    });
    expect(findFirst.mock.calls[0][0].where).toEqual({
      clientId: "client", status: { in: ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"] },
    });
  });

  it("blocks until exactly 168 hours after completion and displays Moscow date", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ completedAt });
    const result = await getConsultationBookingEligibility("client", db, new Date(next.getTime() - 1));
    expect(result).toMatchObject({ canBook: false, reason: "WEEKLY_COOLDOWN", nextBookingAt: next.toISOString() });
    expect(result.message).toContain("11 октября");
    expect(result.message).toContain("15:30");
    expect(result.message).toContain("МСК");
  });

  it.each([0, 1])("allows booking at/after cooldown expiration (+%i ms)", async (offset) => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ completedAt });
    expect(await getConsultationBookingEligibility("client", db, new Date(next.getTime() + offset))).toEqual({
      canBook: true, reason: null, nextBookingAt: null, message: null,
    });
  });

  it("ignores legacy completions, cancellations and no-shows", async () => {
    findFirst.mockResolvedValue(null);
    expect((await getConsultationBookingEligibility("client", db, completedAt)).canBook).toBe(true);
    expect(findFirst.mock.calls[1][0]).toMatchObject({
      where: { clientId: "client", status: "COMPLETED", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
    });
  });

  it("throws a structured restriction for API error mapping", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ completedAt: new Date() });
    await expect(requireConsultationBookingEligibility("client", db)).rejects.toMatchObject({
      code: "CONSULTATION_WEEKLY_COOLDOWN", statusCode: 403,
      eligibility: { canBook: false, reason: "WEEKLY_COOLDOWN" },
    });
  });
});
