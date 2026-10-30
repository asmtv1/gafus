// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentCommentAvatar } from "./MomentCommentAvatar";

let root: Root;
let host: HTMLDivElement;
let reveal: (() => void) | undefined;
let fetcher: ReturnType<typeof vi.fn>;
const commentResponse = (id = "comment_1", username = "author_1", avatarUrl: string | null =
  "https://storage.yandexcloud.net/test-bucket/example.webp") =>
  new Response(JSON.stringify({ success: true, data: { id,
    author: { username, avatarUrl },
  } }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      reveal = () => callback([{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver);
    }
    observe() { /* Only load near viewport. */ }
    disconnect() { /* Observer scoped to avatar. */ }
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  fetcher = vi.fn(async () => commentResponse());
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); reveal = undefined;
});

describe("Moments comment avatars use authorized, uncached comment detail", () => {
  const render = async () => act(async () => root.render(
    <MomentCommentAvatar commentId="comment_1" username="author_1" name="Анна" />));
  const enterViewport = async () => {
    await act(async () => { reveal?.(); await new Promise(resolve => setTimeout(resolve, 20)); });
  };
  it("shows the real author photo only when in viewport and keeps an initials fallback", async () => {
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("А");
    await enterViewport();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/feed/comments/comment_1");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET", credentials: "include", cache: "no-store",
    });
    const img = host.querySelector(".moment-comment-avatar img")! as HTMLImageElement;
    expect(img.src).toBe("https://storage.yandexcloud.net/test-bucket/example.webp");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => img.dispatchEvent(new Event("load")));
    expect(img.style.opacity).toBe("1");
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("А");
  });
  it("rejects mismatching authors and wrong comment ids", async () => {
    fetcher.mockImplementationOnce(async () => commentResponse("comment_1", "intruder"));
    await render(); await enterViewport();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("А");
  });
  it("rejects unexpected IDs and unsafe URL schemes", async () => {
    fetcher.mockImplementationOnce(async () => commentResponse("wrong_id"));
    await render(); await enterViewport();
    expect(host.querySelector("img")).toBeNull();
  });
  it("never loads an opaque or unsafe avatar URL", async () => {
    fetcher.mockImplementationOnce(async () => commentResponse("comment_1", "author_1", "javascript:alert(1)"));
    await render(); await enterViewport();
    expect(host.querySelector("img")).toBeNull();
  });
  it("does not render a photo on denied or missing comment", async () => {
    fetcher.mockImplementationOnce(async () => new Response(null, { status: 403 }));
    await render(); await enterViewport();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("А");
  });
});
