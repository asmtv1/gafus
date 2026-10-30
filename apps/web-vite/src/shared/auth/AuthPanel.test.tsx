// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPanel } from "./AuthPanel";
import { CURRENT_USER_QUERY_KEY } from "./useAuth";

const user = { id: "mock-1", username: "gafus_user", role: "USER" as const };
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  client.clear();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(AuthPanel)));
  });
  await flush();
}

describe("GAFUS Vite auth UI", () => {
  it("renders a guest login form after mock backend rejects cookie refresh", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 403 }));
    vi.stubGlobal("fetch", mock);
    await mount();
    expect(container.querySelector("#login-name")).toBeTruthy();
    expect(container.querySelector("#login-password")).toBeTruthy();
    expect(container.textContent).toContain("Войти");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(container.textContent).not.toContain("undefined");
  });

  it("submits login and displays user without saving JWT in browser storage", async () => {
    const fake = vi.fn().mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/me")
        ? new Response(JSON.stringify({ success: false }), { status: 401 })
        : path.endsWith("/refresh")
          ? new Response(JSON.stringify({ success: false }), { status: 401 })
          : new Response(JSON.stringify({ success: true, data: { user } }), { status: 200 }),
    ));
    vi.stubGlobal("fetch", fake);
    await mount();
    client.setQueryData(["user", "profile", "old-account"], { private: "stale" });
    const name = container.querySelector<HTMLInputElement>("#login-name")!;
    const password = container.querySelector<HTMLInputElement>("#login-password")!;
    const typeText = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      typeText(name, "gafus_user");
      typeText(password, "example-password");
    });
    await act(async () => {
      container.querySelector<HTMLFormElement>("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await flush();
    expect(fake.mock.calls.some(([path]) => path.endsWith("/login"))).toBe(true);
    expect(container.textContent).toContain("gafus_user");
    expect(client.getQueryData(["user", "profile", "old-account"])).toBeUndefined();
    expect(container.querySelector<HTMLInputElement>("#login-password")).toBeNull();
    expect(JSON.stringify(fake.mock.calls)).not.toContain("Bearer");
  });

  it("shows authenticated identity without touching localStorage", async () => {
    client.setQueryData(CURRENT_USER_QUERY_KEY, user);
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    await mount();
    expect(container.textContent).toContain("gafus_user");
    expect(container.querySelector("button")?.textContent).toContain("Выйти");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(fake).not.toHaveBeenCalled();
  });

  it("stock non-JSON /me HTTP429 is unknown auth state, not an automatic logout", async()=>{
    client.setQueryData(["private","articles","oldActor"],"PRIVATE_NOT_AUTHORIZED_TO_DELETE");
    const mocked=vi.fn().mockResolvedValue(new Response("throttle non-json",{status:429}));
    vi.stubGlobal("fetch",mocked);
    await mount();
    expect(container.textContent).toContain("Слишком много запросов. Попробуйте позже.");
    expect(container.textContent).not.toContain("throttle non-json");
    expect(client.getQueryData(["private","articles","oldActor"]))
      .toBe("PRIVATE_NOT_AUTHORIZED_TO_DELETE");
    expect(mocked).toHaveBeenCalledOnce();
    expect(mocked.mock.calls[0][0]).toBe("/api/v1/auth/me");
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
  it("real stock HTML 429 on logout keeps signed-in principal and private cache", async()=>{
    client.setQueryData(CURRENT_USER_QUERY_KEY,user);
    client.setQueryData(["private","articles","myAccount"],"PRIVATE_ARTICLE_BODY");
    const mocked=vi.fn().mockResolvedValue(new Response(
      "<html>SERVER_BACKEND_PRIVATE_THROTTLE</html>", {status:429,
        headers:{"Content-Type":"text/html"}},
    ));
    vi.stubGlobal("fetch",mocked);
    await mount();
    await act(async()=>container.querySelector<HTMLButtonElement>("button")?.click());
    await flush();
    expect(mocked).toHaveBeenCalledOnce();
    expect(mocked.mock.calls[0][0]).toBe("/api/v1/auth/logout");
    expect(client.getQueryData(CURRENT_USER_QUERY_KEY)).toEqual(user);
    expect(client.getQueryData(["private","articles","myAccount"]))
      .toBe("PRIVATE_ARTICLE_BODY");
    expect(container.textContent).toContain("Слишком много запросов. Попробуйте позже.");
    expect(container.textContent).not.toContain("SERVER_BACKEND_PRIVATE_THROTTLE");
    expect(container.textContent).toContain("gafus_user");
  });
  it("clears private query data only after successful logout", async () => {
    const mock = vi.fn().mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/logout")
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response(JSON.stringify({ success: false }), { status: 401 }),
    ));
    vi.stubGlobal("fetch", mock);
    client.setQueryData(CURRENT_USER_QUERY_KEY, user);
    client.setQueryData(["private", "courses"], ["private-course"]);
    await mount();
    await act(async () => container.querySelector("button")?.click());
    await flush();
    expect(client.getQueryData(["private", "courses"])).toBeUndefined();
    expect(mock.mock.calls.some(([path]) => path === "/api/v1/auth/logout")).toBe(true);
  });
});
