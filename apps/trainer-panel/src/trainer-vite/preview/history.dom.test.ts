// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreviewApp } from "./PreviewApp";
import { navigatePreview, validPreviewClick } from "./history";

let host: HTMLDivElement;
let root: Root;
const target = "/main-panel/steps";

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/main-panel");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(PreviewApp, { role: "TRAINER" })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/main-panel");
});

describe("AG4 isolated Vite mock History API", () => {
  it("clicks a normal local anchor without a reload and focuses new main", async () => {
    const link = host.querySelector<HTMLAnchorElement>('nav a[href="' + target + '"]');
    expect(link).not.toBeNull();
    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(window.location.pathname).toBe(target);
    expect(host.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe(target);
    expect(document.activeElement).toBe(host.querySelector("main"));
  });

  it("updates reactively for popstate and preserves working deep URLs", async () => {
    await act(async () => {
      window.history.replaceState(null, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe(target);
    expect(document.activeElement).toBe(host.querySelector("main"));
  });

  it("rejects unknown or external URL without mutating history", async () => {
    const oldPath = window.location.pathname;
    expect(navigatePreview("https://evil.example/")).toBe(false);
    expect(navigatePreview("//evil.example")).toBe(false);
    expect(navigatePreview("/main-panel/%2e%2e")).toBe(false);
    expect(window.location.pathname).toBe(oldPath);
  });

  it("does not intercept modifier clicks, downloads, target or other buttons", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", target);
    const click = new MouseEvent("click", { button: 0, bubbles: true, cancelable: true });
    expect(validPreviewClick(click, anchor)).toBe(true);
    expect(validPreviewClick(new MouseEvent("click", { ctrlKey: true }), anchor)).toBe(false);
    expect(validPreviewClick(new MouseEvent("click", { metaKey: true }), anchor)).toBe(false);
    expect(validPreviewClick(new MouseEvent("click", { shiftKey: true }), anchor)).toBe(false);
    expect(validPreviewClick(new MouseEvent("click", { altKey: true }), anchor)).toBe(false);
    expect(validPreviewClick(new MouseEvent("click", { button: 1 }), anchor)).toBe(false);
    anchor.setAttribute("download", "");
    expect(validPreviewClick(click, anchor)).toBe(false);
    anchor.removeAttribute("download");
    anchor.target = "_blank";
    expect(validPreviewClick(click, anchor)).toBe(false);
  });

  it("retains allowlisted demoRole but never forwards arbitrary private query", async () => {
    window.history.replaceState(null, "", "/main-panel?demoRole="+
      "TRAINER"+"&token=secret");
    await act(async () => {
      expect(navigatePreview(target)).toBe(true);
    });
    expect(window.location.pathname).toBe(target);
    expect(window.location.search).toBe("?demoRole="+ "TRAINER");
    expect(window.location.search).not.toContain("token");
  });
});
