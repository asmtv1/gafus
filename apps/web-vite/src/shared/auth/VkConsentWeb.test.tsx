// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "./useAuth";

let node: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  node?.remove();
  node = null;
  root = null;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("VK Web first registration consent must be explicit", () => {
  it("public GET does not check /me; all three checked before credential grant request", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", "/vk-consent");
    const calls: { path: string; init: RequestInit }[] = [];
    const fetcher = vi.fn(async (path: string, init: RequestInit) => {
      calls.push({ path, init });
      if (path === "/api/v1/auth/vk-web/consent" && init.method === "GET") {
        return new Response(JSON.stringify({ success: true, data: { selectedPromoCode: null } }), {
          status: 200,
        });
      }
      if (path === "/api/v1/auth/vk-web/consent" && init.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            data: { user: { id: "new-user", username: "new-user", role: "USER" } },
          }),
          { status: 200 },
        );
      }
      if (path === "/api/v1/courses") {
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () =>
      root!.render(createElement(QueryClientProvider, { client: cache }, createElement(App))),
    );
    for (let i = 0; i < 25 && !node!.querySelector('input[type="checkbox"]'); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    expect(node.textContent).toContain("Завершить регистрацию через VK");
    expect(calls.some((call) => call.path === "/api/v1/auth/me")).toBe(false);
    const form = node.querySelector("form")!;
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(node.textContent).toContain("Подтвердите все три согласия");
    expect(calls.every((call) => call.init.method !== "POST")).toBe(true);
    const checkboxes = [...node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(3);
    for (const checkbox of checkboxes) await act(async () => checkbox.click());
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    for (let i = 0; i < 25 && !calls.some((call) => call.init.method === "POST"); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    const post = calls.find(
      (call) => call.path === "/api/v1/auth/vk-web/consent" && call.init.method === "POST",
    );
    expect(post).toBeDefined();
    expect(post!.init.headers).toMatchObject({ "X-Gafus-Auth-Transport": "cookie" });
    expect(JSON.parse(post!.init.body as string).consentPayload).toEqual({
      acceptPersonalData: true,
      acceptPrivacyPolicy: true,
      acceptDataDistribution: true,
    });
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({ id: "new-user" });
    expect(window.location.pathname).toBe("/courses");
    cache.clear();
  });
});
