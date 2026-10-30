// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { GafusHeader } from "./GafusHeader";
import { routeForPath } from "../shared/router/location";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let cache: QueryClient;
async function mount(authenticated: boolean) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/profile");
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <GafusHeader authenticated={authenticated}/>
  </QueryClientProvider>));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  if (cache) cache.clear();
  host?.remove();
  window.history.replaceState(null, "", "/");
});
describe("GAFUS shared header Chat2 navigation", () => {
  it("authenticated user can enter registered chat route from ordinary menu", async () => {
    await mount(true);
    const open = host.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]');
    expect(open).not.toBeNull();
    await act(async () => open?.click());
    const link = host.querySelector<HTMLAnchorElement>('nav a[href="/chats"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Сообщения");
    expect(link?.getAttribute("aria-disabled")).toBeNull();
    expect(routeForPath("/chats")).toBe("/chats");
    await act(async () => link?.click());
    expect(window.location.pathname).toBe("/chats");
  });
  it("guest header never presents private chat route", async () => {
    await mount(false);
    expect(host.querySelector('a[href="/chats"]')).toBeNull();
  });
});
