import { generateKeyPairSync, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import { ConsultationBookingStatus } from "@gafus/prisma";

const { bookingLookup } = vi.hoisted(() => ({ bookingLookup: vi.fn() }));
vi.mock("@gafus/prisma", async (original) => {
  const source = await original<typeof PrismaModule>();
  return {
    ...source,
    prisma: {
      ...source.prisma,
      consultationBooking: { ...source.prisma.consultationBooking, findUnique: bookingLookup },
    },
  };
});

import {
  isConsultationCallTimeAllowed, prepareConsultationCall, signConsultationOneTimeKey,
  createConsultationCallAdmission,
} from "./voximplantService";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const slot = {
  startAt: new Date("2026-10-13T11:00:00.000Z"),
  endAt: new Date("2026-10-13T11:30:00.000Z"),
};

describe("Voximplant booking authorization and credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T11:05:00.000Z"));
    vi.stubEnv("VOXIMPLANT_APPLICATION_ID", "41");
    vi.stubEnv("VOXIMPLANT_ACCOUNT_ID", "51");
    vi.stubEnv("VOXIMPLANT_APPLICATION_NAME", "gafus");
    vi.stubEnv("VOXIMPLANT_ACCOUNT_NAME", "example");
    vi.stubEnv("VOXIMPLANT_KEY_ID", "safe-test-key");
    vi.stubEnv("VOXIMPLANT_PRIVATE_KEY", privateKey.replace(/\n/g, "\\n"));
    vi.stubEnv("VOXIMPLANT_CREDENTIAL_SECRET", "a".repeat(64));
    vi.stubEnv("VOXIMPLANT_ADMISSION_SECRET", "b".repeat(64));
    bookingLookup.mockResolvedValue({
      status: ConsultationBookingStatus.CONFIRMED,
      clientId: "client-1",
      cynologist: { userId: "trainer-1" },
      slot,
    });
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("only permits calls in the booking window", () => {
    expect(isConsultationCallTimeAllowed(slot.startAt, slot.endAt, new Date("2026-10-13T10:44:59Z"))).toBe(false);
    expect(isConsultationCallTimeAllowed(slot.startAt, slot.endAt, new Date("2026-10-13T10:45:00Z"))).toBe(true);
    expect(isConsultationCallTimeAllowed(slot.startAt, slot.endAt, new Date("2026-10-13T12:30:00Z"))).toBe(true);
    expect(isConsultationCallTimeAllowed(slot.startAt, slot.endAt, new Date("2026-10-13T12:30:01Z"))).toBe(false);
  });

  it("refuses strangers and unconfirmed bookings before contacting Voximplant", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(prepareConsultationCall("booking-1", "intruder")).rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
    bookingLookup.mockResolvedValueOnce({
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
      clientId: "client-1", cynologist: { userId: "trainer-1" }, slot,
    });
    await expect(signConsultationOneTimeKey("booking-1", "client-1", "123456789")).rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provisions client and trainer separately for the same private room", async () => {
    const urls: URL[] = [];
    const fetchMock = vi.fn(async (url: URL, options: { headers: Record<string, string> }) => {
      urls.push(new URL(url.toString()));
      expect(options.headers.Authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
      if (url.pathname.endsWith("GetUsers")) {
        return { ok: true, json: async () => ({ result: [] }) };
      }
      return { ok: true, json: async () => ({ result: 1 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = await prepareConsultationCall("booking-1", "client-1");
    const trainer = await prepareConsultationCall("booking-1", "trainer-1");
    expect(client.room).toBe(trainer.room);
    expect(client.username).not.toBe(trainer.username);
    // Same trainer/user across bookings reuses a single Vox SDK login.
    const secondBooking = await prepareConsultationCall("booking-2", "trainer-1");
    expect(secondBooking.username).toBe(trainer.username);
    expect(secondBooking.room).not.toBe(trainer.room);
    expect(client.room).toMatch(/^gafus_[a-f0-9]{30}$/);
    expect(client.username).toMatch(/^g_u_[a-f0-9]{30}@gafus.example.voximplant.com$/);
    expect(trainer.username).toMatch(/^g_u_[a-f0-9]{30}@gafus.example.voximplant.com$/);
    expect(urls.filter((u) => u.pathname.endsWith("AddUser"))).toHaveLength(3);
    expect(urls[1]?.searchParams.get("user_password")).toMatch(/^Gf1!/);
    // Vox users must spend from the parent account, not empty sub-user balance.
    expect(urls[1]?.searchParams.get("parent_accounting")).toBe("true");
    expect(JSON.stringify(client)).not.toContain("user_password");
  });

  it("signs a challenge only for its authorized participant and never exposes a password", async () => {
    const token = await signConsultationOneTimeKey("booking-1", "client-1", "test-key-12345");
    const trainerToken = await signConsultationOneTimeKey("booking-1", "trainer-1", "test-key-12345");
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(trainerToken).not.toBe(token);
    await expect(signConsultationOneTimeKey("booking-1", "client-1", "a")).rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
  });

  it("issues a fresh 90-second admission for only the participant and exact private room", async () => {
    const client = await createConsultationCallAdmission("booking-1", "client-1");
    const trainer = await createConsultationCallAdmission("booking-1", "trainer-1");
    const [expiry, signature] = client.admission.split(".");
    const [trainerExpiry, trainerSignature] = trainer.admission.split(".");
    expect(expiry).toBe(trainerExpiry);
    expect(client.expires).toBe(Math.floor(Date.now() / 1000) + 90);
    const idHash = createHmac("sha256", "a".repeat(64)).update("gafus:vox:v1:booking-1").digest("hex").slice(0, 30);
    const userHash = createHmac("sha256", "a".repeat(64)).update("gafus:vox:user:v1:client-1").digest("hex").slice(0, 30);
    const trainerHash = createHmac("sha256", "a".repeat(64)).update("gafus:vox:user:v1:trainer-1").digest("hex").slice(0, 30);
    const expected = createHmac("sha256", "b".repeat(64)).update(
      "v1:gafus_" + idHash + ":g_u_" + userHash + ":" + expiry,
    ).digest("hex");
    const expectedTrainer = createHmac("sha256", "b".repeat(64)).update(
      "v1:gafus_" + idHash + ":g_u_" + trainerHash + ":" + expiry,
    ).digest("hex");
    expect(signature).toBe(expected);
    expect(trainerSignature).toBe(expectedTrainer);
    expect(trainerSignature).not.toBe(signature);
    expect(client.admission).toMatch(/^[0-9]{10,11}\.[a-f0-9]{64}$/);
  });

  it("rejects missing admission secret, strangers, and bookings that were cancelled", async () => {
    vi.stubEnv("VOXIMPLANT_ADMISSION_SECRET", "");
    await expect(createConsultationCallAdmission("booking-1", "client-1")).rejects.toMatchObject({
      code: "CONSULTATION_VIDEO_UNAVAILABLE",
    });
    vi.stubEnv("VOXIMPLANT_ADMISSION_SECRET", "b".repeat(64));
    await expect(createConsultationCallAdmission("booking-1", "someone-else")).rejects.toMatchObject({
      code: "CONSULTATION_FORBIDDEN",
    });
    bookingLookup.mockResolvedValueOnce({
      status: ConsultationBookingStatus.CANCELLED_BY_USER,
      clientId: "client-1", cynologist: { userId: "trainer-1" }, slot,
    });
    await expect(createConsultationCallAdmission("booking-1", "client-1")).rejects.toMatchObject({
      code: "CONSULTATION_FORBIDDEN",
    });
  });

  it("does not silently bypass missing server-side credentials", async () => {
    vi.stubEnv("VOXIMPLANT_CREDENTIAL_SECRET", "");
    await expect(prepareConsultationCall("booking-1", "client-1")).rejects.toMatchObject({ code: "CONSULTATION_VIDEO_UNAVAILABLE" });
  });
});
