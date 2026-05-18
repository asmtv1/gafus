import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationEmailType, Prisma } from "@gafus/prisma";

const { emailLogCreate, bookingFindUnique, mailQueueAdd } = vi.hoisted(() => ({
  emailLogCreate: vi.fn(),
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
  const mod = await importOriginal<typeof import("@gafus/prisma")>();
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
      },
    },
  };
});

describe("enqueueConsultationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mailQueueAdd).not.toHaveBeenCalled();
  });
});
