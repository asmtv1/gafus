// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CourseOverview } from "./CourseOverview";

const row = (access = true) => ({
  id: "course_01",
  name: "Старый платный курс",
  type: "obedience",
  shortDesc: "Описание курса",
  duration: "14 дней",
  isPaid: true,
  isPrivate: false,
  hasAccess: access,
  isFavorite: true,
  userStatus: "IN_PROGRESS",
  trainingLevel: "BEGINNER",
});
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "PRIVATE_SQL_DIAGNOSTIC",
    }),
    { status },
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 22));
  });
}
async function mount(userId: string | null = "A") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <CourseOverview
          userId={userId}
          courseId="course_01"
          showTrainingDaysOptIn
          trainingRouteMode
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("COURSE-010 detail cached owner access", () => {
  it("C-O01 no stale access before fresh GET; paid-public course outline available after verification", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["courses", "catalog", "A"], [row(true)]);
    await mount();
    expect(host.textContent).toContain("Проверяем доступ к курсу");
    expect(host.textContent).not.toContain("Старый платный курс");
    expect(host.querySelector('a[href="/trainings/obedience"]')).toBeNull();
    await act(async () => pending.resolve(response([row(false)])));
    await flush();
    expect(host.textContent).toContain("Для занятий требуется подписка или назначение");
    // The public paid outline is intentionally visible without Premium;
    // lesson content remains subject to the server-side step entitlement.
    expect(host.querySelector('a[href="/trainings/obedience"]')?.textContent).toContain(
      "Посмотреть программу платного курса",
    );
  });

  it("C-O02 rejected stale GET never republishes cached access", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["courses", "catalog", "A"], [row(true)]);
    await mount();
    await act(async () => pending.resolve(response(null, 503)));
    await flush();
    expect(host.textContent).toContain("Не удалось загрузить курс");
    expect(host.textContent).not.toContain("Старый платный курс");
    expect(host.querySelector(".course-card")).toBeNull();
  });

  it("C-O03 401 shows sign-in without retry or private error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null, 401)));
    await mount();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Повторить");
    expect(host.textContent).not.toContain("PRIVATE_SQL_DIAGNOSTIC");
  });
});
