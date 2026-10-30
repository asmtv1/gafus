/** AG1 cont144 one distinct signed Hono + actual metadata producer proof. */
import { randomBytes } from "node:crypto";
import { act, createElement } from "react";
import { TrainerOwnArticlesRead20261022 } from "./TrainerOwnArticlesRead20261022";
import type { PanelActor } from "./consultationContract";
import type * as PrismaModule from "@gafus/prisma";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ find: vi.fn(), user: vi.fn(), registration: vi.fn(), rate: 1 }));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(c: { windowMs: number }) {
      this.windowMs = c.windowMs;
    }
    async increment() {
      return { totalHits: state.rate, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() {
      return undefined;
    }
    async resetKey() {
      return undefined;
    }
  },
}));
vi.mock("@gafus/prisma", async (original) => {
  const actual = await original<typeof PrismaModule>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      user: { ...actual.prisma.user, findUnique: state.user },
      article: { ...actual.prisma.article, findMany: state.find },
    },
  };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: state.registration,
}));
const { app } = await vi.importActual<{
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{
  generateAccessToken: (a: { id: string; username: string; role: string }) => Promise<string>;
}>("@gafus/auth/jwt");
const people = {
  A: { id: "article_own_A", username: "artA", role: "TRAINER" },
  B: { id: "article_own_B", username: "artB", role: "TRAINER" },
  ADMIN: { id: "article_own_admin", username: "artAdmin", role: "ADMIN" },
  MOD: { id: "article_own_mod", username: "artMod", role: "MODERATOR" },
  USER: { id: "article_own_user", username: "artUser", role: "USER" },
  PARTNER: { id: "article_own_partner", username: "artPartner", role: "PARTNER" },
} as const;
const tokens: Record<string, string> = {};
const privateValue = "NO_ARTICLE_PRIVATE_MEDIA_PII";
const base = {
  id: "article1",
  title: "Training tips",
  slug: "training-tips",
  visibility: "PUBLIC",
  viewCount: 8,
  createdAt: new Date("2026-10-20T10:00:00Z"),
  updatedAt: new Date("2026-10-21T10:00:00Z"),
  _count: { articleLikes: 4 },
  content: privateValue,
  description: privateValue,
  logoImg: privateValue,
  videoUrl: privateValue,
  authorId: privateValue,
};
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [name, p] of Object.entries(people)) tokens[name] = await generateAccessToken(p);
});
beforeEach(() => {
  vi.clearAllMocks();
  state.rate = 1;
  state.registration.mockResolvedValue(true);
  state.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(people).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  state.find.mockResolvedValue([base]);
});
const { JSDOM } = await vi.importActual<{
  JSDOM: new (h: string, o: { url: string }) => { window: Window & typeof globalThis };
}>("jsdom");
const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import("react-dom/client");
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const transportFor =
  (who: "A" | "B" | "ADMIN" | "MOD") => async (path: string, signal: AbortSignal) => {
    const r = await app.request(path, {
      method: "GET",
      headers: { Authorization: "Bearer " + tokens[who] },
      signal,
    });
    return {
      status: r.status,
      headers: { "cache-control": r.headers.get("cache-control") ?? "" },
      body: await r.json(),
    };
  };
