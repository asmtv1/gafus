// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultationBookingCalendarWindowMsk } from "@gafus/consultation-shared";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  calendar: vi.fn(),
  verify: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  paywall: vi.fn(),
  bookingDenied: vi.fn(),
  tracer: vi.fn(),
  track: vi.fn(),
  haptic: vi.fn(),
  setOptions: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create<{
      user: { id: string } | null;
      isAuthenticated: boolean;
      isLoading: boolean;
    }>(() => ({
      user: { id: "A" },
      isAuthenticated: true,
      isLoading: false,
    })),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.owner ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/api", () => ({
  consultationsApi: {
    getSlotsCalendar: (...a: unknown[]) => m.calendar(...a),
    verifySlotFree: (...a: unknown[]) => m.verify(...a),
  },
  isSubscriptionRequiredCode: (code: string) => code === "SUBSCRIPTION_REQUIRED",
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.tracer(...args),
}));
vi.mock("@/shared/lib/utils/haptics", () => ({ hapticFeedback: { medium: () => m.haptic() } }));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: (...args: unknown[]) => m.track(...args) }));
vi.mock("../lib/consultationAccessPaywall", () => ({
  openConsultationAccessPaywall: () => m.paywall(),
  showConsultationBookingNotIncludedAlert: () => m.bookingDenied(),
}));
vi.mock("expo-router", async () => {
  const R = await import("react");
  const navigation = { setOptions: (...a: unknown[]) => m.setOptions(...a) };
  return {
    useRouter: () => ({ push: (...a: unknown[]) => m.push(...a) }),
    useNavigation: () => navigation,
    useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(cb, [cb]),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const node =
    (name: string) =>
    (p: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        name,
        { onClick: p.onPress, disabled: p.disabled, "aria-label": p.accessibilityLabel },
        p.children,
      );
  return {
    Alert: { alert: (...a: unknown[]) => m.alert(...a) },
    View: node("div"),
    ScrollView: node("div"),
    Pressable: node("button"),
    StyleSheet: { create: (styles: unknown) => styles },
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return { Text: (p: { children?: React.ReactNode }) => R.createElement("span", null, p.children) };
});
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "olive",
    text: "black",
    textSecondary: "gray",
    cardBackground: "white",
    error: "red",
  },
  FONTS: { montserrat: "Arial", montserratMedium: "Arial" },
  SPACING: { xs: 3, sm: 6, md: 12, lg: 16, xl: 20 },
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: () => R.createElement("span", null, "Загрузка свободного времени"),
    Button: (p: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        "button",
        { "aria-label": p.accessibilityLabel ?? p.label, onClick: p.onPress, disabled: p.disabled },
        p.label,
      ),
  };
});
import { useAuthStore } from "@/shared/stores/authStore";
import { ConsultationSlotsCalendar } from "./ConsultationSlotsCalendar";
const window = consultationBookingCalendarWindowMsk(14);
const startAtUtc = new Date(`${window.fromKey}T12:00:00+03:00`).toISOString();
const endAtUtc = new Date(`${window.fromKey}T12:45:00+03:00`).toISOString();
const slot = { id: "slot-A", startAtUtc, endAtUtc, status: "FREE" as const };
const calendarOk = () => ({
  success: true,
  data: [slot],
  dayOffDates: [],
  bookingEligibility: { canBook: true },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
let host: HTMLDivElement, root: Root, client: QueryClient;
async function mount(cynologistUserId = "trainer-A") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ConsultationSlotsCalendar
          cynologistUserId={cynologistUserId}
          slotDurationMin={45}
          displayName="Кинолог Один"
        />
      </QueryClientProvider>,
    ),
  );
}
async function slotButton() {
  await vi.waitFor(() =>
    expect(host.querySelector<HTMLButtonElement>('[aria-label^="Выбрать слот "]')).not.toBeNull(),
  );
  return host.querySelector<HTMLButtonElement>('[aria-label^="Выбрать слот "]')!;
}
async function choose() {
  const el = await slotButton();
  await act(async () => el.click());
}
const userFixture = (id: string) => ({
  id,
  username: id.toLowerCase(),
  email: null,
  phone: null,
  role: "USER" as const,
});
async function actor(owner: string, epoch: string) {
  m.owner = owner;
  m.epoch = epoch;
  await act(async () =>
    useAuthStore.setState({
      user: owner ? userFixture(owner) : null,
      isAuthenticated: !!owner,
      isLoading: false,
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.calendar.mockReset().mockResolvedValue(calendarOk());
  m.verify.mockReset().mockResolvedValue({ success: true });
  useAuthStore.setState({ user: userFixture("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
describe("V88 actual ConsultationSlotsCalendar select verified free slot", () => {
  it("verified reader loads existing MSK calendar, chooses FREE slot, verifies once and routes using original params", async () => {
    await mount();
    await choose();
    expect(m.verify).toHaveBeenCalledExactlyOnceWith("trainer-A", "slot-A");
    expect(m.push).toHaveBeenCalledOnce();
    expect(m.push.mock.calls[0][0]).toContain("slotId=slot-A");
    expect(m.push.mock.calls[0][0]).toContain("cynologistUserId=trainer-A");
    expect(m.push.mock.calls[0][0]).toContain(encodeURIComponent(startAtUtc));
  });
  it("guest never requests authenticated slots or verifies even with stale visible slot", async () => {
    await actor("", "");
    await mount();
    expect(m.calendar).not.toHaveBeenCalled();
    const el = host.querySelector<HTMLButtonElement>('[aria-label^="Выбрать слот "]');
    if (el) await act(async () => el.click());
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
  });
  it("rapid double tap starts a single verification with synchronous flight lock", async () => {
    const d = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(d.promise);
    await mount();
    const el = await slotButton();
    await act(async () => {
      el.click();
      el.click();
    });
    expect(m.verify).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ success: true }));
    expect(m.push).toHaveBeenCalledOnce();
  });
  it("A->B->A auth epoch while verify GET pending quarantines old confirmed slot", async () => {
    const d = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(d.promise);
    await mount();
    await choose();
    await actor("B", "BE1");
    await actor("A", "E2");
    await act(async () => d.resolve({ success: true }));
    expect(m.push).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("trainer A->B->A prop switch while verify pending cannot open stale old confirmation", async () => {
    const d = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(d.promise);
    await mount();
    await choose();
    await mount("trainer-B");
    await mount("trainer-A");
    await act(async () => d.resolve({ success: true }));
    expect(m.push).not.toHaveBeenCalled();
  });
  it("unmount during GET verify prevents stale navigation and alerts", async () => {
    const d = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(d.promise);
    await mount();
    await choose();
    await act(async () => root.unmount());
    await act(async () => d.resolve({ success: true }));
    expect(m.push).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("BOOKED slot has no bookable button and cannot call verify", async () => {
    m.calendar.mockResolvedValueOnce({
      success: true,
      data: [{ ...slot, status: "BOOKED" }],
      dayOffDates: [],
      bookingEligibility: { canBook: true },
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Занято"));
    expect(host.querySelector('[aria-label^="Выбрать слот "]')).toBeNull();
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("success:false TAKEN stays on calendar, tells user and does not route", async () => {
    m.verify.mockResolvedValueOnce({
      success: false,
      code: "CONSULTATION_SLOT_TAKEN",
      error: "занят",
    });
    await mount();
    await choose();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledWith("Слот занят", expect.any(String));
  });
  it("booking eligibility refusal hides verification CTA and shows existing message", async () => {
    m.calendar.mockResolvedValueOnce({
      success: true,
      data: [slot],
      dayOffDates: [],
      bookingEligibility: { canBook: false, message: "Запись ограничена" },
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Запись ограничена"));
    expect(host.querySelector('[aria-label^="Выбрать слот "]')).toBeNull();
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("subscription-required verify opens existing paywall and does not navigate", async () => {
    m.verify.mockResolvedValueOnce({ success: false, code: "SUBSCRIPTION_REQUIRED" });
    await mount();
    await choose();
    expect(m.paywall).toHaveBeenCalledOnce();
    expect(m.push).not.toHaveBeenCalled();
  });
  it("eligible browse but booking tariff excluded opens existing explanation", async () => {
    m.verify.mockResolvedValueOnce({ success: false, code: "CONSULTATION_BOOKING_NOT_INCLUDED" });
    await mount();
    await choose();
    expect(m.bookingDenied).toHaveBeenCalledOnce();
    expect(m.push).not.toHaveBeenCalled();
  });
  it("unknown successful-HTTP false response prevents current-session reverify", async () => {
    m.verify.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN",
      error: "Bearer private signed URL",
    });
    await mount();
    await choose();
    await choose();
    expect(m.verify).toHaveBeenCalledTimes(1);
    expect(m.push).not.toHaveBeenCalled();
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("Bearer private");
  });
  it("unknown transport failure never reveals provider secret nor opens confirmation", async () => {
    const secret = "Bearer privateURL?X-Amz-Signature=SECRET";
    m.verify.mockRejectedValueOnce(new Error(secret));
    await mount();
    await choose();
    expect(m.push).not.toHaveBeenCalled();
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(m.tracer.mock.calls)).not.toContain(secret);
  });
});
