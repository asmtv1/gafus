// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentAuthorAvatar } from "./MomentAuthorAvatar";

let root: Root;
let host: HTMLDivElement;
let reveal: (() => void) | undefined;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      reveal = () => callback([{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver);
    }
    observe() { /* await viewport */ }
    disconnect() { /* scoped */ }
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, data: {
    id: "post_1", author: { username: "author_1",
      avatarUrl: "https://images.example.test/valid-avatar.webp" },
  } }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); reveal = undefined;
});
describe("Moments author image from authorized noncached post detail", () => {
  it("fetches only near viewport, reveals a loaded avatar instead of initials", async () => {
    await act(async () => root.render(
      <MomentAuthorAvatar postId="post_1" username="author_1" name="Анна" />));
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("А");
    await act(async () => { reveal?.(); await Promise.resolve(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/feed/posts/post_1");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
    const img = host.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://images.example.test/valid-avatar.webp");
    await act(async () => img.dispatchEvent(new Event("load")));
    expect(img.style.opacity).toBe("1");
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("А");
  });
  it("rejects an author mismatch rather than showing a foreign avatar", async () => {
    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({ success: true, data: {
      id: "post_1", author: { username: "impostor", avatarUrl: "https://images.example.test/secret.webp" },
    } }), { status: 200 }));
    await act(async () => root.render(
      <MomentAuthorAvatar postId="post_1" username="author_1" name="Анна" />));
    await act(async () => { reveal?.(); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("А");
  });
});
