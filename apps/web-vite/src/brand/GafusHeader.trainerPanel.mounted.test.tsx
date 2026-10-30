// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GafusHeader, canSeeTrainerPanel } from "./GafusHeader";
import type { AuthUser } from "../shared/auth/authApi";

let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
async function render(role: AuthUser["role"] | null, authenticated = true) {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <GafusHeader authenticated={authenticated} role={role} />
  </QueryClientProvider>));
}
async function openMenu() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]');
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}
const panelLink = () => host.querySelector<HTMLAnchorElement>(
  'nav[aria-label="Разделы"] a[href="https://trainer-panel.gafus.ru/"]',
);
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/articles");
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove();
  window.history.replaceState(null, "", "/");
});
describe("Next trainer panel role gate and URL", () => {
  it.each(["TRAINER", "ADMIN", "MODERATOR"] as const)(
    "renders canonical trainer panel after articles for %s", async role => {
      expect(canSeeTrainerPanel(role)).toBe(true);
      await render(role);
      await openMenu();
      const link = panelLink();
      expect(link?.textContent).toBe("Панель тренера");
      expect(link?.getAttribute("href")).toBe("https://trainer-panel.gafus.ru/");
      expect(link?.querySelector('img[alt=""]')?.getAttribute("src"))
        .toBe("/images/profile-icons/trainer-notes.webp");
      const menu = host.querySelector('nav[aria-label="Разделы"]');
      const links = [...(menu?.querySelectorAll("a") ?? [])];
      const article = links.findIndex(l => l.getAttribute("href") === "/articles");
      expect(article).toBeGreaterThanOrEqual(0);
      expect(links[article + 1]).toBe(link);
      const logout = menu?.querySelector("button");
      expect(link?.compareDocumentPosition(logout!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    },
  );
  it.each(["USER", "PARTNER"] as const)("hides panel from %s", async role => {
    expect(canSeeTrainerPanel(role)).toBe(false);
    await render(role);
    await openMenu();
    expect(panelLink()).toBeNull();
  });
  it("hides the panel on an unresolved role, then updates on verified role change", async () => {
    expect(canSeeTrainerPanel(null)).toBe(false);
    await render(null);
    await openMenu();
    expect(panelLink()).toBeNull();
    await render("TRAINER");
    expect(panelLink()).not.toBeNull();
    await render("USER");
    expect(panelLink()).toBeNull();
  });
  it("never shows trainer panel in a guest header even if a stale role is supplied", async () => {
    await render("ADMIN", false);
    expect(panelLink()).toBeNull();
    expect(host.textContent).not.toContain("Панель тренера");
  });
});
