// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: { isPending: true, data: undefined as { enabled: boolean } | undefined },
  posts: { isPending: true, isError: false, isSuccess: false,
    data: undefined as { items: unknown[] } | undefined },
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, accessibilityLabel }: { children: React.ReactNode; accessibilityLabel?: string }) =>
    <button aria-label={accessibilityLabel}>{children}</button>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[1] === "profile-preview-availability" ? mocks.status : mocks.posts,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("expo-image", () => ({ Image: () => <span data-artwork="yes" /> }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/components", () => ({
  Loading: ({ message, variant }: { message: string; variant: string }) =>
    <div data-loader-variant={variant}>{message}</div>,
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "me" } }),
}));
vi.mock("@/shared/config", () => ({
  COLORS: {}, FONTS: {}, SPACING: { md: 16, sm: 8 },
}));
vi.mock("@/shared/lib/api/feed", () => ({ feedApi: { status: vi.fn(), listProfilePosts: vi.fn() } }));
vi.mock("./publicationArtwork", () => ({ PUBLICATION_ARTWORK_URI: "data:test" }));

import { ProfileFeedPreview } from "./ProfileFeedPreview";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.status = { isPending: true, data: undefined };
  mocks.posts = { isPending: true, isError: false, isSuccess: false, data: undefined };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ProfileFeedPreview", () => {
  it("renders the publication card header while checking availability", async () => {
    await act(async () => root.render(<ProfileFeedPreview username="alice" />));
    expect(host.textContent).toContain("Публикации");
    expect(host.querySelector('[data-loader-variant="embedded"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Все публикации пользователя"]')).toBeNull();
  });

  it("keeps the card stable during the posts request, then shows its action", async () => {
    mocks.status = { isPending: false, data: { enabled: true } };
    await act(async () => root.render(<ProfileFeedPreview username="alice" />));
    expect(host.querySelector('[data-loader-variant="embedded"]')).not.toBeNull();
    mocks.posts = { isPending: false, isError: false, isSuccess: true, data: { items: [] } };
    await act(async () => root.render(<ProfileFeedPreview username="alice" />));
    expect(host.textContent).toContain("Публикаций пока нет.");
    expect(host.querySelector('[data-loader-variant="embedded"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Все публикации пользователя"]')).not.toBeNull();
  });

  it("does not show a disabled feature as an empty card", async () => {
    mocks.status = { isPending: false, data: { enabled: false } };
    await act(async () => root.render(<ProfileFeedPreview username="alice" />));
    expect(host.textContent).toBe("");
  });
});
