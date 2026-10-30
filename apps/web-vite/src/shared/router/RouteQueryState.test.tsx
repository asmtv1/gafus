// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  momentPath, navigate, RouteLink, useRoutePath, useRouteSearch,
} from "./location";

async function probe(path: string) {
  window.history.replaceState(null, "", path);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Current() {
    const route = useRoutePath();
    const search = useRouteSearch();
    return createElement("div", {}, [
      createElement("output", { key: "route", "data-route": true },
        route ?? "not-found"),
      createElement("output", { key: "search", "data-search": true }, search),
      createElement(RouteLink, { key: "post", to: momentPath("post-A"),
        children: "К публикации" }),
      createElement(RouteLink, { key: "courses", to: "/courses", children: "Курсы" }),
    ]);
  }
  await act(async () => root.render(createElement(Current)));
  return {
    host,
    route: () => host.querySelector<HTMLSpanElement>("[data-route]")?.textContent,
    search: () => host.querySelector<HTMLSpanElement>("[data-search]")?.textContent,
    async click(label: string, opts: MouseEventInit = {}) {
      const anchor = [...host.querySelectorAll<HTMLAnchorElement>("a")]
        .find(el => el.textContent === label);
      expect(anchor).toBeDefined();
      const event = new MouseEvent("click", {
        button: 0, bubbles: true, cancelable: true, ...opts,
      });
      await act(async () => anchor?.dispatchEvent(event));
      return event.defaultPrevented;
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AG2 G1-WEB-008 pathname and URL search/hash navigation", () => {
  it("does not rewrite a direct bookmarked commentId or hash on first render", async () => {
    const ui = await probe("/moments/post-A?commentId=answer-1#comments");
    try {
      expect(ui.route()).toBe("/moments/post-A");
      expect(ui.search()).toBe("?commentId=answer-1");
      expect(window.location.hash).toBe("#comments");
      expect(window.location.pathname).toBe("/moments/post-A");
    } finally { await ui.cleanup(); }
  });

  it("navigate to the same path clears query/hash and notifies useRouteSearch", async () => {
    const ui = await probe("/moments/post-A?commentId=answer-1#comments");
    try {
      await act(async () => navigate(momentPath("post-A")));
      expect(window.location.pathname).toBe("/moments/post-A");
      expect(window.location.search).toBe("");
      expect(window.location.hash).toBe("");
      expect(ui.route()).toBe("/moments/post-A");
      expect(ui.search()).toBe("");
    } finally { await ui.cleanup(); }
  });

  it("ordinary same-path anchor clears stale parameters; Ctrl+click stays native", async () => {
    const ui = await probe("/moments/post-A?commentId=answer-1#comments");
    try {
      // Do not let jsdom try opening a separate document on Ctrl+click.
      let routerIntercepted = true;
      document.addEventListener("click", event => {
        routerIntercepted = event.defaultPrevented;
        event.preventDefault();
      }, { once: true });
      await ui.click("К публикации", { ctrlKey: true });
      expect(routerIntercepted).toBe(false);
      expect(window.location.search).toBe("?commentId=answer-1");
      // A plain link has href=/moments/post-A: the address must match that target.
      const plain = await ui.click("К публикации");
      expect(plain).toBe(true);
      expect(window.location.href.endsWith("/moments/post-A")).toBe(true);
      expect(ui.search()).toBe("");
    } finally { await ui.cleanup(); }
  });

  it("preserves legacy /feed bookmark until an explicit canonical link is followed", async () => {
    const ui = await probe("/feed/post-A?commentId=answer-1#comments");
    try {
      expect(ui.route()).toBe("/moments/post-A");
      expect(ui.search()).toBe("?commentId=answer-1");
      expect(window.location.pathname).toBe("/feed/post-A");
      await ui.click("К публикации");
      expect(window.location.pathname).toBe("/moments/post-A");
      expect(window.location.search).toBe("");
      expect(window.location.hash).toBe("");
    } finally { await ui.cleanup(); }
  });

  it("query-only popstate can restore the old focused deep link", async () => {
    const ui = await probe("/moments/post-A?commentId=first#comments");
    try {
      await act(async () => navigate(momentPath("post-A")));
      expect(ui.search()).toBe("");
      await act(async () => {
        window.history.replaceState(null, "",
          "/moments/post-A?commentId=first#comments");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(ui.route()).toBe("/moments/post-A");
      expect(ui.search()).toBe("?commentId=first");
      expect(window.location.hash).toBe("#comments");
    } finally { await ui.cleanup(); }
  });
});
