// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  owner: "trainer-synthetic",
  epoch: "epoch-a",
  role: "TRAINER" as "TRAINER" | "USER",
  list: vi.fn(),
  transition: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
  back: vi.fn(),
}));
const booking = (status = "PENDING_TRAINER_CONFIRMATION") => ({
  id: "booking-synthetic-123",
  status,
  cynologistUserId: "trainer-synthetic",
  slot: {
    id: "slot-synthetic", startAtUtc: "2026-10-27T17:00:00.000Z",
    endAtUtc: "2026-10-27T17:30:00.000Z", status: status === "CANCELLED_BY_TRAINER" ? "FREE" : "BOOKED",
  },
  clientOwnerName: "Test Owner", clientUsername: "client-test",
  petName: "Test Pet", clientProblem: "Synthetic question",
});

vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ back: m.back }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const wrap = (name: string) => ({ children, onPress, disabled }: {
    children?: React.ReactNode; onPress?: () => void; disabled?: boolean;
  }) => R.createElement(name, { onClick: onPress, disabled }, children);
  return {
    Alert: { alert: (...args: unknown[]) => m.alert(...args) },
    View: wrap("div"), ScrollView: wrap("section"), Pressable: wrap("button"),
    ActivityIndicator: () => R.createElement("span", null, "Loading"),
    StyleSheet: { create: (css: unknown) => css },
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("span", null, children),
  };
});
vi.mock("@/shared/stores/authStore", () => {
  const snapshot = () => ({ user: { id: m.owner, role: m.role } });
  return { useAuthStore: Object.assign(
    (selector: (state: ReturnType<typeof snapshot>) => unknown) => selector(snapshot()),
    { getState: snapshot },
  ) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/consultations", () => ({
  consultationsApi: {
    trainerBookings: (...args: unknown[]) => m.list(...args),
    trainerTransition: (...args: unknown[]) => m.transition(...args),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
import TrainerScreen from "../../../../app/(main)/consultations/trainer";

let root: Root;
let node: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  m.owner = "trainer-synthetic";
  m.epoch = "epoch-a";
  m.role = "TRAINER";
  m.list.mockResolvedValue({ success: true, data: [booking()] });
  m.transition.mockResolvedValue({
    success: true, data: { bookingId: "booking-synthetic-123" },
  });
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => root.render(createElement(TrainerScreen)));
  await flush();
}
function click(label: string) {
  const button = Array.from(node.querySelectorAll("button"))
    .find(x => x.textContent?.trim() === label);
  expect(button).not.toBeUndefined();
  return act(async () => button?.click());
}
function accept() {
  const args = m.alert.mock.calls[0] as [string, string, { onPress?: () => void }[]];
  const confirm = args?.[2]?.[1]?.onPress;
  expect(confirm).toBeTypeOf("function");
  return act(async () => { confirm?.(); await flush(); });
}

describe("Native trainer consultations: owner/mutation/readback/push destination", () => {
  it("TRAINER sees own bookings and can confirm with verified GET status", async () => {
    m.list.mockResolvedValueOnce({ success: true, data: [booking()] })
      .mockResolvedValueOnce({ success: true, data: [booking("CONFIRMED")] });
    await mount();
    expect(node.textContent).toContain("Test Owner");
    await click("Подтвердить");
    expect(m.transition).not.toHaveBeenCalled();
    await accept();
    expect(m.transition).toHaveBeenCalledTimes(1);
    expect(m.transition.mock.calls[0]?.slice(0, 2)).toEqual([
      "booking-synthetic-123", "confirm",
    ]);
    expect(m.transition.mock.calls[0]?.[2]()).toBe(true);
    expect(node.textContent).toContain("CONFIRMED");
    expect(m.list).toHaveBeenCalledTimes(2);
  });
  it("fails closed after changed owner before the operator confirms", async () => {
    await mount();
    await click("Подтвердить");
    m.owner = "someone-else";
    await accept();
    expect(m.transition).not.toHaveBeenCalled();
  });
  it("does not retry a status whose server readback is unconfirmed", async () => {
    m.list.mockResolvedValue({ success: true, data: [booking()] });
    await mount();
    await click("Подтвердить");
    await accept();
    expect(m.transition).toHaveBeenCalledTimes(1);
    expect(node.textContent).toContain("Результат изменения неизвестен");
  });
  it("ordinary USER never fetches trainer booking list or sees write actions", async () => {
    m.role = "USER";
    await mount();
    expect(node.textContent).toContain("Доступ есть только");
    expect(node.textContent).not.toContain("Подтвердить");
    expect(m.list).not.toHaveBeenCalled();
    expect(m.transition).not.toHaveBeenCalled();
  });
});
