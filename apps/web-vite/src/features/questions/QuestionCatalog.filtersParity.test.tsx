// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionCatalog } from "./QuestionCatalog";
import { listQuestionsPage } from "./questionApi";

const question = (id: string) => ({
  id,
  title: id === "one" ? "Вопрос про корм" : "Вопрос про поводок",
  body: "Длинное описание вопроса",
  category: "Поведение",
  status: "waiting",
  answerCount: 0,
  createdAt: "2026-10-20T12:00:00Z",
  author: { id: "PRIVATE_AUTHOR", name: "Участник" },
});
const response = (items: unknown[], nextPage: number | null = null) =>
  new Response(
    JSON.stringify({
      success: true,
      data: {
        items,
        nextPage,
        canPublish: true,
        blockReason: null,
      },
    }),
    { status: 200 },
  );
const tick = async (ms = 30) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};
async function mount(fetcher: ReturnType<typeof vi.fn>, userId = "USER-A") {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = async (id: string) => {
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: cache },
          createElement(QuestionCatalog, { userId: id }),
        ),
      ),
    );
    await tick();
  };
  await render(userId);
  return {
    host,
    cache,
    render,
    async cleanup() {
      await act(async () => root.unmount());
      cache.clear();
      host.remove();
    },
  };
}
async function select(host: HTMLElement, id: string, value: string) {
  const control = host.querySelector<HTMLSelectElement>(`#${id}`)!;
  expect(control).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
      control,
      value,
    );
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await tick();
}
async function input(host: HTMLElement, value: string) {
  const control = host.querySelector<HTMLInputElement>("#question-search")!;
  expect(control).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("questions catalog legacy filters and Hono query parity", () => {
  it("encodes server-side search/category/status with page and sort, never relying on first-page local filter", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([question("one")]));
    vi.stubGlobal("fetch", fetcher);
    await listQuestionsPage({
      page: 2,
      sort: "active",
      mine: true,
      search: "  корм & прогулка  ",
      category: "Питание",
      status: "waiting",
    });
    const url = new URL(String(fetcher.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/v1/questions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      sort: "active",
      mine: "true",
      search: "корм & прогулка",
      category: "Питание",
      status: "waiting",
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("rejects invalid filters before any network/cache entry", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(listQuestionsPage({ search: "x".repeat(151) })).rejects.toThrow();
    await expect(listQuestionsPage({ category: "unknown" as never })).rejects.toThrow();
    await expect(listQuestionsPage({ status: "closed" as never })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("mounted search/category/status changes request and render SERVER-filtered results", async () => {
    const fetcher = vi.fn((url: string) => {
      const query = new URL(url, "http://localhost").searchParams;
      return Promise.resolve(
        response(
          query.get("search") === "поводок" &&
            query.get("category") === "Поведение" &&
            query.get("status") === "waiting"
            ? [question("two")]
            : [question("one")],
        ),
      );
    });
    const screen = await mount(fetcher);
    try {
      const ask = screen.host.querySelector<HTMLAnchorElement>(
        'a[href="/questions/new"][data-gafus-shared-button="primary"]',
      );
      expect(ask?.textContent).toContain("Задать вопрос");
      expect(ask?.querySelector("svg")).not.toBeNull();
      expect([...screen.host.querySelectorAll('[role="group"]')]
        .map(node => node.getAttribute("aria-label"))).toEqual([
          "Чьи вопросы", "Сортировка вопросов",
        ]);
      await select(screen.host, "question-category", "Поведение");
      await select(screen.host, "question-status", "waiting");
      await input(screen.host, "  поводок  ");
      await tick(370);
      await tick(70);
      const last = new URL(String(fetcher.mock.lastCall?.[0]), "http://localhost");
      expect(last.searchParams.get("search")).toBe("поводок");
      expect(last.searchParams.get("category")).toBe("Поведение");
      expect(last.searchParams.get("status")).toBe("waiting");
      expect(screen.host.textContent).toContain("Вопрос про поводок");
      expect(screen.host.textContent).not.toContain("Вопрос про корм");
      expect(screen.host.textContent).not.toContain("PRIVATE_AUTHOR");
    } finally {
      await screen.cleanup();
    }
  });

  it("changing filters resets page to 1 and cannot show previously loaded page 2", async () => {
    const fetcher = vi.fn((url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      if (params.get("status") === "resolved") return Promise.resolve(response([]));
      return Promise.resolve(
        params.get("page") === "1" ? response([question("one")], 2) : response([question("two")]),
      );
    });
    const screen = await mount(fetcher);
    try {
      await act(async () => {
        Array.from(screen.host.querySelectorAll("button"))
          .find((b) => b.textContent === "Ещё вопросы")
          ?.click();
      });
      await tick();
      expect(screen.host.textContent).toContain("Вопрос про поводок");
      await select(screen.host, "question-status", "resolved");
      const last = new URL(String(fetcher.mock.lastCall?.[0]), "http://localhost");
      expect(last.searchParams.get("page")).toBe("1");
      expect(last.searchParams.get("status")).toBe("resolved");
      expect(screen.host.textContent).not.toContain("Вопрос про поводок");
      expect(screen.host.textContent).toContain("По выбранным фильтрам вопросов нет");
    } finally {
      await screen.cleanup();
    }
  });

  it("reset returns to server-backed all/new and a clean empty state", async () => {
    const fetcher = vi.fn((url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      return Promise.resolve(
        response(params.get("category") === "Питание" ? [] : [question("one")]),
      );
    });
    const screen = await mount(fetcher);
    try {
      await select(screen.host, "question-category", "Питание");
      expect(screen.host.textContent).toContain("По выбранным фильтрам вопросов нет");
      await act(async () => {
        Array.from(screen.host.querySelectorAll("button"))
          .find((b) => b.textContent === "Сбросить фильтры")
          ?.click();
      });
      await tick();
      const last = new URL(String(fetcher.mock.lastCall?.[0]), "http://localhost");
      expect(last.searchParams.get("category")).toBeNull();
      expect(last.searchParams.get("sort")).toBe("new");
      expect(last.searchParams.get("mine")).toBe("false");
      expect(screen.host.textContent).toContain("Вопрос про корм");
    } finally {
      await screen.cleanup();
    }
  });

  it("a 503 first-page failure shows safe manual retry, not private cached cards", async () => {
    const error = new Response(
      JSON.stringify({ success: false, error: "PRIVATE_BACKEND_PAYLOAD" }),
      { status: 503 },
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(error)
      .mockResolvedValueOnce(response([question("one")]));
    const screen = await mount(fetcher);
    try {
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain(
        "Не удалось загрузить вопросы",
      );
      expect(screen.host.textContent).not.toContain("PRIVATE_BACKEND_PAYLOAD");
      expect(screen.host.querySelectorAll(".question-catalog-card")).toHaveLength(0);
      await act(async () => {
        Array.from(screen.host.querySelectorAll("button"))
          .find((button) => button.textContent === "Повторить")
          ?.click();
      });
      await tick();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(screen.host.textContent).toContain("Вопрос про корм");
    } finally {
      await screen.cleanup();
    }
  });

  it("401 links to login while 403 cannot retry or disclose server text", async () => {
    for (const status of [401, 403]) {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: "PRIVATE_ERROR_TEXT",
          }),
          { status },
        ),
      );
      const screen = await mount(fetcher);
      try {
        const alert = screen.host.querySelector('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(alert?.textContent).not.toContain("PRIVATE_ERROR_TEXT");
        expect(screen.host.querySelector(".question-catalog-card")).toBeNull();
        expect(screen.host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
        expect(
          Array.from(screen.host.querySelectorAll("button")).some(
            (button) => button.textContent === "Повторить",
          ),
        ).toBe(false);
      } finally {
        await screen.cleanup();
      }
    }
  });

  it("server next-page 503 keeps first-page results and manual retry preserves filters", async () => {
    let attempt = 0;
    const fetcher = vi.fn((url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      return Promise.resolve(
        params.get("page") === "1"
          ? response([question("one")], 2)
          : ++attempt === 1
            ? new Response(JSON.stringify({ success: false, error: "SERVER_SECRET" }), {
                status: 503,
              })
            : response([question("two")]),
      );
    });
    const screen = await mount(fetcher);
    try {
      await select(screen.host, "question-status", "waiting");
      await act(async () => {
        Array.from(screen.host.querySelectorAll("button"))
          .find((b) => b.textContent === "Ещё вопросы")
          ?.click();
      });
      await tick();
      expect(screen.host.textContent).toContain("Вопрос про корм");
      expect(screen.host.textContent).toContain("Не удалось загрузить следующую страницу");
      expect(screen.host.textContent).not.toContain("SERVER_SECRET");
      await act(async () => {
        Array.from(screen.host.querySelectorAll("button"))
          .find((b) => b.textContent === "Повторить страницу")
          ?.click();
      });
      await tick();
      expect(screen.host.textContent).toContain("Вопрос про поводок");
      const last = new URL(String(fetcher.mock.lastCall?.[0]), "http://localhost");
      expect(last.searchParams.get("page")).toBe("2");
      expect(last.searchParams.get("status")).toBe("waiting");
    } finally {
      await screen.cleanup();
    }
  });

  it("user switch excludes A's late response and resets private filter controls", async () => {
    let resolveA: ((response: Response) => void) | undefined;
    const fetcher = vi.fn((url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      if (!resolveA)
        return new Promise<Response>((resolve) => {
          resolveA = resolve;
        });
      return Promise.resolve(response(params.get("mine") === "true" ? [] : [question("two")]));
    });
    const screen = await mount(fetcher);
    try {
      await screen.render("USER-B");
      await act(async () => resolveA?.(response([question("one")])));
      await tick();
      expect(screen.host.textContent).not.toContain("Вопрос про корм");
      expect(screen.host.textContent).toContain("Вопрос про поводок");
      expect(
        screen.cache.getQueryData(["questions", "catalog", "USER-B", "new", false, "", "", ""]),
      ).toBeDefined();
    } finally {
      await screen.cleanup();
    }
  });
});
