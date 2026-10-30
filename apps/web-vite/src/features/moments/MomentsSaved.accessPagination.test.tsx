// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentsSaved } from "./MomentsSaved";
import { ApiError } from "../../shared/api/client";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  saved: vi.fn(),
}));
vi.mock("./momentsApi", () => ({
  getMomentsStatus: mocks.status,
  listSavedMoments: mocks.saved,
}));
vi.mock("./MomentSummary", () => ({
  MomentSummary: ({ post }: { post: { text: string } }) => <li>{post.text}</li>,
}));
const verifiedStatus = { enabled: true, smartEnabled: false };
const savedPost = { id: "post_01", text: "Сохранённый проверенный момент" };
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let container: HTMLDivElement;
let root: Root;
let cache: QueryClient;
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MomentsSaved userId="viewer" />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("REAL_NETWORK_DENIED");
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  mocks.status.mockReset().mockResolvedValue(verifiedStatus);
  mocks.saved.mockReset().mockResolvedValue({ items: [savedPost], nextCursor: null });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("saved Moments availability and pagination", () => {
  it("MS-A01 does not start saved GET from cached enabled during pending/rejected status", async () => {
    const status = deferred<typeof verifiedStatus>();
    mocks.status.mockReturnValue(status.promise);
    cache.setQueryData(["moments", "status", "viewer"], verifiedStatus);
    await mount();
    expect(container.textContent).toContain("Проверяем доступ");
    expect(mocks.saved).not.toHaveBeenCalled();
    await act(async () => status.reject(Error("synthetic status unavailable")));
    await flush();
    expect(container.textContent).toContain("Не удалось проверить доступность раздела");
    expect(container.textContent).not.toContain(savedPost.text);
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("MS-A02 explicit retry restores access after status failure", async () => {
    mocks.status
      .mockRejectedValueOnce(Error("status unavailable"))
      .mockResolvedValueOnce(verifiedStatus);
    await mount();
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Проверить снова",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(mocks.status).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(savedPost.text);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([360, 1280])(
    "MS-A03 at %ipx retains valid saved posts on page-two failure",
    async (width) => {
      vi.stubGlobal("innerWidth", width);
      mocks.saved.mockImplementation(async (cursor: string | null) => {
        if (cursor !== null) throw Error("synthetic second page timeout");
        return { items: [savedPost], nextCursor: "next" };
      });
      await mount();
      expect(container.textContent).toContain(savedPost.text);
      const more = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Ещё закладки",
      );
      expect(more).toBeDefined();
      await act(async () => more?.click());
      await flush();
      expect(mocks.saved).toHaveBeenCalledWith("next");
      expect(container.textContent).toContain(savedPost.text);
      expect(container.textContent).toContain("Не удалось загрузить следующую страницу");
      expect(container.textContent).not.toContain("synthetic second page timeout");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    [401, "Сессия завершена. Войдите снова."],
    [403, "Нет доступа к сохранённым публикациям."],
    [404, "Сохранённые публикации недоступны."],
  ])("MS-A05 saved page2 HTTP%s denies cached cards without retry", async (code, message) => {
    mocks.saved.mockImplementation(async (cursor: string | null) => {
      if (cursor === null) return { items: [savedPost], nextCursor: "next" };
      throw new ApiError(code, "PRIVATE_SAVED_TRACE");
    });
    await mount();
    expect(container.textContent).toContain(savedPost.text);
    const more = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё закладки");
    expect(more).toBeDefined();
    await act(async () => more?.click());
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(container.textContent).not.toContain(savedPost.text);
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector(".moments-catalog-grid")).toBeNull();
    expect(container.textContent).not.toContain("PRIVATE_SAVED_TRACE");
    expect(container.textContent).not.toContain("Сохранённых публикаций пока нет");
    expect(container.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect([...container.querySelectorAll("button")].some((button) =>
      button.textContent?.includes("Повторить") || button.textContent?.includes("Ещё закладки")))
      .toBe(false);
    expect(container.querySelector('a[href="/login"]') !== null).toBe(code === 401);
    expect(mocks.saved.mock.calls.map(([cursor]) => cursor)).toEqual([null, "next"]);
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(["next", "retry"])("MS-FLIGHT-PRE saved same-turn double %s starts one page2 GET", async (mode) => {
    const waiting = deferred<{ items: { id: string; text: string }[]; nextCursor: null }>();
    let second = 0;
    mocks.saved.mockImplementation((cursor: string | null) => {
      if (cursor === null) return Promise.resolve({ items: [savedPost], nextCursor: "next" });
      second++;
      if (mode === "retry" && second === 1) return Promise.reject(new ApiError(503, "TEMP"));
      return waiting.promise;
    });
    await mount();
    const buttonText = mode === "next" ? "Ещё закладки" : "Повторить страницу";
    if (mode === "retry") {
      const next = [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Ещё закладки");
      await act(async () => next?.click());
      await flush();
    }
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((element) => element.textContent === buttonText);
    expect(button).toBeDefined();
    await act(async () => { button?.click(); button?.click(); });
    await flush();
    expect(mocks.saved.mock.calls.map(([cursor]) => cursor)).toEqual(
      mode === "retry" ? [null, "next", "next"] : [null, "next"],
    );
    expect(container.textContent).toContain(savedPost.text);
    await act(async () => waiting.resolve({ items: [{ id: "post-next", text: "Проверенный второй" }], nextCursor: null }));
    await flush();
    expect(container.textContent).toContain("Проверенный второй");
  });

  it("MS-FLIGHT-OWNER old pending owner page cannot block new owner's flight", async () => {
    const old = deferred<{ items: { id: string; text: string }[]; nextCursor: null }>();
    const fresh = deferred<{ items: { id: string; text: string }[]; nextCursor: null }>();
    let flight = 0;
    mocks.saved.mockImplementation((cursor: string | null) => {
      if (cursor === null) return Promise.resolve({ items: [savedPost], nextCursor: "next" });
      return ++flight === 1 ? old.promise : fresh.promise;
    });
    await mount();
    const next = () => [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Ещё закладки");
    await act(async () => next()?.click());
    await flush();
    expect(flight).toBe(1);
    await act(async () => root.render(
      <QueryClientProvider client={cache}><MomentsSaved userId="another-viewer" /></QueryClientProvider>,
    ));
    await flush();
    expect(next()).toBeDefined();
    await act(async () => next()?.click());
    await flush();
    expect(flight).toBe(2);
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.disabled && button.textContent?.includes("Загрузка"),
    )).toBe(true);
    await act(async () => old.resolve({ items: [{ id: "old-owner", text: "PRIVATE_PREVIOUS_OWNER" }], nextCursor: null }));
    await flush();
    expect(container.textContent).not.toContain("PRIVATE_PREVIOUS_OWNER");
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.disabled && button.textContent?.includes("Загрузка"),
    )).toBe(true);
    await act(async () => fresh.resolve({ items: [{ id: "new-owner", text: "Новая закладка" }], nextCursor: null }));
    await flush();
    expect(container.textContent).toContain("Новая закладка");
    expect(container.textContent).not.toContain("PRIVATE_PREVIOUS_OWNER");
    expect(mocks.saved.mock.calls.map(([cursor]) => cursor)).toEqual([null, "next", null, "next"]);
  });

  it("MS-A04 explicit next-page retry appends without dropping the first page", async () => {
    let secondAttempts = 0;
    mocks.saved.mockImplementation(async (cursor: string | null) => {
      if (cursor === null) return { items: [savedPost], nextCursor: "next" };
      secondAttempts++;
      if (secondAttempts === 1) throw new ApiError(503, "synthetic one-time outage");
      return { items: [{ id: "post_02", text: "Второй сохранённый момент" }], nextCursor: null };
    });
    await mount();
    const more = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Ещё закладки",
    );
    await act(async () => more?.click());
    await flush();
    expect(container.textContent).toContain(savedPost.text);
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Повторить страницу",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(secondAttempts).toBe(2);
    expect(mocks.saved.mock.calls.map(([cursor]) => cursor)).toEqual([null, "next", "next"]);
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".compact-grid li")).toHaveLength(2);
    expect(container.textContent).toContain(savedPost.text);
    expect(container.textContent).toContain("Второй сохранённый момент");
    expect(container.textContent?.match(/Сохранённый проверенный момент/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("synthetic one-time outage");
  });
});
