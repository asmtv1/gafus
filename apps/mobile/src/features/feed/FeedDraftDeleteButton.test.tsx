// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  alert: vi.fn(),
  editor: vi.fn(),
  deletion: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  tracer: vi.fn(),
  owner: "A",
  epoch: "E1",
}));
vi.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => m.alert(...args) },
  Pressable: ({ children, onPress, disabled, accessibilityLabel }: {
    children: React.ReactNode; onPress: () => void; disabled: boolean; accessibilityLabel: string;
  }) => React.createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children),
  Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
}));
vi.mock("@/shared/stores", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create(() => ({
    user: { id: "A" }, isAuthenticated: true, isLoading: false,
  })) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }) },
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: { getEditor: (...a: unknown[]) => m.editor(...a) },
  feedDeletePostGuarded: (...a: unknown[]) => m.deletion(...a),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: m.invalidate }) }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: m.tracer }));
vi.mock("@/shared/config", () => ({
  COLORS: { error: "#b00", text: "#111" }, FONTS: { montserratMedium: "fixture" },
}));
import { FeedDraftDeleteButton } from "./FeedDraftDeleteButton";
import { useAuthStore } from "@/shared/stores";

const fixtureUser = (id: string) => ({ id, username: id, phone: null, email: null, role: "USER" as const });
let host: HTMLDivElement, root: Root;
const onDeleted = vi.fn();
const render = async (postId?: string) => {
  await act(async () => root.render(React.createElement(FeedDraftDeleteButton, {
    ownerId: "A", postId, onDeleted,
  })));
};
const confirm = async () => {
  await act(async () => host.querySelector<HTMLButtonElement>("button")?.click());
  const buttons = m.alert.mock.lastCall?.[2] as Array<{ text: string; onPress?: () => void }>;
  expect(buttons.map(button => button.text)).toEqual(["Отмена", "Удалить"]);
  await act(async () => buttons[1]!.onPress?.());
};
beforeEach(() => {
  m.alert.mockReset(); m.editor.mockReset(); m.deletion.mockReset();
  m.invalidate.mockReset().mockResolvedValue(undefined); m.tracer.mockReset();
  m.owner = "A"; m.epoch = "E1"; onDeleted.mockReset();
  useAuthStore.setState({ user: fixtureUser("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("Moments mobile draft deletion", () => {
  it("confirms a server draft, deletes only after owner-scoped status and ACK checks", async () => {
    m.editor.mockResolvedValue({ id: "draft-1", author: { id: "A" }, status: "draft" });
    m.deletion.mockImplementation(async (_id: string, guard: () => boolean) => {
      expect(guard()).toBe(true);
      return { id: "draft-1" };
    });
    await render("draft-1");
    await confirm();
    expect(m.editor).toHaveBeenCalledExactlyOnceWith("draft-1");
    expect(m.deletion).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["feed"] });
  });
  it("does not delete when a recovered draft has become published", async () => {
    m.editor.mockResolvedValue({ id: "draft-1", author: { id: "A" }, status: "published" });
    await render("draft-1");
    await confirm();
    expect(m.deletion).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledTimes(2);
  });
  it("does not send DELETE after the authenticated owner changes", async () => {
    await render("draft-1");
    await act(async () => host.querySelector<HTMLButtonElement>("button")?.click());
    const buttons = m.alert.mock.lastCall?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => {
      m.owner = "B";
      useAuthStore.setState({ user: fixtureUser("B") });
    });
    await act(async () => buttons[1]!.onPress?.());
    expect(m.editor).not.toHaveBeenCalled();
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("removes a failed local-only upload without inventing a server DELETE", async () => {
    await render();
    await confirm();
    expect(m.editor).not.toHaveBeenCalled();
    expect(m.deletion).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
