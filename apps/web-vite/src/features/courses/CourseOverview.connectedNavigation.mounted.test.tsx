// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseOverview } from "./CourseOverview";

const course = {
  id: "course_01", name: "Не подбирай", type: "NOT_PICKING",
  shortDesc: "Учим отпускать", duration: "20 дней",
  isPaid: false, isPrivate: false, hasAccess: true,
  isFavorite: false, userStatus: "NOT_STARTED", trainingLevel: "BEGINNER",
};
afterEach(() => vi.unstubAllGlobals());
async function render(userId: string | null, hasAccess = true) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const fetcher = vi.fn(async (_path: string, _request?: RequestInit) =>
    new Response(JSON.stringify({
    success: true, data: [{ ...course, hasAccess }],
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const div = document.createElement("div"); document.body.append(div);
  const root = createRoot(div);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <CourseOverview courseId="course_01" userId={userId} connectedRoute />
  </QueryClientProvider>));
  await act(async () => new Promise(resolve => setTimeout(resolve, 15)));
  return { div, fetcher, async cleanup() {
    await act(async () => root.unmount()); cache.clear(); div.remove();
  } };
}
describe("actual /courses/:id navigation restored from Next", () => {
  it("authenticated entitled user can open real training and reviews routes", async () => {
    const ui = await render("owner_A", true);
    try {
      expect(ui.div.querySelector('a[href="/trainings/NOT_PICKING"]')).not.toBeNull();
      expect(ui.div.querySelector('a[href="/trainings/NOT_PICKING/reviews"]')).not.toBeNull();
      expect(ui.fetcher.mock.calls[0]?.[0]).toBe("/api/v1/courses");
    } finally { await ui.cleanup(); }
  });
  it("locked course and guest have no private training/review entry", async () => {
    const locked = await render("owner_A", false);
    try {
      expect(locked.div.querySelector('a[href^="/trainings/"]')).toBeNull();
    } finally { await locked.cleanup(); }
    const guest = await render(null, true);
    try {
      expect(guest.div.querySelector('a[href^="/trainings/"]')).toBeNull();
      expect(guest.fetcher).not.toHaveBeenCalled();
      expect(guest.div.textContent).toBe("");
    } finally { await guest.cleanup(); }
  });
});
