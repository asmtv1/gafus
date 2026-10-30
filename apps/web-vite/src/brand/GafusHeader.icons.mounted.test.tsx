// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GafusHeader } from "./GafusHeader";

const images = [
  ["/profile", "profile", "/images/tab-icons/profile.webp"],
  ["/pets", "pets", "/images/tab-icons/pets.webp"],
  ["/courses", "courses", "/images/tab-icons/courses.webp"],
  ["/moments", "feed", "/images/tab-icons/feed.webp"],
  ["/questions", "questions", "/images/tab-icons/questions.png"],
  ["/consultations", "cynologist", "/images/tab-icons/cynologist.webp"],
  ["/chats", "chat", "/images/tab-icons/chat.webp"],
  ["/profile/albums", "albums", "/images/tab-icons/albums.webp"],
  ["/reminders", "reminders", "/images/profile-icons/reminders.webp"],
  ["/articles", "articles", "/images/tab-icons/articles.webp"],
] as const;
let root: Root;
let node: HTMLDivElement;
let cache: QueryClient;
async function render(authenticated: boolean) {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <GafusHeader authenticated={authenticated} />
  </QueryClientProvider>));
}
async function openMenu() {
  const trigger = node.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger?.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/articles");
  node = document.createElement("div"); document.body.append(node);
  root = createRoot(node);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); node.remove();
  window.history.replaceState(null, "", "/");
});
describe("original Next menu artwork and consistent icon slots", () => {
  it("uses ten original menu images and the actual Next logout artwork", async () => {
    await render(true);
    await openMenu();
    const nav = node.querySelector('nav[aria-label="Разделы"]');
    expect(nav).not.toBeNull();
    const menuButton = node.querySelector<HTMLButtonElement>('button[aria-label="Закрыть меню"]');
    expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    expect(menuButton?.querySelectorAll('span[aria-hidden="true"] > div > div'))
      .toHaveLength(3);
    expect(menuButton?.querySelector('img[src*="menu-icon"]')).toBeNull();

    expect(nav?.querySelectorAll("span[data-menu-icon] img")).toHaveLength(11);
    for (const [href, key, src] of images) {
      const link = [...nav!.querySelectorAll<HTMLAnchorElement>("a")]
        .find((item) => item.getAttribute("href") === href);
      expect(link?.querySelector(`[data-menu-icon="${key}"] img`)?.getAttribute("src"))
        .toBe(src);
      expect(link?.querySelector("img")?.getAttribute("alt")).toBe("");
    }
    const logout = [...nav!.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Выход"));
    expect(logout?.querySelector('[data-menu-icon="logout"] img')?.getAttribute("src"))
      .toBe("/images/profile-icons/logout.webp");
    expect(logout?.textContent).not.toContain("↪");
    expect(logout?.type).toBe("button");
    expect(logout?.disabled).toBe(false);
  });
  it("does not expose a private menu or logout action to guests", async () => {
    await render(false);
    expect(node.querySelector('nav[aria-label="Разделы"]')).toBeNull();
    expect(node.textContent).not.toContain("Выход");
  });
});
