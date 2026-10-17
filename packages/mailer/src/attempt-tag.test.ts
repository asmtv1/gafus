import { describe, expect, it } from "vitest";
import { attemptIdFromTag, attemptTagFromId } from "./attempt-tag.js";

describe("Resend webhook correlation tags", () => {
  it("roundtrips identifiers safely without leaking the original string as-is", () => {
    const id = "consultation-cm-test_01";
    const tag = attemptTagFromId(id);
    expect(tag).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(tag).not.toBe(id);
    expect(attemptIdFromTag(tag)).toBe(id);
  });

  it("does not attach invalid or oversized tags to outgoing email", () => {
    expect(attemptTagFromId("")).toBeUndefined();
    expect(attemptTagFromId("x".repeat(193))).toBeUndefined();
    expect(attemptIdFromTag("invalid!tag")).toBeUndefined();
    expect(attemptIdFromTag("not-a-canonical-tag")).toBeUndefined();
  });

  it("roundtrips UTF-8 values without accepting malformed base64url tags", () => {
    const id = "код-123";
    expect(attemptIdFromTag(attemptTagFromId(id))).toBe(id);
    expect(attemptIdFromTag("////")).toBeUndefined();
    expect(attemptIdFromTag("a")).toBeUndefined();
  });
});
