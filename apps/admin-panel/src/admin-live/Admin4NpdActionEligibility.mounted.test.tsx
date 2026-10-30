// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubscriptionPanel } from "./SubscriptionPanels";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
function page(items: Record<string, unknown>[]) {
  return {
    role: "ADMIN" as const, dashboard: null, paymentHistory: null, promoCodes: null,
    npd: { items, page: 1, pageSize: 25, total: items.length, backlog: 0, connection: null },
  };
}
function receipt(status: string, eligibility: Record<string, boolean>) {
  return {
    id: "safe-receipt-1", paymentId: "safe-payment-1",
    user: { username: "testowner", fullName: null },
    planCode: "MONTHLY", amountRub: 100, currency: "RUB",
    status, operationAt: "2026-10-25T10:00:00Z",
    ...eligibility,
  };
}

describe("ADMIN-4 NPD action availability reflects Core operation CAS state", () => {
  it("does not offer duplicate retry if the failed receipt is already queued", async () => {
    await act(async () => root.render(
      <SubscriptionPanel source={page([receipt("FAILED", { canRetry: false })])}
        tab="npd" canManage onSaved={() => undefined} />,
    ));
    expect(host.textContent).toContain("Повтор уже запланирован");
    expect([...host.querySelectorAll("button")].some((el) => el.textContent === "Повторить")).toBe(false);
  });
  it("does not offer duplicate reconciliation if one was already requested", async () => {
    await act(async () => root.render(
      <SubscriptionPanel
        source={page([receipt("RECONCILIATION_REQUIRED", { canReconcile: false })])}
        tab="npd" canManage onSaved={() => undefined} />,
    ));
    expect(host.textContent).toContain("Сверка уже запрошена");
    expect([...host.querySelectorAll("button")].some((el) => el.textContent === "Сверка")).toBe(false);
  });
  it("still renders permitted actions for pending operator decisions", async () => {
    await act(async () => root.render(
      <SubscriptionPanel source={page([receipt("FAILED", { canRetry: true })])}
        tab="npd" canManage onSaved={() => undefined} />,
    ));
    expect([...host.querySelectorAll("button")].some((el) => el.textContent === "Повторить")).toBe(true);
  });
});
