import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationEmailType, ConsultationEmailStatus, Prisma } from "@gafus/prisma";
import type * as GafusPrisma from "@gafus/prisma";

const { emailLogCreate, emailLogFindUnique, bookingFindUnique, mailQueueAdd } = vi.hoisted(() => ({
  emailLogCreate: vi.fn(),
  emailLogFindUnique: vi.fn(),
  bookingFindUnique: vi.fn(),
  mailQueueAdd: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/queues", () => ({
  consultationMailQueue: { add: (...a: unknown[]) => mailQueueAdd(...a) },
  CONSULTATION_MAIL_JOB_ID: (id: string) => `mail:${id}`,
}));

vi.mock("@gafus/prisma", async (importOriginal) => {
  const mod = await importOriginal<typeof GafusPrisma>();
  return {
    ...mod,
    prisma: {
      ...mod.prisma,
      consultationBooking: {
        ...mod.prisma.consultationBooking,
        findUnique: bookingFindUnique,
      },
      consultationEmailLog: {
        ...mod.prisma.consultationEmailLog,
        create: emailLogCreate,
        findUnique: emailLogFindUnique,
      },
    },
  };
});

describe("enqueueConsultationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailLogFindUnique.mockResolvedValue({
      id: "already-sent-email", status: ConsultationEmailStatus.SENT, attempts: 1,
    });
    bookingFindUnique.mockResolvedValue({
      client: { email: "client@example.com" },
      cynologist: { user: { email: "trainer@example.com" } },
    });
  });

  it("не ставит письмо повторно, если email-log уже существует", async () => {
    emailLogCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["bookingId", "type"] },
      }),
    );

    const { enqueueConsultationEmail } = await import("./notificationService");
    const result = await enqueueConsultationEmail(
      "booking-1",
      ConsultationEmailType.CLIENT_CONSULTATION_START,
    );

    expect(result).toBe("duplicate");
    expect(emailLogFindUnique).toHaveBeenCalledExactlyOnceWith({
      where: { bookingId_type: { bookingId: "booking-1", type: ConsultationEmailType.CLIENT_CONSULTATION_START } },
      select: { id: true, status: true, attempts: true },
    });
    expect(mailQueueAdd).not.toHaveBeenCalled();
  });
});
