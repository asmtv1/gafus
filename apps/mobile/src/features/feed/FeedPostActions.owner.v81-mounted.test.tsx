// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  inputText: "синтетическое описание",
  report: vi.fn(),
  bookmark: vi.fn(),
  guardedBookmark: vi.fn(),
  hidden: vi.fn(),
  guardedHidden: vi.fn(),
  invalidate: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const node = (tag: string) => (p: Record<string, unknown>) =>
    React.createElement(
      tag,
      {
        onClick: p.onPress,
        disabled: p.disabled,
        "data-role": p.accessibilityRole,
        "aria-label": p.accessibilityLabel,
      },
      p.children as React.ReactNode,
    );
  return {
    Alert: { alert: m.alert },
    KeyboardAvoidingView: node("div"),
    Modal: (p: Record<string, unknown>) => (p.visible === false ? null : node("section")(p)),
    Platform: { OS: "android" },
    Pressable: React.forwardRef((p: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({
        measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) =>
          cb(20, 30, 44, 44),
      }));
      return node("button")(p);
    }),
    ScrollView: node("div"),
    StyleSheet: { create: (v: unknown) => v, absoluteFill: {}, hairlineWidth: 1 },
    Text: node("span"),
    TextInput: (p: Record<string, unknown>) =>
      React.createElement(
        "button",
        {
          onClick: () => (p.onChangeText as (v: string) => void)(m.inputText),
          disabled: p.editable === false,
          "aria-label": p.accessibilityLabel,
        },
        "Изменить комментарий",
      ),
    View: node("div"),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
}));
vi.mock("@gafus/types", () => ({
  FEED_REPORT_REASONS: { spam: "Спам", abuse: "Оскорбление" },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "#455",
    text: "#000",
    textSecondary: "#777",
    cardBackground: "#fff",
    error: "#c00",
  },
  FONTS: { montserrat: "synthetic", montserratMedium: "synthetic" },
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedReportGuarded: (...args: unknown[]) => m.report(...args),
  feedApi: {
    setBookmark: (...args: unknown[]) => m.bookmark(...args),
    setAuthorPreference: (...args: unknown[]) => m.hidden(...args),
  },
  feedAuthorPreferenceGuarded: (...args: unknown[]) => m.guardedHidden(...args),
  feedBookmarkGuarded: (...args: unknown[]) => m.guardedBookmark(...args),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.epoch ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/stores", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create<{
      user: { id: string } | null;
      isAuthenticated: boolean;
      isLoading: boolean;
    }>(() => ({ user: { id: "A" }, isAuthenticated: true, isLoading: false })),
  };
});
import { useAuthStore } from "@/shared/stores";
vi.mock("@/shared/components/gestures/SwipeDismissHandle", () => ({
  SwipeDismissHandle: () => null,
}));
import { FeedPostActions } from "./FeedPostActions";
import type { FeedPostDto } from "@gafus/types";
const fixtureUser = (id: string) => ({
  id,
  username: id.toLowerCase(),
  phone: null,
  email: null,
  role: "USER" as const,
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function find(text: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll("button")).find((v) => v.textContent?.includes(text)) ?? null
  );
}
async function switchActor(owner: string, epoch: string) {
  m.owner = owner;
  m.epoch = epoch;
  await act(async () => useAuthStore.setState({ user: fixtureUser(owner), isAuthenticated: true }));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.report.mockResolvedValue({ id: "report-1" });
  m.bookmark.mockReset().mockResolvedValue({ saved: true });
  m.guardedBookmark.mockReset().mockResolvedValue({ saved: true });
  m.hidden.mockReset().mockResolvedValue({ hidden: true, notify: false });
  m.guardedHidden.mockReset().mockResolvedValue({ hidden: true, notify: false });
  m.invalidate.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ user: fixtureUser("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function syntheticPost(authorId = "AUTHOR"): FeedPostDto {
  return {
    id: "post-A",
    author: { id: authorId },
    canDelete: false,
    canEdit: false,
    bookmarked: false,
    authorNotify: false,
    recommendationReason: null,
  } as FeedPostDto;
}
async function openMenu() {
  const button = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Действия с публикацией"]',
  );
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}

describe("AG3 V81 actual FeedPostActions owner edit/delete menu", () => {
  function ownerPost(overrides: Partial<FeedPostDto> = {}): FeedPostDto {
    return { ...syntheticPost("A"), canEdit: true, canDelete: true, ...overrides } as FeedPostDto;
  }
  async function ownerMenu(post = ownerPost(), callbacks = { edit: vi.fn(), remove: vi.fn() }) {
    await act(async () =>
      root.render(
        createElement(FeedPostActions, {
          post,
          onEdit: callbacks.edit,
          onDelete: callbacks.remove,
        }),
      ),
    );
    await openMenu();
    return callbacks;
  }
  it("guest and missing verified binding hide owner edit/delete even on stale canEdit/canDelete DTO", async () => {
    await ownerMenu();
    expect(find("Редактировать")).not.toBeNull();
    expect(find("Удалить")).not.toBeNull();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await openMenu();
    expect(find("Редактировать")).toBeNull();
    expect(find("Удалить")).toBeNull();
    await switchActor("A", "E2");
    m.epoch = "";
    await act(async () => useAuthStore.setState({ user: fixtureUser("A") }));
    await openMenu();
    expect(find("Редактировать")).toBeNull();
    expect(find("Удалить")).toBeNull();
  });
  it("foreign actor cannot see owner actions even if server-provided canEdit/canDelete flags are true", async () => {
    await ownerMenu();
    await switchActor("B", "BE1");
    await openMenu();
    expect(find("Редактировать")).toBeNull();
    expect(find("Удалить")).toBeNull();
  });
  it("stale old edit/delete row callbacks captured before A->B->A epoch switch are rejected", async () => {
    const callbacks = { edit: vi.fn(), remove: vi.fn() };
    await ownerMenu(ownerPost(), callbacks);
    const oldEdit = find("Редактировать");
    const oldDelete = find("Удалить");
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    await act(async () => {
      oldEdit?.click();
      oldDelete?.click();
    });
    expect(callbacks.edit).not.toHaveBeenCalled();
    expect(callbacks.remove).not.toHaveBeenCalled();
  });
  it("one owner edit interaction invokes onEdit once even if same-row press fires twice", async () => {
    const callbacks = await ownerMenu();
    const button = find("Редактировать");
    await act(async () => {
      button?.click();
      button?.click();
    });
    expect(callbacks.edit).toHaveBeenCalledTimes(1);
    expect(callbacks.remove).not.toHaveBeenCalled();
  });
  it("one owner delete click triggers confirmation callback once, never dispatches API directly", async () => {
    const callbacks = await ownerMenu();
    const button = find("Удалить");
    await act(async () => {
      button?.click();
      button?.click();
    });
    expect(callbacks.remove).toHaveBeenCalledTimes(1);
    expect(callbacks.edit).not.toHaveBeenCalled();
  });
  it("server-provided canEdit/canDelete false are not bypassed by verified owner", async () => {
    const callbacks = await ownerMenu(ownerPost({ canEdit: false, canDelete: false }));
    expect(find("Редактировать")).toBeNull();
    expect(find("Удалить")).toBeNull();
    expect(callbacks.edit).not.toHaveBeenCalled();
    expect(callbacks.remove).not.toHaveBeenCalled();
  });
});
