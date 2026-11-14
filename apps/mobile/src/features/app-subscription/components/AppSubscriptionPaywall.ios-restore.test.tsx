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
  restoreStoreKit: vi.fn(),
  availablePurchases: vi.fn(),
  restoreOnServer: vi.fn(),
  initializeApple: vi.fn(),
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
  fetchProducts: async () => [{ id: "apple-monthly", displayPrice: "299 ₽" }],
  initConnection: vi.fn().mockResolvedValue(undefined),
  restorePurchases: (...a: unknown[]) => m.restoreStoreKit(...a),
  getAvailablePurchases: (...a: unknown[]) => m.availablePurchases(...a),
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
vi.mock("../api/appSubscriptionAppleApi", () => ({
  appSubscriptionAppleApi: {
    getStatus: (...a: unknown[]) => m.getStatus(...a),
    getOffer: (...a: unknown[]) => m.getOffer(...a),
    restoreAppleSubscription: (...a: unknown[]) => m.restoreOnServer(...a),
    initializeAppleAppAccountToken: (...a: unknown[]) => m.initializeApple(...a),
    cancelExistingYookassaRenewal: vi.fn(),
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
import { AppSubscriptionPaywall } from "./AppSubscriptionPaywall.ios";

let root: Root;
let host: HTMLDivElement;
let query: QueryClient;
async function flush() {
  await act(async () => {for(let i=0;i<25;i++) await Promise.resolve();});
}
async function mount() {
  await act(async () => root.render(
    createElement(QueryClientProvider,{client:query},createElement(AppSubscriptionPaywall)),
  ));
  await act(async () => {await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
}
function button(label: string) {
  return host.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
}
beforeEach(()=>{
  m.platform="ios";
  m.owner="A";
  m.epoch="51e35071-0752-4f22-b3aa-23f8844c8931";
  m.getStatus.mockReset().mockResolvedValue({success:true,data:{hasActiveSubscription:false,status:"PENDING"}});
  m.getOffer.mockReset().mockResolvedValue({success:true,data:offer(null)});
  m.restoreStoreKit.mockReset().mockResolvedValue(undefined);
  m.availablePurchases.mockReset().mockResolvedValue([{productId:"apple-monthly",purchaseToken:"apple-signed-jws"}]);
  m.restoreOnServer.mockReset().mockResolvedValue({success:true,data:{success:true}});
  m.initializeApple.mockReset();
  m.yookassa.mockReset();
  m.runApple.mockReset();
  m.close.mockReset();
  useAuthStore.setState({user:{id:"A",username:"usera",phone:null,email:null,role:"USER"}});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  query=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  query.clear();host.remove();
});
describe("real iOS paywall restore from StoreKit 2",()=>{
  it("synchronizes StoreKit BEFORE fetching active signed purchase, then verifies JWS",async()=>{
    const order:string[]=[];
    m.restoreStoreKit.mockImplementation(async()=>{order.push("sync");});
    m.availablePurchases.mockImplementation(async()=>{order.push("read");return [{productId:"apple-monthly",purchaseToken:"apple-signed-jws"}];});
    m.restoreOnServer.mockImplementation(async()=>{order.push("verify");return {success:true,data:{success:true}};});
    await mount();
    expect(button("Восстановить покупки")?.disabled).toBe(false);
    await act(async()=>button("Восстановить покупки")?.click());
    await flush();
    expect(order).toEqual(["sync","read","verify"]);
    expect(m.availablePurchases).toHaveBeenCalledWith({onlyIncludeActiveItemsIOS:true});
    expect(m.restoreOnServer).toHaveBeenCalledWith({signedTransactionInfo:"apple-signed-jws"},expect.any(Function));
    expect(host.textContent).toContain("Покупка подтверждена");
    expect(m.yookassa).not.toHaveBeenCalled();
  });
  it("does not send JWS or call Apple recovery server after account epoch changes during sync",async()=>{
    let resolveSync!:()=>void;
    m.restoreStoreKit.mockImplementation(()=>new Promise<void>(resolve=>{resolveSync=resolve;}));
    await mount();
    await act(async()=>button("Восстановить покупки")?.click());
    await act(async()=>{
      m.owner="B";
      m.epoch="b3ffbade-dfed-477b-a6d4-4f94a2b09051";
      useAuthStore.setState({user:{id:"B",username:"userb",phone:null,email:null,role:"USER"}});
      resolveSync();
    });
    await flush();
    expect(m.availablePurchases).not.toHaveBeenCalled();
    expect(m.restoreOnServer).not.toHaveBeenCalled();
  });
  it("does not submit empty or unrelated Apple purchase token",async()=>{
    m.availablePurchases.mockResolvedValue([
      {productId:"other-sku",purchaseToken:"other-jws"},
      {productId:"apple-monthly",purchaseToken:"  "},
    ]);
    await mount();
    await act(async()=>button("Восстановить покупки")?.click());
    await flush();
    expect(m.restoreOnServer).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Не удалось найти активную покупку");
  });
});
