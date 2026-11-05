// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  rootReady: true,
  pathname: "/welcome",
  push: vi.fn(),
  getLast: vi.fn(),
  listen: vi.fn(),
  linkingListen: vi.fn(),
  getInitialUrl: vi.fn(),
  pushCallback: null as ((response: unknown) => void) | null,
  deeplinkCallback: null as ((event: { url: string }) => void) | null,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.push }),
  useRootNavigationState: () => state.rootReady ? { key: "root" } : null,
  usePathname: () => state.pathname,
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: (selector: (v: unknown) => unknown) => selector({
    isAuthenticated: state.isAuthenticated, isLoading: state.isLoading,
  }),
}));
vi.mock("expo-linking", () => ({
  addEventListener: (type: string, cb: (event: { url: string }) => void) => {
    state.deeplinkCallback = cb;
    return { remove: vi.fn() };
  },
  getInitialURL: (...args: unknown[]) => state.getInitialUrl(...args),
}));
vi.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: (cb: (response: unknown) => void) => {
    state.pushCallback = cb;
    return { remove: vi.fn() };
  },
  getLastNotificationResponseAsync: (...args: unknown[]) => state.getLast(...args),
}));
import { ChatPushNavigation } from "./ChatPushNavigation";

const notification = (id: string, url: string) => ({
  notification: {
    request: { identifier: id, content: { data: { url } } },
  },
});
let root: Root, container: HTMLDivElement;
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.isAuthenticated = true;
  state.isLoading = false;
  state.rootReady = true;
  state.pathname = "/welcome";
  state.pushCallback = null;
  state.deeplinkCallback = null;
  state.getLast.mockResolvedValue(null);
  state.getInitialUrl.mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function mount() {
  await act(async () => root.render(createElement(ChatPushNavigation)));
  // Importing expo-notifications is dynamic; module resolution can complete
  // after React's first microtask batch in Vite/JSDOM.
  await act(async () => {
    await vi.waitFor(() => expect(state.pushCallback).toBeTypeOf("function"));
  });
  await settle();
}
async function receive(id: string, url: string) {
  await act(async () => state.pushCallback?.(notification(id, url)));
  await settle();
}

describe("legacy Next source push destination parity in native Expo", () => {
  it("cold-started training reminder opens the native courses tab", async () => {
    state.getLast.mockResolvedValue(notification("cold-reminder-1", "/courses"));
    await mount();
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/courses");
  });

  it("notification tap opens courses only once for the same delivery ID", async () => {
    await mount();
    await receive("reminder-2", "/courses");
    await receive("reminder-2", "/courses");
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/courses");
  });

  it("restores Next /trainings course deep link with the native /training route", async () => {
    await mount();
    await receive("next-training-3", "/trainings/group");
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/training/group");
  });

  it("accepts the existing native gafus:///courses deep link and mapped day link", async () => {
    await mount();
    await act(async () => state.deeplinkCallback?.({ url: "gafus:///courses" }));
    await settle();
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/courses");
    // Source Next re-engagement inserts bestCourseId into this URL; it is
    // not a native day ID and must not be passed to the day-detail screen.
    await receive("next-course-id-6", "/trainings/group/bestCourseId42");
    expect(state.push).toHaveBeenLastCalledWith("/courses");
    await receive("next-training-day-7", "/trainings/fitness/day42");
    expect(state.push).toHaveBeenLastCalledWith("/training/fitness/day42");
  });

  it("delivers client booking push to native consultations and trainer push to staff list", async () => {
    await mount();
    await receive("booking-confirmed", "/consultations/my");
    await receive("trainer-new-request", "/main-panel/consultations");
    expect(state.push).toHaveBeenNthCalledWith(1, "/consultations/mine");
    expect(state.push).toHaveBeenNthCalledWith(2, "/consultations/trainer");
    await receive("external-consultation", "/main-panel/consultations?redirect=evil");
    expect(state.push).toHaveBeenCalledTimes(2);
  });

  it("ignores external URLs and maps legacy chat push to Chat2 list", async () => {
    await mount();
    await receive("evil1", "https://attacker.example/courses");
    await receive("evil2", "//attacker.example/courses");
    await receive("evil3", "/courses?redirect=https://attacker.example");
    expect(state.push).not.toHaveBeenCalled();
    await receive("chat4", "/cynologist-chat");
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/chats");
  });

  it("does not navigate until both auth and root navigation are ready", async () => {
    state.isAuthenticated = false;
    state.rootReady = false;
    state.getLast.mockResolvedValue(notification("cold-reminder-5", "/courses"));
    await mount();
    expect(state.push).not.toHaveBeenCalled();
    state.isAuthenticated = true;
    state.rootReady = true;
    await act(async () => root.render(createElement(ChatPushNavigation)));
    await settle();
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/courses");
  });
});


describe("Universal/App Links with login recovery", () => {
  it("retains a moment link received while logged out, then opens the actual feed post after login", async () => {
    state.isAuthenticated = false;
    state.getInitialUrl.mockResolvedValue("https://gafus.ru/feed/post-1");
    await mount();
    expect(state.push).not.toHaveBeenCalled();
    state.isAuthenticated = true;
    await act(async () => root.render(createElement(ChatPushNavigation)));
    await settle();
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/feed/post-1");
  });
  it("trusted question and chat links reach existing native destinations", async () => {
    await mount();
    await act(async () => state.deeplinkCallback?.({ url:"https://www.gafus.ru/questions/question-5" }));
    await settle();
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/questions/question-5");
  });
  it("does not launch a duplicate route when Expo Router already opened the link", async () => {
    state.pathname="/feed/post-1";
    state.getInitialUrl.mockResolvedValue("https://gafus.ru/feed/post-1");
    await mount();
    expect(state.push).not.toHaveBeenCalled();
  });
  it("ignores foreign HTTPS and never replays reset tokens as a private destination", async () => {
    await mount();
    await act(async () => {
      state.deeplinkCallback?.({ url:"https://evil.example/feed/post-1" });
      state.deeplinkCallback?.({ url:"https://gafus.ru/reset-password?token=secrettoken" });
    });
    await settle();
    expect(state.push).not.toHaveBeenCalled();
  });
});
