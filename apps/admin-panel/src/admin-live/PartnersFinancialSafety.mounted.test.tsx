// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnersPanel } from "./PartnersPanel";
import { AdminHttpError } from "./api";

const fake = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: fake.request,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));
const id = "synthetic-partner-qa";
const summary = {
  id, username: "qa-partner", fullName: "Synthetic QA", email: null,
  referralCode: "ONLY_QA", isActive: false, referrals: 0,
  earnedRub: 250, reservedRub: 0, availableRub: 250, availableKopecks: 25000,
};
const detail = { ...summary, referrals: [], commissions: [], payouts: [] };
let root: Root;
let host: HTMLDivElement;
let saved: ReturnType<typeof vi.fn<() => void>>;
async function mount() {
  await act(async () => root.render(<PartnersPanel source={[summary]}
    initialPartnerId={id} onSaved={saved} onNavigate={vi.fn()} />));
}
function button(label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find(node =>
    node.textContent?.trim() === label);
}
async function click(label: string) {
  const node = button(label);
  expect(node).toBeDefined();
  await act(async () => node?.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  saved = vi.fn();
  fake.request.mockReset();
  fake.request.mockResolvedValueOnce(detail);
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Partner financial payouts: lost ACK protection", () => {
  it("locks unknown outcome, rejects blind retry and requires authoritative balance GET", async () => {
    fake.request.mockRejectedValueOnce(new Error("Lost HTTP ACK"));
    fake.request.mockResolvedValueOnce({ ...detail, availableKopecks: 0, availableRub: 0 });
    await mount();
    await click("Отметить весь баланс выплаченным");
    expect(fake.request).toHaveBeenNthCalledWith(2,
      `/api/v1/admin/partners/${id}/mark-paid`, { method: "POST" });
    expect(host.textContent).toContain("Результат выплаты неизвестен");
    expect(button("Отметить весь баланс выплаченным")?.disabled).toBe(true);
    await click("Отметить весь баланс выплаченным");
    expect(fake.request).toHaveBeenCalledTimes(2);
    await click("Перечитать баланс перед выплатой");
    expect(fake.request).toHaveBeenNthCalledWith(3, `/api/v1/admin/partners/${id}`);
    expect(host.textContent).toContain("Баланс получен с сервера");
    expect(button("Перечитать баланс перед выплатой")).toBeUndefined();
    expect(button("Отметить весь баланс выплаченным")?.disabled).toBe(true);
    expect(saved).not.toHaveBeenCalled();
  });
  it("explicit HTTP 409 does not cause unknown-outcome lock", async () => {
    fake.request.mockRejectedValueOnce(new AdminHttpError(409, "CONFLICT", "Баланс уже выплачен"));
    await mount();
    await click("Отметить весь баланс выплаченным");
    expect(host.textContent).toContain("Баланс уже выплачен");
    expect(button("Отметить весь баланс выплаченным")?.disabled).toBe(false);
    expect(button("Перечитать баланс перед выплатой")).toBeUndefined();
    expect(saved).not.toHaveBeenCalled();
  });
  it("successful receipt reloads detail through the parent once", async () => {
    fake.request.mockResolvedValueOnce({ amountKopecks: 25000 });
    await mount();
    await click("Отметить весь баланс выплаченным");
    expect(fake.request).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledTimes(1);
    // A stale UI must never allow a second ledger write before fresh GET.
    expect(button("Отметить весь баланс выплаченным")?.disabled).toBe(true);
  });
});
