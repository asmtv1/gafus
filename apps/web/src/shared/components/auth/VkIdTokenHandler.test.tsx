// @vitest-environment jsdom
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), replace: vi.fn(), refresh: vi.fn(), track: vi.fn(), query: "vk_id_token=one-use", path: "/courses" }));
vi.mock("next-auth/react", () => ({ signIn: mocks.signIn }));
vi.mock("@gafus/analytics", () => ({ trackEvent: mocks.track }));
const router = { replace: mocks.replace, refresh: mocks.refresh };
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path, useSearchParams: () => new URLSearchParams(mocks.query), useRouter: () => router }));
import { VkIdTokenHandler } from "./VkIdTokenHandler";
let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); mocks.query = "vk_id_token=one-use"; mocks.path = "/courses"; root = createRoot(document.createElement("div")); });
afterEach(async () => { await act(async () => root.unmount()); });
async function render() { await act(async () => root.render(<StrictMode><VkIdTokenHandler /></StrictMode>)); }
it("exchanges a single-use token once under StrictMode", async () => {
 mocks.signIn.mockResolvedValue({ ok: true }); await render();
 expect(mocks.signIn).toHaveBeenCalledTimes(1); expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/courses", { scroll: false });
});
it("handles a rejected exchange with a visible login error route", async () => {
 mocks.signIn.mockRejectedValue(new Error("offline")); await render();
 expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login?error=vk_id_auth_failed");
});
it("does not navigate after the user left the callback route", async () => {
 let release!: (value: unknown) => void; mocks.signIn.mockImplementation(() => new Promise(resolve => { release = resolve; }));
 await render(); mocks.path = "/login"; await render(); await act(async () => release({ ok: true }));
 expect(mocks.replace).not.toHaveBeenCalled();
});
it("ignores tokens on unrelated pages", async () => {
 mocks.path = "/"; await render(); expect(mocks.signIn).not.toHaveBeenCalled();
});
