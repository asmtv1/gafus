// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPanel } from "./SubscriptionPanels";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: mock.request,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));
let root: Root, host: HTMLDivElement;
let onSaved: ReturnType<typeof vi.fn<() => void>>;
function subscription(tab: "payments" | "promo-codes" | "npd") {
  return {
    role: "ADMIN" as const,
    dashboard: tab === "payments" ? {} : null,
    paymentHistory: tab === "payments" ? {
      items: [], page: 2, pageSize: 50, total: 150, totalPages: 3,
    } : null,
    promoCodes: tab === "promo-codes" ? [] : null,
    npd: tab === "npd" ? {
      items: [], page: 2, pageSize: 25, total: 75, backlog: 0,
      connection: { status: "connected" },
    } : null,
  };
}
async function render(tab: "payments" | "promo-codes" | "npd", initialSearch: string) {
  await act(async () => root.render(<SubscriptionPanel source={subscription(tab)}
    tab={tab} initialSearch={initialSearch} onSaved={onSaved} canManage />));
}
async function press(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeDefined();
  await act(async () => button?.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mock.request.mockReset();
  onSaved = vi.fn<() => void>();
  vi.stubGlobal("confirm", vi.fn(() => true));
  window.history.replaceState(null, "", "/main-panel/app-subscriptions");
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/main-panel");
});

describe("Next filters: actual subscription table components", () => {
  it("payment deep link restores editable filters and commits confirmed page into address", async () => {
    const state = "tab=payments&paymentPage=2&paymentPageSize=50&paymentStatus=SUCCEEDED&paymentSearch=dog";
    window.history.replaceState(null, "", `?${state}`);
    mock.request.mockResolvedValue({
      paymentHistory: {items: [], page: 3, pageSize: 50, total: 150, totalPages: 3},
    });
    await render("payments", state);
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Пользователь, промокод, ID"]');
    expect(search?.value).toBe("dog");
    expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("SUCCEEDED");
    await press("Дальше");
    expect(mock.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/app-subscriptions?tab=payments&paymentPage=3&paymentPageSize=50&paymentSearch=dog&paymentStatus=SUCCEEDED",
    );
    expect(window.location.search).toContain("paymentPage=3");
    expect(window.location.search).toContain("paymentStatus=SUCCEEDED");
  });

  it("NPD deep-link dates/status/search are editable and preserved after confirmed GET", async () => {
    const state = "tab=npd&npdPage=2&npdPageSize=25&npdStatus=FAILED&npdFrom=2026-10-01&npdTo=2026-10-25&npdSearch=dog";
    window.history.replaceState(null, "", `?${state}`);
    mock.request.mockResolvedValue({
      npd: {items: [], page: 1, pageSize: 25, total: 75, backlog: 0, connection: null},
    });
    await render("npd", state);
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-10-01");
    expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("FAILED");
    await press("Найти");
    expect(mock.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/app-subscriptions?tab=npd&npdPage=1&npdPageSize=25&npdSearch=dog&npdStatus=FAILED&npdFrom=2026-10-01&npdTo=2026-10-25",
    );
    expect(window.location.search).toContain("npdStatus=FAILED");
    expect(window.location.search).toContain("npdFrom=2026-10-01");
  });

  it("promo create unknown ACK requires fresh readback before any retry", async () => {
    mock.request.mockRejectedValueOnce(new Error("Lost HTTP ACK"));
    await render("promo-codes", "tab=promo-codes");
    const input = host.querySelector<HTMLInputElement>('input[pattern="[A-Za-z0-9_-]+"]');
    expect(input).not.toBeNull();
    await act(async () => {
      if (input) {
        // React input uses its native value setter for synthetic change.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "PROMO25");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const form = host.querySelector<HTMLFormElement>("form.subscription-form");
    expect(form).not.toBeNull();
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles:true, cancelable:true })));
    expect(mock.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/app-subscriptions/promo-codes", {
        method: "POST", body: { code: "PROMO25", discountPercent: 10, isActive: true },
      },
    );
    expect(host.textContent).toContain("Результат изменения промокода неизвестен");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Создать")?.disabled).toBe(true);
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles:true, cancelable:true })));
    expect(mock.request).toHaveBeenCalledTimes(1);
    await press("Сверить промокоды с сервером");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("NPD unknown POST requires confirmed GET and never blind retries", async () => {
    const npd = subscription("npd");
    // Keep fixture's item type explicit without deriving never[] from [] literals.
    const receipt = {
      id:"receipt1", paymentId:"pay1", user:{username:"owner",fullName:null},
      planCode:"MONTH",amountRub:500,currency:"RUB",status:"FAILED",operationAt:"2026-10-25T08:00:00Z",
    };
    const withReceipt = { ...npd, npd: { ...npd.npd!, items: [receipt] } };
    mock.request.mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({ npd: withReceipt.npd });
    await act(async () => root.render(<SubscriptionPanel source={withReceipt} tab="npd"
      initialSearch="tab=npd" onSaved={onSaved} canManage />));
    await press("Повторить");
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Результат операции НПД неизвестен");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Повторить");
    expect(retry?.disabled).toBe(true);
    await press("Сверить чеки с сервером");
    expect(mock.request).toHaveBeenCalledTimes(2);
    expect(mock.request).toHaveBeenNthCalledWith(2,
      "/api/v1/admin/app-subscriptions?tab=npd&npdPage=2&npdPageSize=25");
    expect(host.textContent).not.toContain("Результат операции НПД неизвестен");
    expect(retry?.disabled).toBe(false);
  });

  it("NPD accepts POST but fails readback: blocks the next write until GET succeeds", async () => {
    const npd = subscription("npd");
    const receipt = {
      id: "receipt1", paymentId: "pay1", user: {username: "owner", fullName: null},
      planCode: "MONTH", amountRub: 500, currency: "RUB", status: "FAILED",
      operationAt: "2026-10-25T08:00:00Z",
    };
    const withReceipt = { ...npd, npd: { ...npd.npd!, items: [receipt] } };
    mock.request.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("GET unavailable"))
      .mockResolvedValueOnce({npd: withReceipt.npd});
    await act(async () => root.render(<SubscriptionPanel source={withReceipt} tab="npd"
      initialSearch="tab=npd" onSaved={onSaved} canManage />));
    await press("Повторить");
    expect(mock.request).toHaveBeenCalledTimes(2);
    expect(mock.request).toHaveBeenNthCalledWith(1,
      "/api/v1/admin/app-subscriptions/npd/receipt1/retry", {method: "POST"});
    expect(mock.request).toHaveBeenNthCalledWith(2,
      "/api/v1/admin/app-subscriptions?tab=npd&npdPage=2&npdPageSize=25");
    expect(host.textContent).toContain("GET unavailable");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Повторить");
    expect(retry?.disabled).toBe(true);
    await press("Сверить чеки с сервером");
    expect(mock.request).toHaveBeenCalledTimes(3);
    expect(retry?.disabled).toBe(false);
  });

  it("promo archive direct link is checked; switching archive fetches before URL changes", async () => {
    window.history.replaceState(null,"","?tab=promo-codes&includeArchived=1");
    mock.request.mockResolvedValue({promoCodes:[]});
    await render("promo-codes","tab=promo-codes&includeArchived=1");
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    await act(async () => toggle?.click());
    expect(mock.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/app-subscriptions?tab=promo-codes",
    );
    expect(window.location.search).toBe("?tab=promo-codes");
    expect(toggle?.checked).toBe(false);
  });
});
