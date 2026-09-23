// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { isAuthenticated: false, pendingVkConsent: false, pendingVkPhone: false }, path: "/intro", read: vi.fn(), installed: vi.fn() }));
vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => <div data-redirect={href} />,
  usePathname: () => mocks.path,
  Stack: Object.assign(() => <div data-stack />, { Screen: () => null }),
}));
vi.mock("@/shared/stores", () => ({ useAuthStore: (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth) }));
vi.mock("@/shared/lib/mobile-intro-state", () => ({ readMobileIntroState: mocks.read }));
vi.mock("expo-application", () => ({ getInstallationTimeAsync: mocks.installed }));
import Index from "../../../app/index";
import AuthLayout from "../../../app/(auth)/_layout";
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.auth = { isAuthenticated: false, pendingVkConsent: false, pendingVkPhone: false }; mocks.path = "/intro";
  mocks.read.mockReset().mockResolvedValue({ index: 0, finished: false });
  mocks.installed.mockReset().mockResolvedValue(new Date("2026-09-20T00:00:00Z"));
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
async function render(node: React.ReactNode) { await act(async () => root.render(node)); return container.querySelector("[data-redirect]")?.getAttribute("data-redirect"); }
describe("mobile intro route guards", () => {
  it("opens first-run intro for new installations", async () => { expect(await render(<Index />)).toBe("/(auth)/intro"); });
  it("preserves welcome on old installations", async () => { mocks.installed.mockResolvedValue(new Date("2026-08-01")); expect(await render(<Index />)).toBe("/welcome"); });
  it("does not reopen a finished intro", async () => { mocks.read.mockResolvedValue({ index: 5, finished: true }); expect(await render(<Index />)).toBe("/welcome"); });
  it("handles a failed storage read without an empty screen", async () => { mocks.read.mockRejectedValue(new Error("disk")); expect(await render(<Index />)).toBe("/welcome"); });
  it("does not hold an authenticated user behind storage", async () => { mocks.auth.isAuthenticated = true; mocks.read.mockReturnValue(new Promise(() => {})); expect(await render(<Index />)).toBe("/(main)/(tabs)"); });
  it.each(["pendingVkConsent", "pendingVkPhone"] as const)("keeps %s ahead of the intro", async key => { mocks.auth[key] = true; expect(await render(<Index />)).toBe(key === "pendingVkConsent" ? "/vk-consent" : "/vk-set-phone"); });
  it("allows an authenticated profile replay", async () => { mocks.auth.isAuthenticated = true; expect(await render(<AuthLayout />)).toBeUndefined(); expect(container.querySelector('[data-stack]')).not.toBeNull(); });
  it("redirects an authenticated user away from login", async () => { mocks.auth.isAuthenticated = true; mocks.path = "/login"; expect(await render(<AuthLayout />)).toBe("/(main)/(tabs)"); });
});
