import { describe, expect, it } from "vitest";
import { clearRegistrationAttempt, registrationAttemptId } from "./registrationSession";

const A = "9d7ca270-0e15-4e37-a0f9-9c62529c63d2";
const B = "c4320ed2-52c4-4edc-b843-f05bd5a9aadd";

describe("registration idempotency key (not credentials)", () => {
  it("preserves the same verified UUID across retries and clears on completion", () => {
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
    };
    expect(registrationAttemptId(storage, () => A)).toBe(A);
    expect(registrationAttemptId(storage, () => B)).toBe(A);
    expect([...stored.values()]).toEqual([A]);
    clearRegistrationAttempt(storage);
    expect(registrationAttemptId(storage, () => B)).toBe(B);
  });

  it("tolerates unavailable storage without persisting passwords", () => {
    const denied = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(registrationAttemptId(denied, () => A)).toBe(A);
    expect(() => clearRegistrationAttempt(denied)).not.toThrow();
  });

  it("rejects stored junk and non-UUID generated identifiers", () => {
    expect(registrationAttemptId({
      getItem: () => "not-a-uuid",
      setItem: () => undefined,
    }, () => B)).toBe(B);
    expect(() => registrationAttemptId(null, () => "weak-token")).toThrow("Secure UUID");
  });
});
