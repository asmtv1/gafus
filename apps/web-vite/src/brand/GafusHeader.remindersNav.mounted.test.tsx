// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { GafusHeader } from "./GafusHeader";
import { routeForPath } from "../shared/router/location";

let host: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;
let client: QueryClient | undefined;
async function mount(authenticated: boolean, initialPath = "/profile") {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", initialPath);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root?.render(<QueryClientProvider client={client!}>
    <GafusHeader authenticated={authenticated} />
  </QueryClientProvider>));
}
async function openMenu() {
  const button = host?.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]');
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  client?.clear(); host?.remove();
  root = undefined; client = undefined; host = undefined;
  window.history.replaceState(null, "", "/");
});
describe("retained Next reminders sidebar parity", () => {
  it("shows original title, image and position, then navigates to registered route", async () => {
    await mount(true);
    await openMenu();
    const links = [...host!.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Разделы"] a')];
    const albums = links.findIndex(a => a.getAttribute("href") === "/profile/albums");
    const reminders = links.findIndex(a => a.getAttribute("href") === "/reminders");
    const articles = links.findIndex(a => a.getAttribute("href") === "/articles");
    expect(reminders).toBe(albums + 1);
    expect(articles).toBe(reminders + 1);
    const link = links[reminders];
    expect(link.textContent).toContain("Напоминания о тренировках");
    expect(link.querySelector("img")?.getAttribute("src"))
      .toBe("/images/profile-icons/reminders.webp");
    expect(routeForPath("/reminders")).toBe("/reminders");
    await act(async () => link.click());
    expect(window.location.pathname).toBe("/reminders");
    expect(link.getAttribute("aria-current")).toBe("page");
  });
  it("highlights reminders rather than profile on direct /reminders load", async () => {
    await mount(true, "/reminders");
    await openMenu();
    expect(host?.querySelector('nav a[href="/reminders"]')?.getAttribute("aria-current")).toBe("page");
    expect(host?.querySelector('nav a[href="/profile"]')?.getAttribute("aria-current")).toBeNull();
  });
  it("does not expose a private reminders link in the guest header", async () => {
    await mount(false);
    expect(host?.querySelector('a[href="/reminders"]')).toBeNull();
  });
});
