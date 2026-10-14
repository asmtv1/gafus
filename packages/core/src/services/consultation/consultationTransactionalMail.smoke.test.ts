import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ findUnique: vi.fn(), send: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { consultationEmailLog: { findUnique: mock.findUnique } },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));
vi.mock("../mail/publicWebBaseUrl", () => ({ getPublicWebBaseUrl: () => "https://gafus.ru" }));
vi.mock("../mail/transactionalEmailLayout", () => ({
  sendTransactionalEmailWithLayout: mock.send,
  ctaButtonHtml: (url: string, label: string) => label + url,
  plainLinkFallbackHtml: (url: string) => url,
  paragraphHtml: (text: string) => text,
  escapeHtml: (text: string) => text,
}));
import { sendConsultationEmailFromLog } from "./consultationTransactionalMail";
import type { ConsultationEmailType } from "@gafus/prisma";

const booking = {
  id: "booking-1", clientOwnerName: "Аня", clientPhone: null,
  petName: null, petGender: null, petAge: null, petBreed: null,
  clientProblem: null, clientSelfHelpAttempt: null, cancelReason: null,
  trainerConfirmedAt: null,
  slot: { startAt: new Date("2026-10-15T12:00:00Z"), endAt: new Date("2026-10-15T13:00:00Z") },
  client: { email: "client@example.test", username: "client" },
  cynologist: { user: { email: "trainer@example.test", username: "trainer", profile: { fullName: "Кинолог" } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.findUnique.mockResolvedValue({ booking });
  mock.send.mockResolvedValue(undefined);
});

describe("consultation mail delivery policy", () => {
  it("queues new booking notifications with idempotent key and a short lifetime", async () => {
    await sendConsultationEmailFromLog("log-1", "CLIENT_BOOKING_RECEIVED" as ConsultationEmailType);
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKey: "consultation-log-1", to: "client@example.test",
      category: "consultation", maxQueueAgeMs: 4 * 60 * 60_000,
    }));
  });
  it("expires appointment reminders quickly", async () => {
    await sendConsultationEmailFromLog("log-2", "CLIENT_CONSULTATION_REMINDER_30M" as ConsultationEmailType);
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKey: "consultation-log-2", maxQueueAgeMs: 600_000,
    }));
  });
});
