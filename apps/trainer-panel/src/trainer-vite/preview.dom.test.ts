// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockPanelShell } from "./MockPanelShell";
import type { PanelRole } from "./routes";

const defaultRole: PanelRole = "TRAINER";
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(pathname: string, role: PanelRole = defaultRole): Promise<void> {
  await act(async () => {
    root.render(createElement(MockPanelShell, { pathname, role }));
  });
}

describe("AG4 jsdom browser-DOM characterization (not device/browser E2E)", () => {
  it("mounts a semantic nav with the actual number of focusable links", async () => {
    await render("/main-panel");
    const nav = host.querySelector("nav");
    expect(nav).not.toBeNull();
    const items = nav?.querySelectorAll("a[href]");
    expect(items).toHaveLength(15);
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelectorAll("main")).toHaveLength(1);
  });

  it("selects the closest parent on a dynamic URL without redirect", async () => {
    await render("/main-panel/steps/id-123/edit");
    const current = host.querySelectorAll('nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current.item(0).getAttribute("href")).toBe("/main-panel/steps");
  });

  it("keeps skip link and main focusable with native DOM focus", async () => {
    await render("/main-panel");
    expect(host.querySelector('a[href="#ag4-main"]')).not.toBeNull();
    const main = host.querySelector<HTMLElement>("main");
    expect(main?.tabIndex).toBe(-1);
    main?.focus();
    expect(document.activeElement).toBe(main);
  });

  it("reactively removes navigation after an access downgrade", async () => {
    await render("/main-panel");
    expect(host.querySelector("nav")).not.toBeNull();
    await render("/main-panel", "USER");
    expect(host.querySelector("nav")).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await render("/main-panel", "MODERATOR");
    expect(host.querySelector("nav")).toBeNull();
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    await render("/main-panel", defaultRole);
    expect(host.querySelector("nav")).not.toBeNull();
  });

  it("fails closed for a forged runtime role and unknown route", async () => {
    await render("/main-panel", "SUPERADMIN" as PanelRole);
    expect(host.querySelector("nav")).toBeNull();
    expect(host.textContent).toContain("Нет доступа");
    await render("/bad", defaultRole);
    expect(host.querySelector("nav")).toBeNull();
    expect(host.textContent).toContain("Страница не найдена");
  });

  it("keeps preview access conditional on known role; no actions or credentials", async () => {
    await render("/main-panel");
    expect(host.querySelectorAll("form, button, input")).toHaveLength(0);
    expect(host.textContent).toContain("Только макет.");
    expect(host.textContent).not.toMatch(/accessToken|refreshToken|password/i);
  });
});
