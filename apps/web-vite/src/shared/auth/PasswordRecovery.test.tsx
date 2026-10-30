// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";

beforeAll(async () => { await import("./PasswordRecovery"); });
let container: HTMLDivElement;
let cache: QueryClient;
let root: ReturnType<typeof createRoot>;
const originalPath = "/";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  container.remove();
  window.history.replaceState(null, "", originalPath);
  vi.unstubAllGlobals();
});

async function mount(url: string) {
  window.history.replaceState(null, "", url);
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache }, createElement(App),
  )));
  // React.lazy can settle separately from its route-specific React state.
  const field = url.startsWith("/passwordReset") ? "recovery-email" : "recovery-token";
  for (let i=0; i<15 && !container.querySelector("#"+field); i++) {
    await act(async () => { await new Promise(done=>setTimeout(done,35)); });
  }
  expect(container.querySelector("#"+field)).not.toBeNull();
}

async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>("#" + id)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector("form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}

describe("two standalone password-recovery paths", () => {
  it("renders email flow without exposing whether a user exists", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, message: "OK",
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await mount("/passwordReset");
    expect(container.textContent).toContain("Сброс пароля");
    expect(container.querySelector('a.gafus-reset-back[href="/login"]')?.textContent)
      .toContain("Вернуться ко входу");
    const cancel = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href="/login"]'))
      .find(link => link.textContent?.trim() === "Отмена");
    expect(cancel?.getAttribute("data-gafus-shared-button")).toBe("secondary");
    expect(cancel?.getAttribute("data-gafus-variant")).toBe("red");
    expect(mock).not.toHaveBeenCalled();
    await fill("recovery-email", "Person@Example.org");
    await submit();
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({
      email: "person@example.org",
    });
    expect(container.textContent).toContain("Если аккаунт с таким email существует");
  });

  it("removes token from URL and submits strong new password without storage", async () => {
    const token = "a".repeat(40);
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await mount("/reset-password?token=" + token);
    expect(window.location.search).toBe("");
    expect(container.querySelector<HTMLInputElement>("#recovery-token")?.value).toBe(token);
    await fill("recovery-password", "Password1");
    await fill("recovery-confirm", "Password1");
    await submit();
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({
      token, password: "Password1",
    });
    expect(container.textContent).toContain("Пароль обновлён");
    expect(container.querySelector('a[href="/login"]')?.textContent).toContain("ко входу");
    expect(container.querySelector<HTMLInputElement>("#recovery-password")).toBeNull();
    expect(cache.getQueryData(["auth", "me"])).toBeUndefined();
  });

  it("refuses weak passwords and mismatched confirmation without sending token", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await mount("/reset-password");
    await fill("recovery-token", "a".repeat(40));
    await fill("recovery-password", "weakpassword");
    await fill("recovery-confirm", "weakpassword");
    await submit();
    expect(container.textContent).toContain("Пароль: 8–100");
    expect(mock).not.toHaveBeenCalled();
    await fill("recovery-password", "Password1");
    await submit();
    expect(container.textContent).toContain("Пароли не совпадают");
    expect(mock).not.toHaveBeenCalled();
  });
});
