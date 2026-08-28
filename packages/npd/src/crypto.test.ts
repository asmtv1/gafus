import { describe, expect, it } from "vitest";
import { decryptRefreshToken, encryptRefreshToken, loadTokenKeyring, rotateRefreshToken } from "./crypto.js";

const old = Buffer.alloc(32, 1).toString("base64");
const fresh = Buffer.alloc(32, 2).toString("base64");
describe("refresh-token envelope", () => {
  it("encrypts AES-256-GCM and rotates using only the versioned NPD keyring", () => {
    const v1 = loadTokenKeyring(`1:${old}`);
    const envelope = encryptRefreshToken("refresh-secret", v1);
    const v2 = loadTokenKeyring(`2:${fresh},1:${old}`);
    const rotated = rotateRefreshToken(envelope, v2)!;
    expect(rotated.keyVersion).toBe(2);
    expect(decryptRefreshToken(rotated, v2)).toBe("refresh-secret");
    expect(() => decryptRefreshToken(envelope, loadTokenKeyring(`2:${fresh}`))).toThrow("unavailable");
  });
  it("rejects weak or malformed key material", () => expect(() => loadTokenKeyring("not-a-key")).toThrow("AES-256"));
});