async function mount(who: "A" | "B" | "ADMIN" | "MOD" = "A", live = true) {
  const a = people[who],
    actor = { id: a.id, role: a.role },
    token = tokens[who];
  await act(async () =>
    root.render(
      createElement(TrainerOwnArticlesRead20261022, {
        pathname: "/main-panel/articles",
        actor,
        token,
        authEpoch: "epoch",
        enabled: true,
        transport: transportFor(who),
        getCurrentSession: () => (live ? { actor, token, authEpoch: "epoch" } : null),
      }),
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const make = (title: string, id: string, date: string) => ({
  ...base,
  id,
  title,
  slug: id,
  createdAt: new Date(date),
});
describe("AG4 canonical own-articles UI → real Hono → real minimal producer → synthetic Prisma", () => {
  it("TRAINER list search sort detail, B principal reset and no private fields", async () => {
    state.find.mockResolvedValue([
      make("Zebra", "a-z", "2026-10-22T10:00:00Z"),
      make("Alpha", "a-a", "2026-10-20T10:00:00Z"),
    ]);
    await mount();
    expect(host.textContent).toContain("Загружено статей: 2; показано: 2");
    await act(async () => {
      [...host.querySelectorAll("button")].find((x) => x.textContent === "Zebra")!.click();
    });
    expect(host.querySelector('[aria-label="Метаданные статьи"]')?.textContent).toContain("Zebra");
    await act(async () => {
      const input = host.querySelector("input")!;
      input.value = "Alpha";
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    expect(host.textContent).not.toContain(privateValue);
    await mount("B");
    expect(state.find.mock.calls.at(-1)?.[0].where).toEqual({ authorId: people.B.id });
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).toBeNull();
  });
  it("ADMIN own, MOD denied and session retired", async () => {
    await mount("ADMIN");
    expect(state.find.mock.calls.at(-1)?.[0].where).toEqual({ authorId: people.ADMIN.id });
    await mount("MOD");
    expect(host.textContent).toContain("недоступен");
    await mount("A", false);
    expect(host.textContent).toContain("недоступен");
  });
  it("true empty and masked source error", async () => {
    state.find.mockResolvedValueOnce([]);
    await mount();
    expect(host.textContent).toContain("Статей пока нет");
    await act(async () => root.unmount());
    root = createRoot(host);
    state.find.mockRejectedValueOnce(Error(privateValue));
    await mount();
    expect(host.textContent).toContain("Не удалось загрузить статьи");
    expect(host.textContent).not.toContain(privateValue);
  });
});

// AG2-ARTICLES-READ-UX: existing mounted JSDOM; synthetic transport, no extra endpoint.
const metadata = (title: string, id: string) => ({
  id,
  title,
  slug: id,
  visibility: "PUBLIC",
  likeCount: 3,
  viewCount: 7,
  createdAt: "2026-10-22T10:00:00.000Z",
  updatedAt: "2026-10-22T11:00:00.000Z",
});
const syntheticResponse = (status: number, rows: ReturnType<typeof metadata>[] = []) => ({
  status,
  headers: { "cache-control": "private, no-store" },
  body:
    status === 200
      ? { success: true, data: { articles: rows } }
      : { success: false, code: "DENIED_OR_UNAVAILABLE" },
});
const tick = async () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function syntheticMount(
  who: "A" | "B",
  transport: (path: string, signal: AbortSignal) => Promise<ReturnType<typeof syntheticResponse>>,
  live: () => { actor: PanelActor; token: string; authEpoch: string } | null,
) {
  const actor: PanelActor = { id: people[who].id, role: people[who].role },
    token = tokens[who];
  await act(async () =>
    root.render(
      createElement(TrainerOwnArticlesRead20261022, {
        pathname: "/main-panel/articles",
        actor,
        token,
        authEpoch: "epoch",
        enabled: true,
        transport,
        getCurrentSession: live,
      }),
    ),
  );
  await tick();
}

describe("AG2-ARTICLES-READ-UX existing own-articles metadata mounted actions", () => {
  it("403 after selected 200 metadata hides old details, has no retry and offers safe existing panel link", async () => {
    const liveSession = {
      actor: { id: people.A.id, role: people.A.role },
      token: tokens.A,
      authEpoch: "epoch",
    };
    const live = () => liveSession;
    await syntheticMount(
      "A",
      async () => syntheticResponse(200, [metadata("OLD_PRIVATE_ARTICLE", "old-article")]),
      live,
    );
    expect(host.textContent).toContain("OLD_PRIVATE_ARTICLE");
    await act(async () => {
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "OLD_PRIVATE_ARTICLE")!
        .click();
    });
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).not.toBeNull();
    const denied = vi.fn(async () => syntheticResponse(403));
    await syntheticMount("A", denied, live);
    expect(denied).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Нет доступа к собственным статьям");
    expect(host.textContent).not.toContain("OLD_PRIVATE_ARTICLE");
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).toBeNull();
    expect(host.querySelector('a[href="/main-panel"]')?.textContent).toContain(
      "Назад в панель тренера",
    );
    expect(host.textContent).not.toContain("Повторить чтение");
    await tick();
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it("503 keeps manual same GET retry and fresh 200 only, old rows remain absent", async () => {
    const live = () => ({
      actor: { id: people.A.id, role: people.A.role },
      token: tokens.A,
      authEpoch: "epoch",
    });
    let requested = 0;
    const transport = vi.fn(async () =>
      syntheticResponse(++requested === 1 ? 503 : 200, [
        metadata("FRESH_200_ARTICLE", "fresh-article"),
      ]),
    );
    await syntheticMount("A", transport, live);
    expect(host.textContent).toContain("Не удалось загрузить статьи");
    expect(host.textContent).not.toContain("FRESH_200_ARTICLE");
    const retry = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Повторить чтение",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await tick();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("FRESH_200_ARTICLE");
    expect(host.textContent).not.toContain("Не удалось загрузить статьи");
  });
  it("401 retains generic transient-style error and current retry button", async () => {
    const live = () => ({
      actor: { id: people.A.id, role: people.A.role },
      token: tokens.A,
      authEpoch: "epoch",
    });
    await syntheticMount("A", async () => syntheticResponse(401), live);
    expect(host.textContent).toContain("Не удалось загрузить статьи");
    expect(host.textContent).toContain("Повторить чтение");
    expect(host.textContent).not.toContain("Нет доступа к собственным статьям");
  });
  it("pending old actor 200 cannot revive list or selected detail after new actor 403", async () => {
    let resolveOld!: (r: ReturnType<typeof syntheticResponse>) => void;
    const old = new Promise<ReturnType<typeof syntheticResponse>>((resolve) => {
      resolveOld = resolve;
    });
    let who: "A" | "B" = "A";
    const live = () => ({
      actor: { id: people[who].id, role: people[who].role },
      token: tokens[who],
      authEpoch: "epoch",
    });
    await syntheticMount("A", async () => old, live);
    who = "B";
    await syntheticMount("B", async () => syntheticResponse(403), live);
    expect(host.textContent).toContain("Нет доступа к собственным статьям");
    await act(async () => resolveOld(syntheticResponse(200, [metadata("LATE_OLD_A", "late-a")])));
    await tick();
    expect(host.textContent).not.toContain("LATE_OLD_A");
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).toBeNull();
    expect(host.textContent).not.toContain("Повторить чтение");
  });
});


// Scoped own-articles READ search truthfulness: injected transport, no HTTP/SQL.
describe("AG2_ARTICLES_SEARCH_TRUTHFULNESS mounted-local", () => {
  const path = "/api/v1/trainer/articles/own-summary";
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.textContent === label);
  async function show(
    who: "A" | "B",
    transport: (
      requestPath: string,
      signal: AbortSignal,
    ) => Promise<ReturnType<typeof syntheticResponse>>,
    session?: () => { actor: PanelActor; token: string; authEpoch: string } | null,
  ) {
    const p = people[who];
    const live = session ?? (() => ({
      actor: { id: p.id, role: p.role },token: tokens[who],authEpoch:"epoch",
    }));
    await syntheticMount(who,transport,live);
  }
  async function search(text: string) {
    const input = host.querySelector<HTMLInputElement>("input")!;
    const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    expect(nativeSetter).toBeDefined();
    await act(async () => {
      nativeSetter!.call(input,text);
      input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
    });
  }
  it("true empty successful GET says no articles yet; loaded/shown are zero, not an asserted global total",async()=>{
    const transport = vi.fn(async () => syntheticResponse(200,[]));
    await show("A",transport);
    expect(host.textContent).toContain("Статей пока нет");
    expect(host.textContent).not.toContain("По запросу ничего не найдено");
    expect(host.textContent).toContain("Загружено статей: 0; показано: 0");
    expect(host.textContent).not.toContain("Всего статей:");
    expect(button("Очистить поиск")).toBeUndefined();
    expect(transport).toHaveBeenCalledExactlyOnceWith(path,expect.any(AbortSignal));
  });
  it("loaded nonmatching title/slug shows a precise empty-search message, clears without another GET",async()=>{
    const transport = vi.fn(async () => syntheticResponse(200,[
      metadata("Собачья школа","course-dog"),metadata("Занятия","regular-lesson"),
    ]));
    await show("A",transport);
    await act(async () => button("Собачья школа")?.click());
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).not.toBeNull();
    await search("not-in-title-or-slug");
    expect(host.textContent).toContain("По запросу ничего не найдено");
    expect(host.textContent).not.toContain("Статей пока нет");
    expect(host.textContent).toContain("Загружено статей: 2; показано: 0");
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).toBeNull();
    expect(button("Очистить поиск")).toBeDefined();
    await act(async () => button("Очистить поиск")?.click());
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(host.textContent).toContain("Собачья школа");
    expect(host.textContent).toContain("Занятия");
    expect(host.textContent).toContain("Загружено статей: 2; показано: 2");
    expect(host.textContent).not.toContain("По запросу ничего не найдено");
    expect(button("Очистить поиск")).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("100 loaded boundary states client-only search limitation without claiming 100 total or 101st",async()=>{
    const records = Array.from({length:100},(_,i) => metadata(`Статья ${i}`,`own-${i}`));
    const transport = vi.fn(async () => syntheticResponse(200,records));
    await show("A",transport);
    expect(host.textContent).toContain("Загружено статей: 100; показано: 100");
    expect(host.textContent).toContain("Поиск выполняется только среди 100 загруженных статей");
    expect(host.textContent).not.toContain("Всего статей:");
    await search("absent-in-loaded-100");
    expect(host.textContent).toContain("Загружено статей: 100; показано: 0");
    expect(host.textContent).toContain("По запросу ничего не найдено");
    expect(host.textContent).toContain("Поиск выполняется только среди 100 загруженных статей");
    await act(async () => button("Очистить поиск")?.click());
    expect(host.textContent).toContain("Загружено статей: 100; показано: 100");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("failed and retired identity keep old filtered details hidden; late older ACK stays ignored",async()=>{
    const first = vi.fn(async () => syntheticResponse(200,[metadata("PERSON_A_PRIVATE_TITLE","A-title")]));
    let owner: "A" | "B" = "A";
    const live = () => ({actor:{id:people[owner].id,role:people[owner].role} as PanelActor,
      token:tokens[owner],authEpoch:"epoch"});
    await show("A",first,live);
    await act(async () => button("PERSON_A_PRIVATE_TITLE")?.click());
    await search("not-a-match");
    expect(host.textContent).toContain("По запросу ничего не найдено");
    let release!: (value:ReturnType<typeof syntheticResponse>)=>void;
    const pending = new Promise<ReturnType<typeof syntheticResponse>>(resolve=>{release=resolve;});
    await show("A",async()=>pending,live);
    expect(host.textContent).toContain("Загрузка статей");
    owner="B";
    const second = vi.fn(async()=>syntheticResponse(403));
    await show("B",second,live);
    expect(host.textContent).toContain("Нет доступа к собственным статьям");
    expect(host.textContent).not.toContain("PERSON_A_PRIVATE_TITLE");
    expect(host.textContent).not.toContain("По запросу ничего не найдено");
    expect(host.querySelector('[aria-label="Метаданные статьи"]')).toBeNull();
    await act(async()=>release(syntheticResponse(200,[metadata("LATE_PRIVATE_A","late-a")])));
    await tick();
    expect(host.textContent).not.toContain("LATE_PRIVATE_A");
    expect(host.textContent).not.toContain("Загружено статей:");
    expect(button("Очистить поиск")).toBeUndefined();
    expect(second).toHaveBeenCalledExactlyOnceWith(path,expect.any(AbortSignal));
  });
});
