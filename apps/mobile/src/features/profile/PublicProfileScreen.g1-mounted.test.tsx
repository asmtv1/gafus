// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  route: "alice",
  owner: "A",
  epoch: "E1",
  authed: false,
  loading: false,
  profileGet: vi.fn(),
  access: vi.fn(),
  direct: vi.fn(),
  link: vi.fn(),
  alert: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  pets: [] as unknown[],
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (
      selector: (s: {
        isAuthenticated: boolean;
        isLoading: boolean;
        user: { id: string } | null;
      }) => unknown,
    ) =>
      selector({
        isAuthenticated: m.authed,
        isLoading: m.loading,
        user: m.authed ? { id: m.owner } : null,
      }),
    {
      getState: () => ({
        isAuthenticated: m.authed,
        isLoading: m.loading,
        user: m.authed ? { id: m.owner } : null,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/api/user", () => ({ userApi: { getPublicProfile: m.profileGet } }));
vi.mock("@/shared/lib/api/courses", () => ({ coursesApi: { checkAccess: m.access } }));
vi.mock("@/features/chat2/api", () => ({
  chat2: { directByUsername: m.direct },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/utils/mobileImageVariant", () => ({
  getCourseLogoVariantCandidates: () => [],
}));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://api.example",
  COLORS: {
    primary: "#636128",
    background: "#fff",
    cardBackground: "#fff",
    text: "#111",
    textSecondary: "#555",
  },
  FONTS: { impact: "sans", montserrat: "sans", montserratMedium: "sans" },
  SPACING: { md: 8, sm: 4, xs: 2, lg: 16 },
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const dom =
    (tag: string) =>
    (p: { children?: React.ReactNode; onPress?: () => void; accessibilityLabel?: string }) =>
      React.createElement(
        tag,
        { onClick: p.onPress, "aria-label": p.accessibilityLabel },
        p.children,
      );
  return {
    View: dom("div"),
    ScrollView: dom("div"),
    Pressable: dom("button"),
    Linking: { openURL: m.link },
    Alert: { alert: m.alert },
    StyleSheet: { create: (s: unknown) => s },
  };
});
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@expo/vector-icons", () => ({
  FontAwesome5: () => null,
  MaterialCommunityIcons: () => null,
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: m.push, back: m.back }),
  useLocalSearchParams: () => ({ username: m.route }),
  useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
}));
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      React.createElement("button", { onClick: onPress }, "Назад"),
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Button: () => null,
    Loading: () => React.createElement("span", null, "Загрузка профиля..."),
  };
});
vi.mock("@/features/profile", async () => {
  const React = await import("react");
  return {
    ProfileIcon: () => null,
    ProfileMetaRow: ({ city }: { city?: string }) => React.createElement("span", null, city || ""),
  };
});
vi.mock("@/features/gallery", () => ({ GalleryPreview: () => null }));
vi.mock("@/features/feed/ProfileFeedPreview", () => ({ ProfileFeedPreview: () => null }));
vi.mock("@/features/pets/PublicPets", async () => {
  const React = await import("react");
  return {
    PublicPets: ({ pets }: { pets: unknown[] }) => {
      m.pets = pets;
      return React.createElement(
        "div",
        { "data-testid": "public-pets" },
        pets.map((p) => (p as { name: string }).name).join(";"),
      );
    },
  };
});
import PublicProfileScreen from "../../../app/(main)/profile/[username]";
const course = () => ({
  id: "course-1",
  name: "Приватный курс",
  type: "BASIC",
  logoImg: "",
  shortDesc: "Уроки",
  duration: "1 час",
  isPrivate: true,
  isPaid: false,
  avgRating: null,
  updatedAt: "2026-01-01",
  trainingLevel: "BEGINNER",
});
const person = (name = "alice", role = "USER") => ({
  username: name,
  role,
  profile: {
    fullName: name === "alice" ? "Алиса" : "Борис",
    city: "Самара",
    birthDate: null,
    about: "О собаке",
    telegram: "alice123",
    instagram: "alice.123",
    website: "https://example.com/",
    avatarUrl: "https://cdn.example/avatar.png",
  },
  pets: [
    { id: "public-1", name: "Пёс", type: "DOG", breed: "Корги", birthDate: null, photoUrl: null },
  ],
  courses: role === "TRAINER" ? [course()] : [],
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
let root: Root, host: HTMLDivElement, client: QueryClient;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(PublicProfileScreen))),
  );
  await flush();
}
async function navigateRoute(route: string) {
  m.route = route;
  await mount();
}
function buttonWith(text: string) {
  const b = Array.from(host.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(text),
  );
  if (!b) throw Error(`Button ${text} missing. text=${host.textContent}`);
  return b as HTMLButtonElement;
}
async function press(text: string) {
  await act(async () => buttonWith(text).click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", false);
  m.route = "alice";
  m.owner = "A";
  m.epoch = "E1";
  m.authed = false;
  m.loading = false;
  m.pets = [];
  m.profileGet.mockImplementation(async (name: string, guard: () => boolean) => ({
    success: guard(),
    data: person(name),
  }));
  m.access.mockResolvedValue({ success: true, data: { hasAccess: true } });
  m.direct.mockResolvedValue({ conversationId: "new-direct-chat" });
  m.link.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("AG3-PROFILE031 actual PublicProfileScreen native handler/API/privacy", () => {
  it("hides personal messages for a guest", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Алиса"));
    expect(host.textContent).not.toContain("Написать сообщение");
    expect(m.direct).not.toHaveBeenCalled();
  });
  it("does not offer a private-chat bypass on lana's public profile", async () => {
    m.authed = true;
    m.route = "lana";
    await mount();
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalled());
    expect(host.textContent).not.toContain("Написать сообщение");
    expect(m.direct).not.toHaveBeenCalled();
  });
  it("opens a personal Chat2 room from a verified user's public profile", async () => {
    m.authed = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Написать сообщение"));
    await press("Написать сообщение");
    expect(m.direct).toHaveBeenCalledExactlyOnceWith("alice");
    expect(m.push).toHaveBeenCalledWith({
      pathname: "/(main)/chats/[id]",
      params: { id: "new-direct-chat" },
    });
  });
  it("preserves profile and explains the problem when opening a DM fails", async () => {
    m.authed = true;
    m.direct.mockRejectedValueOnce(new Error("Переписка недоступна"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Написать сообщение"));
    await press("Написать сообщение");
    expect(m.alert).toHaveBeenCalledWith(
      "Не удалось открыть переписку", "Переписка недоступна",
    );
    expect(m.push).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Написать сообщение");
  });

  it("guest fetches permitted public projection and private user/pet fields never reach child", async () => {
    m.profileGet.mockImplementation(async (_name: string, guard: () => boolean) => ({
      success: guard(),
      data: {
        ...person(),
        email: "secret@example.test",
        phone: "PRIVATE",
        apiKey: "token",
        pets: [
          { ...person().pets[0], showInProfile: false, medicalNotes: "secret medical" },
          { ...person().pets[0], id: "visible", medicalNotes: "secret vet record", weightKg: 27 },
        ],
      },
    }));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Алиса"));
    expect(host.textContent).not.toMatch(/secret|PRIVATE|apiKey|weightKg/);
    expect(m.pets).toEqual([
      { id: "visible", name: "Пёс", type: "DOG", breed: "Корги", birthDate: null, photoUrl: null },
    ]);
    expect(m.profileGet).toHaveBeenCalled();
  });
  it("invalid external URL and injected contact name are neither displayed nor opened", async () => {
    m.profileGet.mockImplementation(async () => ({
      success: true,
      data: {
        ...person(),
        profile: {
          ...person().profile,
          telegram: "../foreign",
          instagram: "bad/path",
          website: "javascript:alert(1)",
        },
      },
    }));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Алиса"));
    expect(host.textContent).not.toContain("КОНТАКТЫ");
    expect(m.link).not.toHaveBeenCalled();
  });
  it("valid guest contact press opens only approved HTTPS URL", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("КОНТАКТЫ"));
    await press("Телеграм");
    expect(m.link).toHaveBeenCalledExactlyOnceWith("https://t.me/alice123");
    expect(m.access).not.toHaveBeenCalled();
  });
  it("private course guest is denied without sending access-check token/request", async () => {
    m.profileGet.mockResolvedValue({ success: true, data: person("alice", "TRAINER") });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Приватный курс"));
    await press("Приватный курс");
    expect(m.access).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledWith("Доступ закрыт", expect.any(String));
  });
  it("authenticated private course checks owner/epoch guarded API; no nav until ACK", async () => {
    m.authed = true;
    m.profileGet.mockResolvedValue({ success: true, data: person("alice", "TRAINER") });
    const d = deferred<{ success: boolean; data: { hasAccess: boolean } }>();
    m.access.mockReturnValueOnce(d.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Приватный курс"));
    await press("Приватный курс");
    await vi.waitFor(() => expect(m.access).toHaveBeenCalledOnce());
    expect(m.access.mock.calls[0][0]).toBe("BASIC");
    expect(m.access.mock.calls[0][1]()).toBe(true);
    expect(m.push).not.toHaveBeenCalled();
    await act(async () => d.resolve({ success: true, data: { hasAccess: true } }));
    await flush();
    expect(m.push).toHaveBeenCalledOnce();
  });
  it("rapid private course doubletap starts ONE access lookup", async () => {
    m.authed = true;
    m.profileGet.mockResolvedValue({ success: true, data: person("alice", "TRAINER") });
    const d = deferred<{ success: boolean; data: { hasAccess: boolean } }>();
    m.access.mockReturnValueOnce(d.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Приватный курс"));
    const b = buttonWith("Приватный курс");
    await act(async () => {
      b.click();
      b.click();
    });
    await flush();
    expect(m.access).toHaveBeenCalledOnce();
    await act(async () => d.resolve({ success: true, data: { hasAccess: false } }));
    await flush();
    expect(m.push).not.toHaveBeenCalled();
  });
  it("logout or A->B->A/E2 during access lookup blocks stale routing and alert", async () => {
    m.authed = true;
    m.profileGet.mockResolvedValue({ success: true, data: person("alice", "TRAINER") });
    const d = deferred<{ success: boolean; data: { hasAccess: boolean } }>();
    m.access.mockReturnValueOnce(d.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Приватный курс"));
    await press("Приватный курс");
    await vi.waitFor(() => expect(m.access).toHaveBeenCalledOnce());
    const guard = m.access.mock.calls[0][1] as () => boolean;
    m.owner = "B";
    m.epoch = "B-E1";
    m.owner = "A";
    m.epoch = "A-E2";
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ success: true, data: { hasAccess: true } }));
    await flush();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("unmount while course access pending never navigates or alerts", async () => {
    m.authed = true;
    m.profileGet.mockResolvedValue({ success: true, data: person("alice", "TRAINER") });
    const d = deferred<{ success: boolean; data: { hasAccess: boolean } }>();
    m.access.mockReturnValueOnce(d.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Приватный курс"));
    await press("Приватный курс");
    await act(async () => root.unmount());
    await act(async () => d.resolve({ success: true, data: { hasAccess: true } }));
    expect(m.push).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("network-unknown access may not navigate, shows generic error", async () => {
    m.authed = true;
    m.profileGet.mockResolvedValue({ success: true, data: person("alice", "TRAINER") });
    m.access.mockResolvedValueOnce({ success: false, code: "NETWORK_ERROR" });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Приватный курс"));
    await press("Приватный курс");
    await vi.waitFor(() => expect(m.alert).toHaveBeenCalled());
    expect(m.push).not.toHaveBeenCalled();
    expect(m.alert.mock.calls[0][0]).toBe("Не удалось проверить доступ");
  });
  it("public profile GET delayed across route change cannot paint previous owner's data", async () => {
    const d = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    m.profileGet.mockImplementation((name: string) =>
      name === "alice" ? d.promise : Promise.resolve({ success: true, data: person("bob") }),
    );
    await mount();
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalled());
    const calls = m.profileGet.mock.calls.filter((c: unknown[]) => c[0] === "alice");
    const guard = calls[0][1] as () => boolean;
    await navigateRoute("bob");
    await vi.waitFor(() => expect(host.textContent).toContain("Борис"));
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ success: true, data: person("alice") }));
    await flush();
    expect(host.textContent).not.toContain("Алиса");
    expect(host.textContent).toContain("Борис");
  });
  it("A authenticated GET becomes stale on A->B->A new epoch and cannot paint A cache", async () => {
    m.authed = true;
    const response = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    const freshEpochResponse = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    let newEpochCalls = 0;
    // Old epoch requests share one delayed result. The new epoch owns a distinct
    // pending read: the test must never mistake a fresh GET for stale cache paint.
    m.profileGet.mockImplementation(() => {
      if (m.epoch === "A-E2") {
        newEpochCalls += 1;
        return freshEpochResponse.promise;
      }
      return response.promise;
    });
    await mount();
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalled());
    const guard = m.profileGet.mock.calls[0][1] as () => boolean;
    expect(guard()).toBe(true);
    m.owner = "B";
    m.epoch = "B-E1";
    m.owner = "A";
    m.epoch = "A-E2";
    expect(guard()).toBe(false);
    // Simulate the auth-store notification and hook rerender the real app emits.
    await mount();
    await vi.waitFor(() => expect(newEpochCalls).toBeGreaterThan(0));
    await act(async () => response.resolve({ success: true, data: person() }));
    await flush();
    expect(host.textContent).not.toContain("Алиса");
  });
  it("external OS link failure reports fixed code without exposing private URL", async () => {
    m.link.mockRejectedValueOnce(new Error("private external URL token"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("КОНТАКТЫ"));
    await press("Телеграм");
    expect(m.link).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("private external URL token");
  });
  it("GET failed/403 or malformed DTO displays safe generic error, not private payload", async () => {
    m.profileGet.mockResolvedValue({
      success: false,
      code: "FORBIDDEN",
      error: "private JWT body",
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить профиль"));
    expect(host.textContent).not.toContain("private JWT body");
    expect(m.profileGet.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
