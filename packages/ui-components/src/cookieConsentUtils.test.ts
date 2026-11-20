import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_CHANGE_EVENT, COOKIE_CONSENT_STORAGE_KEY,
  getConsentValue, resetCookieConsent, setConsentValue,
} from "./cookieConsentUtils";

afterEach(() => vi.unstubAllGlobals());

function localBrowser() {
  const storage = new Map<string, string>();
  const dispatched: Array<{ type: string; detail: unknown }> = [];
  class TestCustomEvent {
    constructor(readonly type: string, readonly options?: { detail: unknown }) {}
    get detail() { return this.options?.detail; }
  }
  vi.stubGlobal("window", {
    dispatchEvent: (event: TestCustomEvent) => {
      dispatched.push({ type: event.type, detail: event.detail });
      return true;
    },
  });
  vi.stubGlobal("CustomEvent", TestCustomEvent);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  return { storage, dispatched };
}

describe("cookie consent public contract", () => {
  it("does not touch browser storage or dispatch during server rendering", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
    expect(getConsentValue()).toBeNull();
    setConsentValue("accepted");
    resetCookieConsent();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });
  it("accepts only explicit accepted/declined values, not arbitrary stored strings", () => {
    const { storage } = localBrowser();
    storage.set(COOKIE_CONSENT_STORAGE_KEY, "yes");
    expect(getConsentValue()).toBeNull();
    storage.set(COOKIE_CONSENT_STORAGE_KEY, "declined");
    expect(getConsentValue()).toBe("declined");
    setConsentValue("accepted");
    expect(getConsentValue()).toBe("accepted");
  });
  it("broadcasts accepted and cleared consent, without leaving stale storage", () => {
    const { storage, dispatched } = localBrowser();
    setConsentValue("accepted");
    resetCookieConsent();
    expect(storage.has(COOKIE_CONSENT_STORAGE_KEY)).toBe(false);
    expect(dispatched).toEqual([
      { type: COOKIE_CONSENT_CHANGE_EVENT, detail: { value: "accepted" } },
      { type: "gafus:cookieConsentReset", detail: undefined },
      { type: COOKIE_CONSENT_CHANGE_EVENT, detail: { value: null } },
    ]);
  });
});
