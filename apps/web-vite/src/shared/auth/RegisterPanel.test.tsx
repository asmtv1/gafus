// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterPanel } from "./RegisterPanel";
import { CURRENT_USER_QUERY_KEY, EXPLICIT_LOGIN_QUERY_KEY } from "./useAuth";

const ATTEMPT_KEY = "gafus.registration.temp-session-id.v1";
const ATTEMPT = "9d7ca270-0e15-4e37-a0f9-9c62529c63d2";
const user = { id: "new-user", username: "gafus_user", role: "USER" };
let container: HTMLDivElement;
let root: Root;
let cache: QueryClient;
const onCancel = vi.fn();

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  window.sessionStorage.setItem(ATTEMPT_KEY, ATTEMPT);
  window.localStorage.clear();
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: cache },
    createElement(RegisterPanel, { onCancel }),
  )));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  cache.clear();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>("#" + id)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function check(id: string) {
  await act(async () => container.querySelector<HTMLInputElement>("#" + id)!.click());
}

async function submit() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}

async function validForm() {
  await fill("registration-name", "GAFUS_USER");
  await fill("registration-email", "Example@Example.org");
  await fill("registration-password", "MyPassword1");
  await fill("registration-confirm-password", "MyPassword1");
  await check("registration-personal-data");
  await check("registration-privacy-policy");
  await check("registration-data-distribution");
}

describe("Vite registration UX with real Hono JSON contract", () => {
  it("links all three legal documents and never prechecks a consent", () => {
    for (const href of ["/personal.html", "/policy.html", "/personal-distribution.html"]) {
      const link = container.querySelector<HTMLAnchorElement>('a[href="' + href + '"]');
      expect(link?.getAttribute("rel")).toContain("noopener");
    }
    const inputs = [...container.querySelectorAll<HTMLInputElement>('[type="checkbox"]')];
    expect(inputs).toHaveLength(3);
    expect(inputs.every(input => !input.checked && input.required)).toBe(true);
  });

  it("refuses consent omissions and password mismatch without contacting the server", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await fill("registration-name", "gafus_user");
    await fill("registration-email", "test@example.org");
    await fill("registration-password", "Password1");
    await fill("registration-confirm-password", "Password2");
    await submit();
    expect(container.textContent).toContain("Пароли не совпадают.");
    await fill("registration-confirm-password", "Password1");
    await submit();
    expect(container.textContent).toContain("все три согласия");
    expect(mock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(ATTEMPT_KEY)).toBe(ATTEMPT);
  });

  it("registers and clears only UUID, never stores password or JWT", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { user },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    cache.setQueryData(["user", "profile", "previous-user"], { private: "stale" });
    await validForm();
    await submit();
    expect(cache.getQueryData(["user", "profile", "previous-user"])).toBeUndefined();
    expect(mock).toHaveBeenCalledOnce();
    const [path, request] = mock.mock.calls[0];
    expect(path).toBe("/api/v1/auth/register");
    expect(request.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
    expect(JSON.parse(request.body)).toEqual({
      name: "gafus_user", email: "example@example.org",
      password: "MyPassword1", tempSessionId: ATTEMPT,
      registrationChannel: "WEB",
      consentPayload: {
        acceptPersonalData: true, acceptPrivacyPolicy: true,
        acceptDataDistribution: true,
      },
    });
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toEqual(user);
    expect(cache.getQueryData(EXPLICIT_LOGIN_QUERY_KEY)).toMatchObject(user);
    expect(window.sessionStorage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(JSON.stringify(cache.getQueryData(CURRENT_USER_QUERY_KEY))).not.toContain("Password");
  });

  it("failed registration retains UUID for retry and does not sign user in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false, error: "Пользователь уже существует",
    }), { status: 409 })));
    await validForm();
    await submit();
    expect(container.textContent).toContain("Пользователь уже существует");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toBeUndefined();
    expect(window.sessionStorage.getItem(ATTEMPT_KEY)).toBe(ATTEMPT);
  });

  it("requires successful promo preview before including the code", async () => {
    const mock = vi.fn().mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/registration-promo-preview")
        ? new Response(JSON.stringify({
            success: true, data: { code: "SAVE10" },
          }), { status: 200 })
        : new Response(JSON.stringify({ success: true, data: { user } }), { status: 200 }),
    ));
    vi.stubGlobal("fetch", mock);
    await validForm();
    await fill("registration-promo", "save10");
    await submit();
    expect(container.textContent).toContain("Сначала проверьте промокод");
    expect(mock).not.toHaveBeenCalled();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".registration-promo-controls button")?.click();
    });
    expect(mock.mock.calls[0][0]).toBe("/api/v1/auth/registration-promo-preview");
    await submit();
    expect(mock.mock.calls[1][0]).toBe("/api/v1/auth/register");
    expect(JSON.parse(mock.mock.calls[1][1].body).promoCode).toBe("SAVE10");
  });

  it("applies a promo prefilled by a registration deep link", async () => {
    await act(async () => root.unmount());
    window.history.replaceState(null, "", "/register?promoCode=SAVE10");
    root = createRoot(container);
    await act(async () => root.render(createElement(
      QueryClientProvider, { client: cache },
      createElement(RegisterPanel, { onCancel }),
    )));
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { code: "SAVE10" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    expect(container.querySelector<HTMLInputElement>("#registration-promo")?.value)
      .toBe("SAVE10");
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".registration-promo-controls button")?.click();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(mock).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Промокод SAVE10 применён.");
    expect(container.textContent).not.toContain("Проверяем промокод…");
    window.history.replaceState(null, "", "/");
  });

  it("ignores stale promo responses after the user edits the promo code", async () => {
    let resolvePreview: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((path: string) => {
      if (path.endsWith("/registration-promo-preview")) {
        return new Promise<Response>(resolve => { resolvePreview = resolve; });
      }
      throw new Error("Unexpected registration request");
    });
    vi.stubGlobal("fetch", fetchMock);
    await validForm();
    await fill("registration-promo", "OLD");
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".registration-promo-controls button")?.click();
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    await fill("registration-promo", "NEW");
    await act(async () => {
      resolvePreview?.(new Response(JSON.stringify({
        success: true, data: { code: "OLD" },
      }), { status: 200 }));
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    expect(container.querySelector<HTMLInputElement>("#registration-promo")?.value).toBe("NEW");
    await submit();
    expect(container.textContent).toContain("Сначала проверьте промокод");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns to login via cancel without calling the backend", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await act(async () => {
      const back = [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.includes("Войти"));
      back?.click();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
