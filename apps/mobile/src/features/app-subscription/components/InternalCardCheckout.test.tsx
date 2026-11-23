// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { InternalCardCheckout } from "./InternalCardCheckout";
const m = vi.hoisted(() => ({
  api: vi.fn(),
  status: vi.fn(),
  browser: vi.fn(),
  report: vi.fn(),
  refresh: vi.fn(),
  refetch: vi.fn(),
  allowed: true,
  rustoreAllowed: false,
  promoEnabled: false,
  promoEligible: true,
  promoChange: vi.fn(),
  plans: [{code: "MONTHLY", title: "Месяц", yookassaPriceRub: 300, intervalDays: 30, enabled: true}] as Array<{
    code:string;title:string;yookassaPriceRub:number;intervalDays:number;enabled:boolean;
    badge?:string;savingsRub?:number;consultationBookingIncluded?:boolean;cynologistChatIncluded?:boolean;
  }>,
  owner: true,
  work: Promise.resolve(),
}));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: m.browser }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { otaNativeFingerprint: "a".repeat(64) } } },
}));
vi.mock("expo-updates", () => ({ updateId: "running-id" }));
vi.mock("@/shared/lib/ota/installationIdentity", () => ({
  ensureOtaInstallationIdentity: async () => "installation",
}));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: m.api }));
vi.mock("../api/appSubscriptionAppleApi", () => ({
  appSubscriptionAppleApi: { getStatus: m.status },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      success: true,
      data: {
        iosRuCardPaymentEnabled: m.allowed,
        androidRustoreCardPaymentEnabled: m.rustoreAllowed,
        promoCode: {entryEnabled:m.promoEnabled,eligible:m.promoEligible},
        savedRegistrationPromoCode: null,
        yookassaPlans: m.plans,
      },
    },
    refetch: m.refetch,
  }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: "div",
  Pressable: ({ children, onPress, disabled }: {
    children?: import("react").ReactNode; onPress?: () => void; disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => createElement("span") }));
