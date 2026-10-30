// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CourseCatalog } from "./CourseCatalog";
import { FavoriteCourseButton } from "./FavoriteCourseButton";

const row = (name = "Курс пользователя A", favorite = true, access = true) => ({
  id: "course_01",
  name,
  type: "obedience",
  shortDesc: "Учим собаку",
  duration: "12 дней",
  isPaid: true,
  isPrivate: false,
  hasAccess: access,
  isFavorite: favorite,
  userStatus: "IN_PROGRESS",
  trainingLevel: "BEGINNER",
});
const response = (rows: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data: rows,
      ...(status === 200 ? {} : { error: "PRIVATE_BACKEND_MESSAGE" }),
    }),
    { status },
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 22));
  });
}
async function mount(userId: string | null = "A", favoritesOnly = true, withDetailFavorite = false, favoriteInitially = false) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <CourseCatalog userId={userId} favoritesOnly={favoritesOnly} />
        {withDetailFavorite && userId && <FavoriteCourseButton
          userId={userId} courseId="course_01" isFavorite={favoriteInitially} />}
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

describe("COURSE-010 favorite catalog fresh owner access", () => {
  it("C-F01 cached favorite and paid access stay hidden pending owner GET", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    cache.setQueryData(["courses", "catalog", "A"], [row()]);
    await mount();
    expect(host.textContent).toContain("Проверяем избранные курсы");
    expect(host.textContent).not.toContain("Курс пользователя A");
    expect(host.textContent).not.toContain("Доступен");
    expect(host.querySelector('[aria-label="Убрать из избранного"]')).toBeNull();
    await act(async () => pending.resolve(response([row("Курс обновлён", false, false)])));
    await flush();
    expect(host.textContent).toContain("У вас пока нет избранных курсов");
    expect(host.textContent).not.toContain("Курс пользователя A");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("C-F02 cached favorite never reappears after failed revalidation", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    cache.setQueryData(["courses", "catalog", "A"], [row()]);
    await mount();
    await act(async () => pending.resolve(response(null, 503)));
    await flush();
    expect(host.textContent).toContain("Не удалось загрузить курсы");
    expect(host.textContent).not.toContain("Курс пользователя A");
    expect(host.querySelector(".course-card")).toBeNull();
  });

  it("C-F03 favorites have no anonymous UI or network calls", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await mount(null, true);
    expect(host.textContent).toBe("");
    expect(host.querySelector(".course-card")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("C-F04 401 is terminal session error without leaking server message", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(null, 401));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Повторить");
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_MESSAGE");
  });

  it("C-F05 retry on 503 reads current favorites, without optimistic flags", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(null, 503))
      .mockResolvedValueOnce(response([row("Курс после восстановления", true, false)]));
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (el) => el.textContent === "Повторить",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(host.textContent).toContain("Курс после восстановления");
    expect(host.textContent).toContain("По подписке");
    expect(host.querySelector(".course-card .access-tag")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("C-F06 contradictory 200 favorite ACK fails without optimistic UI or automatic POST", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([row("Занятие", false, false)]))
      .mockResolvedValueOnce(response({ isFavorite: false }));
    vi.stubGlobal("fetch", fetcher);
    await mount("A", false, true, false);
    const add = host.querySelector<HTMLButtonElement>(".course-favorite button");
    expect(add).not.toBeNull();
    await act(async () => add?.click());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/courses/favorites");
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(host.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(host.textContent).toContain("Не удалось подтвердить избранное");
    expect(host.textContent).toContain("Проверьте актуальное состояние");
  });

  it("C-F07 contradictory 200 remove ACK does not silently remove favorite", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([row()]))
      .mockResolvedValueOnce(response({ isFavorite: true }));
    vi.stubGlobal("fetch", fetcher);
    await mount("A", true, true, true);
    const remove = host.querySelector<HTMLButtonElement>(".course-favorite button");
    expect(remove).not.toBeNull();
    await act(async () => remove?.click());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(host.querySelector('[aria-pressed="true"]')).not.toBeNull();
    expect(host.textContent).toContain("Не удалось подтвердить избранное");
  });

  it("C-F08 late pending favorite from A never locks or errors B card", async () => {
    const oldMutation = deferred<Response>();
    let catalogGets = 0;
    const fetcher = vi.fn((path: string, opts?: RequestInit) => {
      if (path === "/api/v1/courses/favorites" && opts?.method === "POST")
        return oldMutation.promise;
      if (path === "/api/v1/courses") {
        catalogGets++;
        return Promise.resolve(
          response([row(catalogGets === 1 ? "Курс A" : "Курс B", catalogGets !== 1, false)]),
        );
      }
      throw Error("UNEXPECTED_HTTP_PATH");
    });
    vi.stubGlobal("fetch", fetcher);
    await mount("A", false, true, false);
    const oldAdd = host.querySelector<HTMLButtonElement>(".course-favorite button");
    await act(async () => oldAdd?.click());
    await flush();
    expect(host.textContent).toContain("Сохраняем");
    await mount("B", false, true, true);
    expect(host.textContent).toContain("Курс B");
    expect(host.textContent).not.toContain("Курс A");
    expect(host.textContent).not.toContain("Сохраняем");
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Убрать из избранного"]')?.disabled,
    ).toBe(false);
    await act(async () => oldMutation.resolve(response(null, 503)));
    await flush();
    expect(host.textContent).not.toContain("Не удалось подтвердить избранное");
    expect(host.textContent).toContain("Курс B");
    expect(
      fetcher.mock.calls.filter(
        ([path, opts]) => path === "/api/v1/courses/favorites" && opts?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("C-F09 failed favorite ACK offers GET-only reconciliation, never a second POST", async () => {
    let getCount = 0;
    const fetcher = vi.fn((path: string, opts?: RequestInit) => {
      if (path === "/api/v1/courses") {
        getCount++;
        return Promise.resolve(response([row("Курс", getCount === 2, false)]));
      }
      if (path === "/api/v1/courses/favorites" && opts?.method === "POST")
        return Promise.resolve(response({ isFavorite: false }));
      throw Error("UNEXPECTED_ENDPOINT");
    });
    vi.stubGlobal("fetch", fetcher);
    await mount("A", false, true, false);
    const add = host.querySelector<HTMLButtonElement>(".course-favorite button");
    await act(async () => add?.click());
    await flush();
    expect(host.textContent).toContain("Не удалось подтвердить избранное");
    const check = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Обновить список курсов",
    );
    expect(check).toBeDefined();
    await act(async () => check?.click());
    await flush();
    expect(getCount).toBe(2);
    expect((cache.getQueryData(["courses", "catalog", "A"]) as ReturnType<typeof row>[])[0]?.isFavorite).toBe(true);
    expect(
      fetcher.mock.calls.filter(
        ([path, opts]) => path === "/api/v1/courses/favorites" && opts?.method === "POST",
      ),
    ).toHaveLength(1);
  });
});
