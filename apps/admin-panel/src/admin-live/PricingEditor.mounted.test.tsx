// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PricingEditor } from "./SettingsEditors";

const fake = vi.hoisted(() => ({ requestAdmin: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: fake.requestAdmin,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));

const plans = {
  twoWeeksEnabled: false, yookassaTwoWeeksPriceRub: 1185, twoWeeksIntervalDays: 14,
  monthlyEnabled: true, yookassaMonthlyPriceRub: 1465, monthlyIntervalDays: 30,
  threeMonthsEnabled: false, yookassaThreeMonthsPriceRub: 2470, threeMonthsIntervalDays: 90,
  monthlyAppleProductId: null,
};
let root: Root;
let host: HTMLDivElement;
let saved: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  saved = vi.fn();
  fake.requestAdmin.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(canChange = true, source: unknown = plans) {
  await act(async () => root.render(
    <PricingEditor source={source} onSaved={saved} canChange={canChange} />,
  ));
}
async function submit() {
  const form = host.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () =>
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((node) => node.textContent?.trim() === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

describe("ADMIN-1 Next /admin pricing parity", () => {
  it("shows original Next plan titles and a read-only form to MODERATOR", async () => {
    await mount(false);
    expect(host.textContent).toContain("Настройки тарифов Premium");
    expect(host.textContent).toContain("Самостоятельный");
    expect(host.textContent).toContain("Поддержка в чате");
    expect(host.textContent).toContain("Полное сопровождение");
    expect(host.textContent).toContain("Только ADMIN может изменять");
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await submit();
    expect(fake.requestAdmin).not.toHaveBeenCalled();
    expect(globalThis.confirm).not.toHaveBeenCalled();
  });

  it("persists prices once and re-reads a valid Hono server snapshot", async () => {
    fake.requestAdmin.mockResolvedValueOnce({ updated: true });
    fake.requestAdmin.mockResolvedValueOnce(plans);
    await mount(true);
    await submit();
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      1, "/api/v1/admin/settings/subscriptions",
      { method: "PUT", body: plans },
    );
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      2, "/api/v1/admin/settings/subscriptions",
    );
    expect(saved).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Настройки тарифов сохранены");
  });

  it("does not blindly retry a timed-out PUT and allows only GET verification", async () => {
    fake.requestAdmin.mockRejectedValueOnce(new Error("Network ACK lost"));
    fake.requestAdmin.mockResolvedValueOnce(plans);
    await mount(true);
    await submit();
    expect(host.textContent).toContain("Результат изменения тарифов неизвестен");
    await submit();
    expect(fake.requestAdmin).toHaveBeenCalledTimes(1);
    await click("Перечитать тарифы на сервере");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(fake.requestAdmin).toHaveBeenLastCalledWith(
      "/api/v1/admin/settings/subscriptions",
    );
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed readback and still requires verification before another PUT", async () => {
    fake.requestAdmin.mockResolvedValueOnce({ updated: true });
    fake.requestAdmin.mockResolvedValueOnce({ wrong: "snapshot" });
    await mount(true);
    await submit();
    expect(host.textContent).toContain("Результат изменения тарифов неизвестен");
    await submit();
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(saved).not.toHaveBeenCalled();
  });

  it("fails closed for incomplete or negative pricing settings", async () => {
    await mount(true, { ...plans, yookassaTwoWeeksPriceRub: -1 });
    expect(host.textContent).toContain("Некорректный формат настроек тарифов");
    expect(host.querySelector("form")).toBeNull();
  });
});