vi.mock("expo-image", () => ({ Image: () => createElement("span") }));
vi.mock("react-native-paper", () => ({ Text: "span" }));
vi.mock("@/shared/components/ui", () => ({
  Button: ({ onPress, label, disabled }: { onPress: () => void; label: string; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, label),
  Input: ({value,onChangeText}: {value:string;onChangeText:(value:string)=>void}) => {
    m.promoChange=vi.fn(onChangeText);
    return createElement("input",{value,"aria-label":"Введите промокод"});
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
function render(androidRustore = false) {
  act(() =>
    root.render(
      createElement(InternalCardCheckout, {
        ownerKey: "user-session",
        sameOwner: () => m.owner,
        busy: false,
        withLock: (run: () => Promise<void>) => (m.work = run()),
        refresh: m.refresh,
        report: m.report,
        androidRustore,
      }),
    ),
  );
}
async function press() {
  await act(async () => {
    (Array.from(host.querySelectorAll("button")).find(btn =>
      /Оплатить|Проверить оплату/.test(btn.textContent ?? "")) ??
      host.querySelector("button"))!.click();
    await m.work;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.owner = true;
  m.allowed = true;
  m.rustoreAllowed = false;
  m.promoEnabled = false;
  m.promoEligible = true;
  m.promoChange = vi.fn();
  m.plans = [{code: "MONTHLY", title: "Месяц", yookassaPriceRub: 300, intervalDays: 30, enabled: true}];
  host = document.createElement("div");
  root = createRoot(host);
  m.api.mockResolvedValue({
    success: true,
    data: { confirmationUrl: "https://example.test/payment" },
  });
  m.status.mockResolvedValue({ success: true, data: { hasActiveSubscription: true } });
  m.browser.mockResolvedValue({ type: "success", url: "gafus://subscription-return" });
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});
describe("internal iOS checkout", () => {
  it("keeps RuStore YooKassa and promo UI behind its own signed OTA server flag", () => {
    m.promoEnabled = true;
    m.allowed = true;
    m.rustoreAllowed = false;
    render(true);
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeNull();
    expect(host.textContent).not.toContain("Оплата по СБП");
    m.allowed = false;
    m.rustoreAllowed = true;
    render(true);
    expect(host.textContent).toContain("Оплата по СБП");
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeTruthy();
    m.rustoreAllowed = false;
    render(true);
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeNull();
  });

  it("reproduces the 1.7.2 cards, pricing, badges and selects the chosen plan", async () => {
    m.plans = [
      {code:"TWO_WEEKS",title:"14 дней",yookassaPriceRub:190,intervalDays:14,enabled:true,badge:"TRY"},
      {code:"MONTHLY",title:"Месяц",yookassaPriceRub:400,intervalDays:30,enabled:true,badge:"POPULAR",cynologistChatIncluded:true},
      {code:"THREE_MONTHS",title:"Три месяца",yookassaPriceRub:990,intervalDays:90,enabled:true,badge:"MAX_SAVINGS",savingsRub:210,consultationBookingIncluded:true},
    ];
    render();
    expect(host.textContent).toContain("Оплата по СБП");
    expect(host.textContent).toContain("Популярный");
    expect(host.textContent).toContain("Максимальная экономия");
    expect(host.textContent).toContain("Экономия 210 ₽");
    expect(host.textContent).toContain("Скачивание курсов для офлайн-работы");
    expect(host.textContent).toContain("Чат с кинологом");
    expect(host.textContent).toContain("Запись к кинологу");
    expect(host.textContent).toContain("Оплатить 400 ₽ по СБП");
    const threeMonths = Array.from(host.querySelectorAll("button")).find(btn =>
      btn.textContent?.includes("Три месяца"));
    expect(threeMonths).toBeTruthy();
    await act(async () => { threeMonths?.click(); });
    expect(host.textContent).toContain("Оплатить 990 ₽ по СБП");
    await press();
    expect(m.api).toHaveBeenCalledWith(
      "/api/v1/app-subscription/yookassa/start",
      expect.objectContaining({body:{planCode:"THREE_MONTHS"}}),
    );
  });
  it("restores original promo card and passes server-previewed discount to YooKassa",async()=>{
    m.promoEnabled=true;
    m.api.mockImplementation(async (url:string)=>url.includes("/promo-code/preview")
      ? {success:true,data:{code:"GAFUS20",revision:5,planCode:"MONTHLY",discountPercent:20,
        originalPriceRub:300,discountedPriceRub:240,renewalPriceRub:300,intervalDays:30,currency:"RUB"}}
      : {success:true,data:{confirmationUrl:"https://example.test/payment"}});
    render();
    expect(host.textContent).toContain("Промокод");
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeTruthy();
    await act(async()=>m.promoChange("GAFUS20"));
    await act(async()=>{
      Array.from(host.querySelectorAll("button")).find(x=>x.textContent==="Применить")?.click();
      await Promise.resolve();
    });
    expect(m.api).toHaveBeenCalledWith("/api/v1/app-subscription/promo-code/preview",
      expect.objectContaining({body:{planCode:"MONTHLY",promoCode:"GAFUS20"},
        headers:expect.objectContaining({"X-OTA-Update":"running-id"})}));
    expect(host.textContent).toContain("Сейчас спишется");
    expect(host.textContent).toContain("240 ₽");
    expect(host.textContent).toContain("Скидка действует только на первый платёж");
    await press();
    expect(m.api).toHaveBeenCalledWith("/api/v1/app-subscription/yookassa/start",
      expect.objectContaining({body:{planCode:"MONTHLY",promoCode:{code:"GAFUS20",revision:5}}}));
  });

  it("blocks payment with unverified code and rejects promo UI for ineligible users",async()=>{
    m.promoEnabled=true;
    render();
    await act(async()=>m.promoChange("INVALID"));
    await press();
    expect(m.api).not.toHaveBeenCalledWith("/api/v1/app-subscription/yookassa/start",expect.anything());
    expect(host.textContent).toContain("Примените промокод");
    m.promoEligible=false;
    await act(async()=>render());
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeNull();
  });

  it("does not expose promo for the 14-day plan and invalidates a checked quote on plan change",async()=>{
    m.promoEnabled=true;
    m.plans=[
      {code:"TWO_WEEKS",title:"14 дней",yookassaPriceRub:190,intervalDays:14,enabled:true},
      {code:"MONTHLY",title:"Месяц",yookassaPriceRub:300,intervalDays:30,enabled:true},
    ];
    render();
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeTruthy();
    const short=Array.from(host.querySelectorAll('button')).find(x=>x.textContent?.includes('14 дней'));
    await act(async()=>short?.click());
    expect(host.querySelector('input[aria-label="Введите промокод"]')).toBeNull();
  });
  it("opens the selected plan once, waits for the server, refreshes paid access", async () => {
    render();
    expect(host.textContent).toContain("300 ₽");
    await press();
    expect(m.api).toHaveBeenCalledOnce();
    expect(m.api).toHaveBeenCalledWith(
      "/api/v1/app-subscription/yookassa/start",
      expect.objectContaining({
        body: { planCode: "MONTHLY" },
        skipAuthRefreshReplay: true,
        headers: expect.objectContaining({ "X-OTA-Update": "running-id" }),
      }),
    );
    expect(m.browser).toHaveBeenCalledWith(
      "https://example.test/payment",
      "gafus://subscription-return",
    );
    expect(m.refresh).toHaveBeenCalledOnce();
    expect(m.report).toHaveBeenLastCalledWith("Premium активен.");
  });
  it.each(["dismiss", "cancel"])("handles browser %s and a server cancellation", async (type) => {
    m.browser.mockResolvedValue({ type });
    m.status.mockResolvedValue({ success: true, data: { status: "CANCELED" } });
    render();
    await press();
    expect(m.refresh).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Месяц");
  });
  it("checks an uncertain result without starting another charge", async () => {
    vi.useFakeTimers();
    m.api.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    m.status.mockResolvedValue({ success: false });
    render();
    await act(async () => {
      (Array.from(host.querySelectorAll("button")).find(btn =>
      /Оплатить|Проверить оплату/.test(btn.textContent ?? "")) ??
      host.querySelector("button"))!.click();
      await vi.runAllTimersAsync();
      await m.work;
    });
    expect(host.textContent).toContain("Проверить оплату");
    expect(m.browser).not.toHaveBeenCalled();
    m.status.mockResolvedValue({ success: true, data: { hasActiveSubscription: true } });
    await press();
    expect(m.api).toHaveBeenCalledOnce();
    expect(m.refresh).toHaveBeenCalledOnce();
  });
  it("retains IAP-only presentation after rollback and respects a server denial", async () => {
    m.allowed = false;
    render();
    expect(host.querySelector("button")).toBeNull();
    m.allowed = true;
    m.api.mockResolvedValue({ success: false, code: "FEATURE_DISABLED" });
    render();
    await press();
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(m.browser).not.toHaveBeenCalled();
  });
  it("does not use a response belonging to the previous account", async () => {
    m.api.mockImplementation(async () => {
      m.owner = false;
      return { success: true, data: { confirmationUrl: "https://example.test/payment" } };
    });
    render();
    await press();
    expect(m.browser).not.toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
