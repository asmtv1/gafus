// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m = vi.hoisted(() => ({
  platform: "ios",
  owner: "A",
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  getStatus: vi.fn(),
  getOffer: vi.fn(),
  runApple: vi.fn(),
  yookassa: vi.fn(),
  alert: vi.fn(),
  close: vi.fn(),
}));
const token = "b713906f-c774-41d9-84ae-1585fb13f232";
function offer(appleToken: string | null) {
  return {
    applePlan: {
      code: "MONTHLY",
      label: "Месяц",
      title: "Месячный",
      intervalDays: 30,
      currency: "RUB",
      yookassaPriceRub: 300,
      enabled: true,
      appleProductId: "apple-monthly",
      consultationBookingIncluded: true,
      promoCodeEligible: false,
      badge: null,
      savingsRub: null,
    },
    plans: [],
    yookassaPlans: [],
    appleAppAccountToken: appleToken,
    iosRuCardPaymentEnabled: false,
    promoCode: { entryEnabled: false, eligible: false },
    savedRegistrationPromoCode: null,
  };
}
vi.mock("react-native", async () => {
  const React = await import("react");
  const box =
    (tag: string) =>
    ({
      children,
      onPress,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) =>
      React.createElement(tag, { onClick: onPress, disabled }, children);
  return {
    Alert: { alert: (...a: unknown[]) => m.alert(...a) },
    Linking: { openURL: vi.fn() },
    Modal: box("div"),
    Pressable: box("button"),
    ScrollView: box("section"),
    View: box("div"),
    StyleSheet: { create: (x: unknown) => x },
    Platform: {
      get OS() {
        return m.platform;
      },
    },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("@expo/vector-icons", async () => {
  const React = await import("react");
  return { MaterialCommunityIcons: () => React.createElement("span") };
});
vi.mock("expo-image", async () => {
  const React = await import("react");
  return { Image: () => React.createElement("span") };
});
vi.mock("expo-iap", () => ({
  fetchProducts: async () => [{ displayPrice: "299 ₽" }],
  initConnection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {}, SPACING: {} }));
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    AppBackButton: () => React.createElement("span"),
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    Input: () => React.createElement("input"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => React.createElement("button", { "data-label": label, onClick: onPress, disabled }, label),
  };
});
vi.mock("../api/appSubscriptionApi", () => ({
  appSubscriptionApi: {
    getStatus: (...a: unknown[]) => m.getStatus(...a),
    getOffer: (...a: unknown[]) => m.getOffer(...a),
    previewPromoCode: vi.fn(),
  },
}));
vi.mock("../lib/appleAppSubscriptionPurchase", () => ({
  runAppleAppSubscriptionPurchase: (...a: unknown[]) => m.runApple(...a),
}));
vi.mock("../lib/yookassaAppSubscriptionPurchase", () => ({
  yookassaAppSubscriptionPurchase: (...a: unknown[]) => m.yookassa(...a),
}));
vi.mock("../store/paywallStore", () => ({
  usePaywallStore: (selector: (s: { close: () => void }) => unknown) =>
    selector({ close: m.close }),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create<{ user: { id: string } | null }>(() => ({
      user: { id: "A", username: "usera", phone: null, email: null, role: "USER" },
    })),
  };
});
import { useAuthStore } from "@/shared/stores/authStore";
import { AppSubscriptionPaywall } from "./AppSubscriptionPaywall";
let root: Root;
let host: HTMLDivElement;
let query: QueryClient;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: query }, createElement(AppSubscriptionPaywall)),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await flush();
}
function appleButton() {
  return host.querySelector<HTMLButtonElement>('button[data-label="Оформить через App Store"]');
}
beforeEach(() => {
  m.platform = "ios";
  m.owner = "A";
  m.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
  m.getStatus.mockReset().mockResolvedValue({
    success: true,
    data: { hasActiveSubscription: false, status: "PENDING" },
  });
  m.getOffer.mockReset().mockResolvedValue({ success: true, data: offer(null) });
  m.runApple.mockReset().mockResolvedValue({ ok: true });
  m.yookassa.mockReset();
  m.alert.mockReset();
  m.close.mockReset();
  useAuthStore.setState({
    user: { id: "A", username: "usera", phone: null, email: null, role: "USER" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  query.clear();
  host.remove();
});
describe("actual Mobile paywall Apple offer initialization boundary", () => {
  it("renders read-only missing-token offer without starting StoreKit or inventing init", async () => {
    await mount();
    expect(appleButton()).not.toBeNull();
    expect(appleButton()?.disabled).toBe(true);
    expect(host.textContent).toContain("требуется серверная инициализация аккаунта");
    expect(m.runApple).not.toHaveBeenCalled();
  });
  it("permits existing valid stable token but pending server status does not claim Premium", async () => {
    m.getOffer.mockResolvedValue({ success: true, data: offer(token) });
    await mount();
    expect(appleButton()?.disabled).toBe(false);
    await act(async () => appleButton()?.click());
    await flush();
    expect(m.runApple).toHaveBeenCalledTimes(1);
    expect(m.runApple.mock.calls[0]?.[1].appAccountToken).toBe(token);
    expect(host.textContent).toContain("Покупка подтверждается на сервере");
    expect(m.close).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("prevents stale authenticated A offer becoming Apple checkout for B", async () => {
    // A's server token must not be fabricated for B by the mocked GET.
    m.getOffer.mockImplementation(async () => ({
      success: true,
      data: offer(m.owner === "A" ? token : null),
    }));
    await mount();
    expect(appleButton()?.disabled).toBe(false);
    await act(async () => {
      m.owner = "B";
      useAuthStore.setState({
        user: { id: "B", username: "userb", phone: null, email: null, role: "USER" },
      });
    });
    await flush();
    expect(appleButton() === null || appleButton()?.disabled).toBe(true);
    await act(async () => appleButton()?.click());
    expect(m.runApple).not.toHaveBeenCalled();
  });
  it("drops old account completion while Apple request remains pending", async () => {
    m.getOffer.mockResolvedValue({ success: true, data: offer(token) });
    let resolve!: (result: { ok: true }) => void;
    m.runApple.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await mount();
    expect(appleButton()?.disabled).toBe(false);
    await act(async () => appleButton()?.click());
    expect(m.runApple).toHaveBeenCalledTimes(1);
    await act(async () => {
      m.owner = "B";
      useAuthStore.setState({
        user: { id: "B", username: "userb", phone: null, email: null, role: "USER" },
      });
    });
    await act(async () => resolve({ ok: true }));
    await flush();
    expect(m.close).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("quarantines the same-owner previous epoch offer before new read completes", async () => {
    m.getOffer.mockResolvedValueOnce({ success: true, data: offer(token) });
    await mount();
    expect(appleButton()?.disabled).toBe(false);
    m.epoch = "3fdc9c4e-baa6-4f6f-87de-11ccfa67a600";
    m.getOffer.mockImplementationOnce(() => new Promise(() => undefined));
    await act(async () =>
      useAuthStore.setState({
        user: { id: "A", username: "usera", phone: null, email: null, role: "USER" },
      }),
    );
    expect(appleButton() === null || appleButton()?.disabled).toBe(true);
    expect(m.runApple).not.toHaveBeenCalled();
  });
  it("Android drops a late old-owner checkout response after account switch", async () => {
    m.platform = "android";
    m.getOffer.mockResolvedValue({
      success: true,
      data: {
        ...offer(null),
        applePlan: null,
        yookassaPlans: [{ ...offer(null).applePlan, appleProductId: null }],
        iosRuCardPaymentEnabled: true,
      },
    });
    let resolve!: (value: { ok: true; localSubscriptionId: string }) => void;
    m.yookassa.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await mount();
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.includes("Оформить") || b.textContent?.includes("Оплатить"),
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(m.yookassa).toHaveBeenCalledTimes(1);
    await act(async () => {
      m.owner = "B";
      useAuthStore.setState({
        user: { id: "B", username: "userb", phone: null, email: null, role: "USER" },
      });
    });
    await act(async () => resolve({ ok: true, localSubscriptionId: "old" }));
    await flush();
    expect(m.close).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("Android unknown checkout never closes paywall or claims Premium", async () => {
    m.platform = "android";
    m.getOffer.mockResolvedValue({
      success: true,
      data: {
        ...offer(null),
        applePlan: null,
        yookassaPlans: [{ ...offer(null).applePlan, appleProductId: null }],
        iosRuCardPaymentEnabled: true,
      },
    });
    m.yookassa.mockResolvedValueOnce({
      ok: false,
      uncertain: true,
      message: "Результат оплаты неизвестен",
    });
    await mount();
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.includes("Оформить") || b.textContent?.includes("Оплатить"),
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
    await flush();
    expect(m.yookassa).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Результат оплаты неизвестен");
    expect(m.close).not.toHaveBeenCalled();
  });
});
