import { describe, it, expect, vi } from "vitest";
import { ConsultationEmailType as PrismaConsultationEmailType } from "@gafus/prisma";
import { CONSULTATION_EMAIL_TYPES } from "@gafus/consultation-shared";
import {
  sendConsultationEmailFromLog,
  type ConsultationMailReadPort,
} from "@gafus/core/services/consultation/transactional-mail";

describe("consultation mail shared domain and SQL projection ports", () => {
  it("keeps shared email categories exactly aligned with the DB enum", () => {
    expect([...CONSULTATION_EMAIL_TYPES].sort()).toEqual(
      Object.values(PrismaConsultationEmailType).sort(),
    );
  });
  it("does not send mail when the injected outbox SQL read has no booking", async () => {
    const read: ConsultationMailReadPort = vi.fn().mockResolvedValue(null);
    await expect(
      sendConsultationEmailFromLog("no-booking", "CLIENT_BOOKING_RECEIVED", read),
    ).rejects.toThrow("booking not found for email log");
    expect(read).toHaveBeenCalledExactlyOnceWith("no-booking");
  });
});
