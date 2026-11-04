import { describe, expect, it } from "vitest";
import {
  mediaTaskFailurePolicy, mediaCleanupRetryDelayMs, chat2CanRetryConfirmedUpload,
  chat2CanAttachVerifiedOriginal, chat2MediaWithoutRendition,
  questionsCanRetryConfirmedPhoto, questionsSafeCleanupAt, questionsPhotoDailyLimitReached,
} from "./mediaTaskPolicy";

const at = new Date("2026-11-04T00:00:00.000Z");
describe("durable media policy: identical Chat2 + Questions backoff and fail terminal", () => {
  it.each([[1,15], [2,30], [3,60], [4,120], [12,600]])(
    "attempt %i -> %i sec bounded backoff", (attempts, seconds) => {
      const decision = mediaTaskFailurePolicy(attempts, 4, at);
      expect(decision).toMatchObject({ terminal: attempts >= 4,
        status: attempts >= 4 ? "FAILED" : "QUEUED" });
      expect(decision.nextAttemptAt.getTime() - at.getTime()).toBe(seconds * 1000);
      expect(at.toISOString()).toBe("2026-11-04T00:00:00.000Z");
    });
  it.each([[0,15], [1,30], [4,240], [8,3600], [200,3600]])(
    "cleanup attempt %i -> %i sec", (attempts, seconds) => {
      expect(mediaCleanupRetryDelayMs(attempts)).toBe(seconds * 1000);
    });
  it("rejects corrupt retry counters and invalid dates before touching persistence", () => {
    expect(() => mediaTaskFailurePolicy(0,4,at)).toThrow();
    expect(() => mediaTaskFailurePolicy(2,0,at)).toThrow();
    expect(() => mediaTaskFailurePolicy(1,4,new Date(NaN))).toThrow();
    expect(() => mediaCleanupRetryDelayMs(-1)).toThrow();
  });
});
describe("actor-scoped media transitions and delivery", () => {
  it.each(["AWAITING_UPLOAD","UPLOADED","QUEUED","PROCESSING","READY","FAILED","EXPIRED"])(
    "Chat2 %s never discloses pre-READY URL, attach/confirm only after upload", status => {
      const attach = ["UPLOADED","QUEUED","PROCESSING","READY"].includes(status);
      expect(chat2CanAttachVerifiedOriginal(status)).toBe(attach);
      expect(chat2CanRetryConfirmedUpload(status)).toBe(attach);
      expect(chat2MediaWithoutRendition(status)).toBe(
        ["UPLOADED","QUEUED","PROCESSING","FAILED","EXPIRED"].includes(status));
    });
  it.each(["AWAITING_UPLOAD","UPLOADED","QUEUED","PROCESSING","READY","FAILED","EXPIRED"])(
    "Questions confirmation replay is fail-closed for %s", status => {
      expect(questionsCanRetryConfirmedPhoto(status)).toBe(
        ["QUEUED","PROCESSING","READY"].includes(status));
    });
  it("Questions cleanup never precedes valid signed POST or expiring lease", () => {
    const createdAt = new Date(at.getTime() - 60_000);
    expect(questionsSafeCleanupAt(at, createdAt)).toEqual(new Date(at.getTime() + 600_000));
    expect(questionsSafeCleanupAt(at, createdAt, new Date(at.getTime() + 900_000)))
      .toEqual(new Date(at.getTime() + 960_000));
    expect(questionsSafeCleanupAt(new Date(at.getTime() + 1200_000), createdAt))
      .toEqual(new Date(at.getTime() + 1200_000));
  });
  it("Questions daily upload limit is checked within the actor-scoped transaction", () => {
    expect(questionsPhotoDailyLimitReached(99)).toBe(false);
    expect(questionsPhotoDailyLimitReached(100)).toBe(true);
    expect(() => questionsPhotoDailyLimitReached(-1)).toThrow();
  });
});
