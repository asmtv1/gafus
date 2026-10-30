/** AG1 read-only route proof: actual Core code + scratch sentinel alias. */
import { describe, expect, it } from "vitest";
import * as scratchPrisma from "@gafus/prisma";
const { G1_SCRATCH_SENTINEL, calls, prisma } = scratchPrisma as unknown as {
  G1_SCRATCH_SENTINEL: string;
  calls: { active: number; completed: number };
  prisma: { consultationBooking: { findFirst: (...args: unknown[]) => Promise<unknown> } };
};
import { getConsultationBookingEligibility } from "./bookingEligibility";

describe("G1 Core resolves Prisma only through the isolated facade alias", () => {
  it("calls the unique scratch facade from real Core, never shared generated client", async () => {
    expect(G1_SCRATCH_SENTINEL).toBe("AG1_PRIVATE_ALIAS_SENTINEL_NO_DATABASE");
    expect(await getConsultationBookingEligibility("fake-provenance-user")).toEqual({
      canBook: true, reason: null, nextBookingAt: null, message: null,
    });
    expect(calls).toEqual({ active: 1, completed: 1 });
    expect(prisma.consultationBooking.findFirst).toBeTypeOf("function");
  });
});
