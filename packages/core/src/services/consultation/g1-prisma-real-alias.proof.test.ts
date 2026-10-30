/** FUTURE ONLY after AG4 ACTIVE isolated generate lease and fresh client.
 * Does not connect to a DB; validates Core import, generated schema and
 * absence of the known stale TransactionalMailAttempt field.
 * This file is EXCLUDED in the no-lease sentinel proof run.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as scratchPrisma from "@gafus/prisma";
const { G1_SCRATCH_PRISMA_FACADE, Prisma, prisma } = scratchPrisma as unknown as {
  G1_SCRATCH_PRISMA_FACADE: string;
  Prisma: { dmmf: { datamodel: { models: { name: string; fields: { name: string }[] }[] } } };
  prisma: { consultationBooking: { findFirst: (...args: unknown[]) => Promise<unknown> } };
};
import { getConsultationBookingEligibility } from "./bookingEligibility";

const scratch = path.dirname(process.env.G1_PRISMA_SCRATCH_FACADE ?? "");
describe("G1 future scratch client post-generate module resolution proof", () => {
  it("real Core service binds to one generated Prisma instance, never stale mail field", () => {
    expect(process.env.G1_AG4_ACTIVE_LEASE_ID).toBe("G1-PRISMA-AG1-20261016-01");
    expect(G1_SCRATCH_PRISMA_FACADE).toBe("AG1_SCRATCH_GENERATED_CLIENT_ONLY");
    expect(fs.readFileSync(path.join(scratch, ".g1-owner"), "utf8").trim())
      .toBe("PRISMA-TEST-TEMP-ONLY");
    const generated = fs.readFileSync(path.join(scratch, "generated/client/schema.prisma"), "utf8");
    const expected = fs.readFileSync(path.join(scratch, "schema.prisma"), "utf8");
    expect(generated).toBe(expected);
    expect(generated).not.toContain("correlationVersion");
    const mail = Prisma.dmmf.datamodel.models.find(m => m.name === "TransactionalMailAttempt");
    expect(mail).toBeDefined();
    expect(mail?.fields.some(f => f.name === "correlationVersion")).toBe(false);
    expect(prisma).toBeTruthy();
    expect(typeof prisma.consultationBooking.findFirst).toBe("function");
    expect(typeof getConsultationBookingEligibility).toBe("function");
  });
});
