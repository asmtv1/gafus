// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    Image: ({ source, onError }: {
      source: { uri?: string }; onError?: () => void;
    }) => React.createElement("img", { src: source.uri, alt: "", onError }),
  };
});
import {
  Chat2Avatar,
  Chat2MessageAuthorAvatar,
  chat2MessageAuthorAvatarUrl,
  chat2ParticipantAvatarUrl,
} from "./Chat2Avatar";
import type { Conversation } from "./api";

const photo = "https://assets.example.test/avatar.jpg";
const room = (kind: Conversation["kind"] = "DIRECT", avatarUrl: string | null = photo) => ({
  kind,
  members: [
    { userId: "owner", username: "owner", role: "MEMBER", avatarUrl: "https://assets.example.test/self.jpg" },
    { userId: "other", username: "other", role: "MEMBER", avatarUrl },
  ],
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Native Chat2 participant avatar", () => {
  it("chooses the recipient's photo, not the account owner's", () => {
    expect(chat2ParticipantAvatarUrl(room(), "owner")).toBe(photo);
  });

  it("does not expose group member portraits or malformed image schemes", () => {
    expect(chat2ParticipantAvatarUrl(room("GROUP"), "owner")).toBeNull();
    expect(chat2ParticipantAvatarUrl(room("DIRECT", "javascript:alert(1)"), "owner")).toBeNull();
    expect(chat2ParticipantAvatarUrl(room("DIRECT", null), "owner")).toBeNull();
  });

  it("shows the group's own avatar, never the first member avatar", () => {
    expect(chat2ParticipantAvatarUrl({ ...room("GROUP"), avatarUrl: "https://assets.example.test/group.jpg" }, "owner"))
      .toBe("https://assets.example.test/group.jpg");
    expect(chat2ParticipantAvatarUrl({ ...room("GROUP"), avatarUrl: "javascript:alert(1)" }, "owner"))
      .toBeNull();
  });

  it("renders the recipient photo and falls back if the request fails", async () => {
    await act(async () => root.render(
      createElement(Chat2Avatar, { room: room(), ownerId: "owner" }, "👤"),
    ));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(photo);
    expect(host.textContent).not.toContain("👤");
    await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("👤");
    await act(async () => root.render(
      createElement(Chat2Avatar, {
        room: room("DIRECT", "https://assets.example.test/updated.jpg"), ownerId: "owner",
      }, "👤"),
    ));
    expect(host.querySelector("img")?.getAttribute("src"))
      .toBe("https://assets.example.test/updated.jpg");
  });
});

describe("Native Chat2 sender avatars", () => {
  it("uses the author photo in a community, not another participant or the group icon", () => {
    const community = {
      ...room("COMMUNITY"),
      avatarUrl: "https://assets.example.test/group.jpg",
    };
    expect(chat2MessageAuthorAvatarUrl(community, "other")).toBe(photo);
    expect(chat2MessageAuthorAvatarUrl(community, "owner"))
      .toBe("https://assets.example.test/self.jpg");
    expect(chat2MessageAuthorAvatarUrl(community, "missing")).toBeNull();
  });

  it("never renders unsafe or malformed author avatar links", () => {
    for (const invalid of [
      "javascript:alert(1)", "data:image/png;base64,dGVzdA==",
      "https://user:pass@example.com/avatar.png", "//example.com/avatar.png",
      "ftp://example.com/avatar.png", "",
    ]) {
      expect(chat2MessageAuthorAvatarUrl(room("COMMUNITY", invalid), "other")).toBeNull();
    }
    expect(chat2MessageAuthorAvatarUrl(null, "other")).toBeNull();
  });

  it("renders a sender portrait with fallback when it cannot be loaded", async () => {
    await act(async () => root.render(createElement(
      Chat2MessageAuthorAvatar, { room: room("COMMUNITY"), authorId: "other" }, "👤",
    )));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(photo);
    expect(host.textContent).not.toContain("👤");
    await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("👤");
  });

  it("refreshes sender portrait when the membership photo URL changes", async () => {
    const updated = "https://assets.example.test/updated.jpg";
    await act(async () => root.render(createElement(
      Chat2MessageAuthorAvatar, { room: room("GROUP"), authorId: "other" }, "👤",
    )));
    await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    await act(async () => root.render(createElement(Chat2MessageAuthorAvatar, {
      room: room("GROUP", updated), authorId: "other",
    }, "👤")));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(updated);
  });

  it("uses a fallback icon when the author has no uploaded portrait", async () => {
    await act(async () => root.render(createElement(
      Chat2MessageAuthorAvatar,
      { room: room("COMMUNITY", null), authorId: "other" }, "👤",
    )));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("👤");
  });
});
