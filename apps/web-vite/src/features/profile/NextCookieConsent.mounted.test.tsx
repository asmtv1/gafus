// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextCookieConsent } from "./NextCookieConsent";
import { LegacyProfileSettings } from "./LegacyProfileSettings";
import type { ProfileOverview } from "./profileApi";
import {
  COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_CHANGE_EVENT,
  setConsentValue, getConsentValue,
} from "@gafus/ui-components/cookie-consent";

let node: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let cache: QueryClient;
const button = (label:string) => [...node.querySelectorAll("button")]
  .find(b => b.textContent?.includes(label));
const click = async (label:string) => {
  await act(async () => { button(label)?.click(); });
};
async function render(withSettings = false, profile?: ProfileOverview) {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    {withSettings && <LegacyProfileSettings profile={profile} />}
    <NextCookieConsent />
  </QueryClientProvider>));
}
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  node = document.createElement("div"); document.body.append(node);
  root = createRoot(node); cache = new QueryClient();
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); node.remove(); localStorage.clear(); vi.restoreAllMocks();
});

describe("WEB1 original Next cookie-consent semantics on mounted Vite", () => {
  it("web settings omit the nonfunctional About app row and keep useful information links", async () => {
    await render(true);
    const settings = node.querySelector("[data-next-profile-settings]");
    expect(settings).not.toBeNull();
    expect(settings?.textContent).toContain("Информация");
    expect(settings?.textContent).not.toContain("О приложении");
    expect(settings?.querySelector('a[href="/"]')).toBeNull();
    expect(settings?.querySelector('a[href="/policy.html"]')).not.toBeNull();
    expect(settings?.querySelector('a[href="https://t.me/gafusRu"]')).not.toBeNull();
  });
  it("uses original Next set-password route when optional auth flag is absent",async()=>{
    await render(true);
    expect(node.querySelector('a[href="/profile/set-password"]')).not.toBeNull();
    expect(node.querySelector('a[href="/profile/change-password"]')).toBeNull();
    await render(true,{username:"owner",hasAppPassword:true} as ProfileOverview);
    expect(node.querySelector('a[href="/profile/change-password"]')).not.toBeNull();
    expect(node.querySelector('a[href="/profile/set-password"]')).toBeNull();
    expect(node.querySelector('a[href="/passwordReset"]')).not.toBeNull();
    await render(true,{username:"owner",hasAppPassword:false} as ProfileOverview);
    expect(node.querySelector('a[href="/profile/set-password"]')).not.toBeNull();
    expect(node.querySelector('a[href="/passwordReset"]')).toBeNull();
  });
  it("offers both choices, policy URL, and persists accepted with original change event", async () => {
    const changed = vi.fn(); window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, changed);
    try {
      await render();
      expect(node.querySelector('[role="dialog"]')).not.toBeNull();
      expect(node.querySelector('a[href="/cookies.html"]')).not.toBeNull();
      expect(button("Отклонить")).toBeDefined();
      await click("Принять");
      expect(getConsentValue()).toBe("accepted");
      expect(changed).toHaveBeenCalledTimes(1);
      expect(node.querySelector('[role="dialog"]')).toBeNull();
    } finally { window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, changed); }
  });
  it("declined is durable and does not re-open the banner on remount", async () => {
    await render(); await click("Отклонить");
    expect(getConsentValue()).toBe("declined");
    await render();
    expect(node.querySelector('[role="dialog"]')).toBeNull();
  });
  it("settings reset reopens dialog without page reload, then accepts new choice", async () => {
    setConsentValue("accepted");
    await render(true);
    expect(node.querySelector('[role="dialog"]')).toBeNull();
    expect(button("Управление cookies")).toBeDefined();
    await click("Управление cookies");
    expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBeNull();
    expect(node.querySelector('[role="dialog"]')).not.toBeNull();
    await click("Отклонить");
    expect(getConsentValue()).toBe("declined");
    expect(node.querySelector('[role="dialog"]')).toBeNull();
  });
  it("change in another tab reopens when consent is cleared", async () => {
    setConsentValue("accepted"); await render();
    localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", {
      key: COOKIE_CONSENT_STORAGE_KEY, oldValue:"accepted", newValue:null,
    })));
    expect(node.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it("storage write rejection cannot be presented as a successful consent", async () => {
    await render();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "SecurityError");
    });
    await click("Принять");
    expect(node.querySelector('[role="dialog"]')).not.toBeNull();
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Браузер не разрешил");
    expect(getConsentValue()).toBeNull();
    spy.mockRestore();
  });
});
