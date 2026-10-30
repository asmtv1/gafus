// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { ProfileOverview } from "./ProfileOverview";
import { prepareProfileAvatar } from "./LegacyProfilePresentation";
import { navigate } from "../../shared/router/location";
import type { SyntheticReminderTransport } from "./remindersSourceMock";
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      success: status === 200,
      data,
      error: "PRIVATE_SERVER_ERROR",
    }),
    { status },
  );
const deferred = () => {
  let resolve!: (v: Response) => void;
  const promise = new Promise<Response>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};
let root: Root,
  host: HTMLElement,
  cache: QueryClient,
  server: {
    id: string;
    username: string;
    profile: { fullName: string; city: string; about: string };
  };
let fetcher: ReturnType<typeof vi.fn<(path: string, options: RequestInit) => Promise<Response>>>;
let put: ReturnType<typeof vi.fn<(options: RequestInit) => Promise<Response>>>;
const pause = async () =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, 16));
  });
async function render(reminders?: SyntheticReminderTransport, strictMode = false) {
  const element = (
    <QueryClientProvider client={cache}>
      <ProfileOverview
        userId="A"
        showRemindersOptIn={!!reminders}
        remindersSyntheticTransport={reminders}
      />
    </QueryClientProvider>
  );
  await act(async () => root.render(strictMode ? <StrictMode>{element}</StrictMode> : element));
  await pause();
}
async function click(text: string) {
  // The avatar editor now uses the same SVG Edit icon as retained Next, not
  // the typographic ✎ placeholder. Target its stable accessible name and
  // assert that the real source-shaped SVG control is mounted.
  const control = text === "✎"
    ? host.querySelector<HTMLButtonElement>('button[aria-label="Изменить аватар"]')
    : text === "Редактировать профиль"
      ? host.querySelector<HTMLAnchorElement>('a[href="/profile/editBio"]')
      : [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  expect(control, text).toBeDefined();
  if (text === "✎") expect(control?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  if (text === "Редактировать профиль") {
    // Source Next really exposes a link and its address, not a fake CTA.
    expect(control?.tagName).toBe("A");
    expect(control?.getAttribute("href")).toBe("/profile/editBio");
  }
  await act(async () => control?.click());
  await pause();
}
async function change(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(id)!;
  const proto =
    input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  const form = host.querySelector<HTMLFormElement>('form[aria-label="Редактирование профиля"]')!;
  await act(async () =>
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await pause();
}
const writes = () => fetcher.mock.calls.filter(([, options]) => options?.method === "PUT");
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "owner", role: "USER" });
  server = {
    id: "A",
    username: "owner",
    profile: { fullName: "Владелец", city: "Самара", about: "О собаке" },
  };
  put = vi.fn(async (opts: RequestInit) => {
    Object.assign(server.profile, JSON.parse(String(opts.body)));
    return response({ id: "A" });
  });
  fetcher = vi.fn(async (path: string, options: RequestInit) => {
    if (path !== "/api/v1/user/profile") throw Error("UNAPPROVED_API");
    if (options?.method === "PUT") return put(options);
    return response({ ...server, email: "PRIVATE_EMAIL", secret: "PRIVATE_SESSION" });
  });
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("AG2 profile edit connected to existing profile/reminder opt-in", () => {
  it("renders only owner email from real private profile projection, matching Next Bio", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      expect(path).toBe("/api/v1/user/profile");
      if (options?.method === "PUT") return put(options);
      return response({ ...server, email: "web1_owner@example.test",
        phone: "+79990001122", accessToken: "NEVER_RENDER_TOKEN" });
    });
    await render();
    const identity = host.querySelector<HTMLElement>("[data-next-profile-identity]");
    expect(identity?.textContent).toContain("web1_owner@example.test");
    expect(identity?.textContent).not.toContain("Укажите email для восстановления доступа");
    expect(host.textContent).not.toContain("+79990001122");
    expect(host.textContent).not.toContain("NEVER_RENDER_TOKEN");
    expect(fetcher.mock.calls).toEqual(expect.arrayContaining([
      expect.arrayContaining(["/api/v1/user/profile"]),
    ]));
  });
  it("Next Bio hides the empty-profile notice when city/name exist but About is blank", async () => {
    server.profile.about = "";
    await render();
    const identity = host.querySelector("[data-next-profile-identity]");
    expect(identity?.textContent).toContain("Самара");
    expect(identity?.textContent).toContain("Владелец");
    expect(identity?.textContent).not.toContain("Информация о себе не внесена");
    expect(identity?.querySelector('[aria-label="Личные сведения"]')).not.toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("renders the same owner-only email in Account Settings without exposing phone", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      expect(path).toBe("/api/v1/user/profile");
      if (options?.method === "PUT") return put(options);
      return response({ ...server, email: "web1_owner@example.test",
        phone: "+79990001122", accessToken: "SECRET_NOT_FOR_SETTINGS" });
    });
    await render();
    const settings = [...host.querySelectorAll<HTMLButtonElement>(
      "[data-next-profile-sections] button",
    )].find(button => button.textContent?.trim() === "Настройки аккаунта");
    expect(settings).toBeDefined();
    await act(async () => settings?.click());
    await pause();
    const panel = host.querySelector<HTMLElement>("[data-next-profile-settings]");
    expect(panel?.textContent).toContain("web1_owner@example.test");
    expect(panel?.textContent).not.toContain("Укажите email для восстановления доступа");
    expect(host.textContent).not.toContain("+79990001122");
    expect(host.textContent).not.toContain("SECRET_NOT_FOR_SETTINGS");
  });
  it("uses retained Core getAge and declOfNum for source birthday formatting", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (options?.method === "PUT") return put(options);
      expect(path).toBe("/api/v1/user/profile");
      return response({ ...server, profile: { ...server.profile, birthDate: "2000-01-01" } });
    });
    await render();
    const identity = host.querySelector("[data-next-profile-identity]");
    const ageElement = identity?.querySelector('[aria-label="Личные сведения"]');
    const expectedAge = new Date().getFullYear() - 2000;
    expect(ageElement?.textContent).toContain(`${expectedAge} лет`);
    expect(writes()).toHaveLength(0);
  });
  it("retains Next Bio social labels and link titles without altering their destinations", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (options?.method === "PUT") return put(options);
      expect(path).toBe("/api/v1/user/profile");
      return response({ ...server, profile: { ...server.profile,
        instagram: "web1_owner", telegram: "web1_owner",
        website: "https://example.test/owner" } });
    });
    await render();
    const contacts = host.querySelector('[aria-label="Контакты специалиста"]');
    const instagram = contacts?.querySelector<HTMLAnchorElement>(
      'a[aria-label="Instagram: web1_owner, откроется в новой вкладке"]');
    expect(instagram?.title).toBe("Instagram: web1_owner");
    expect(instagram?.textContent).toContain("Instagram");
    expect(instagram?.target).toBe("_blank");
    expect(instagram?.rel).toContain("noopener");
    const telegram = contacts?.querySelector<HTMLAnchorElement>(
      'a[aria-label="Телеграм: web1_owner, откроется в новой вкладке"]');
    expect(telegram?.title).toBe("Телеграм: web1_owner");
    const website = contacts?.querySelector<HTMLAnchorElement>(
      'a[title="https://example.test/owner"]');
    expect(website?.textContent).toContain("example.test");
    expect(writes()).toHaveLength(0);
  });
  it("treats whitespace-only city and email exactly as missing Next owner Bio facts", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (options?.method === "PUT") return put(options);
      expect(path).toBe("/api/v1/user/profile");
      return response({ ...server, email: "   ",
        profile: { ...server.profile, city: "   " } });
    });
    await render();
    const identity = host.querySelector("[data-next-profile-identity]");
    expect(identity?.textContent).toContain("Укажите email для восстановления доступа");
    expect(identity?.textContent).toContain("Город");
    expect(identity?.textContent).toContain("Не указан");
    expect(writes()).toHaveLength(0);
  });
  it("Next Bio renders email-recovery hint as plain text, not a Vite-only CTA", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (options?.method === "PUT") return put(options);
      expect(path).toBe("/api/v1/user/profile");
      return response({ ...server, email: null });
    });
    await render();
    const identity = host.querySelector<HTMLElement>("[data-next-profile-identity]");
    expect(identity?.querySelector('span[class*="contactInfoMissing"]')?.textContent)
      .toContain("Укажите email для восстановления доступа");
    expect(identity?.querySelector('a[href="/profile/change-email"]')).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("Next Bio shows the empty notice when all personal-profile values are null", async () => {
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (options?.method === "PUT") return put(options);
      expect(path).toBe("/api/v1/user/profile");
      return response({ ...server, profile: {
        fullName: null, city: null, about: null, telegram: null,
        instagram: null, website: null, avatarUrl: null, birthDate: null,
      } });
    });
    await render();
    expect(host.querySelector("[data-next-profile-identity]")?.textContent)
      .toContain("Информация о себе не внесена");
    expect(writes()).toHaveLength(0);
  });
  it("P13 /profile?tab=settings -> SPA navigate /profile resets visible tab without a full reload", async () => {
    const before = window.location.pathname + window.location.search;
    try {
      window.history.replaceState(null, "", "/profile?tab=settings");
      await render();
      const buttons = () => [
        ...host.querySelectorAll<HTMLButtonElement>("[data-next-profile-sections] button"),
      ];
      expect(
        buttons()
          .find((b) => b.textContent?.trim() === "Настройки аккаунта")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      // Source ProfileSections.tsx exposes the active panel as a stable hash
      // target, unlike the previous Vite shell with only a CSS class.
      expect(host.querySelectorAll("#profile-settings")).toHaveLength(1);
      expect(host.querySelector("#profile-activity")).toBeNull();
      await act(async () => navigate("/profile"));
      await pause();
      expect(window.location.search).toBe("");
      expect(host.querySelectorAll("#profile-activity")).toHaveLength(1);
      expect(host.querySelector("#profile-settings")).toBeNull();
      expect(
        buttons()
          .find((b) => b.textContent?.trim() === "Мои публикации")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        buttons()
          .find((b) => b.textContent?.trim() === "Настройки аккаунта")
          ?.getAttribute("aria-pressed"),
      ).toBe("false");
    } finally {
      window.history.replaceState(null, "", before);
    }
  });

  it("P01 empty changes produce no PUT", async () => {
    await render();
    await click("Редактировать профиль");
    await save();
    expect(host.textContent).toContain("Нет изменений");
    expect(writes()).toHaveLength(0);
    await click("Отмена");
    expect(host.textContent).toContain("Самара");
  });
  it("P02 city-only PUT with cookie and authoritative GET readback", async () => {
    await render();
    await click("Редактировать профиль");
    await change("#profile-edit-city", "Казань");
    await save();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(String(writes()[0][1].body))).toEqual({ city: "Казань" });
    expect(writes()[0][1].headers).toMatchObject({ "X-Gafus-Auth-Transport": "cookie" });
    expect(host.textContent).toContain("Казань");
    expect(host.querySelector("form")).toBeNull();
    expect(JSON.stringify(cache.getQueryData(["user", "profile", "A"]))).not.toContain(
      "PRIVATE_EMAIL",
    );
  });
  it("P02S StrictMode effect cleanup replay must not disable genuine profile PUT", async () => {
    await render(undefined, true);
    await click("Редактировать профиль");
    await change("#profile-edit-city", "Казань");
    await save();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(String(writes()[0][1].body))).toEqual({ city: "Казань" });
    expect(host.textContent).toContain("Казань");
    expect(host.querySelector('form[aria-label="Редактирование профиля"]')).toBeNull();
  });
  it("P03 HTTP200 alone is not enough when readback still old", async () => {
    put.mockResolvedValueOnce(response({ id: "A" }));
    await render();
    await click("Редактировать профиль");
    await change("#profile-edit-city", "Казань");
    await save();
    expect(host.textContent).toContain("не подтверждают изменения");
    expect(host.querySelector("form")).not.toBeNull();
    await save();
    expect(writes()).toHaveLength(1);
  });
  it("P04 503 unknown stays one-shot; manual readback is safe", async () => {
    put.mockImplementationOnce(async (opts: RequestInit) => {
      Object.assign(server.profile, JSON.parse(String(opts.body)));
      return response(null, 503);
    });
    await render();
    await click("Редактировать профиль");
    await change("#profile-edit-about", "Проверить после ответа");
    await save();
    expect(host.textContent).toContain("Результат сохранения неизвестен");
    await click("Проверить профиль");
    expect(host.textContent).toContain("Текущие данные совпадают");
    expect(writes()).toHaveLength(1);
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
  });
  it.each([400, 403, 409, 429])("P05 rejected %d preserves privacy", async (status) => {
    put.mockResolvedValueOnce(response(null, status));
    await render();
    await click("Редактировать профиль");
    await change("#profile-edit-city", "Казань");
    await save();
    expect(host.textContent).toContain("Сервер отклонил");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
    expect(writes()).toHaveLength(1);
  });
  it("P09 double submit during pending only one PUT", async () => {
    const pending = deferred();
    put.mockReturnValueOnce(pending.promise);
    await render();
    await click("Редактировать профиль");
    await change("#profile-edit-city", "Казань");
    const form = host.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(writes()).toHaveLength(1);
    server.profile.city = "Казань";
    await act(async () => pending.resolve(response({ id: "A" })));
    await pause();
    expect(host.textContent).toContain("Казань");
  });
  it("P10 A->B->A before ACK never revives A private draft", async () => {
    const pending = deferred();
    put.mockReturnValueOnce(pending.promise);
    await render();
    await click("Редактировать профиль");
    await change("#profile-edit-about", "PRIVATE_DRAFT");
    const form = host.querySelector("form")!;
    await act(async () =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {
        id: "B",
        username: "b",
        role: "USER",
      }),
    );
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {
        id: "A",
        username: "owner",
        role: "USER",
      }),
    );
    await act(async () => pending.resolve(response({ id: "A" })));
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("PRIVATE_DRAFT");
    expect(writes()).toHaveLength(1);
  });
  it("P12 private student notes GET only when selected; switching away unmounts DOM", async () => {
    window.history.replaceState(null, "", "/profile");
    const noteReads: string[] = [];
    fetcher.mockImplementation(async (path: string, _options: RequestInit) => {
      if (path === "/api/v1/user/profile") return response({ ...server, email: "PRIVATE_EMAIL" });
      if (path === "/api/v1/notes/student") {
        noteReads.push(path);
        return response([
          {
            id: "private-note",
            title: "PRIVATE_TRAINER_NOTE",
            tags: [],
            createdAt: "2026-10-25T12:00:00.000Z",
            trainer: { id: "trainer-A", username: "trainer", profile: { fullName: "Кинолог" } },
            entries: [
              {
                id: "entry-1",
                content: "PRIVATE_NOTE_BODY",
                order: 0,
                isVisibleToStudent: true,
                createdAt: "2026-10-25T12:00:00.000Z",
                updatedAt: "2026-10-25T12:00:00.000Z",
              },
            ],
          },
        ]);
      }
      throw Error("UNAPPROVED_API");
    });
    await render();
    expect(noteReads).toHaveLength(0);
    expect(host.textContent).not.toContain("PRIVATE_NOTE_BODY");
    expect(host.querySelector("[data-next-student-notes]")).toBeNull();
    await click("Заметки кинолога");
    expect(noteReads).toHaveLength(1);
    expect(host.textContent).toContain("PRIVATE_NOTE_BODY");
    await click("Мои публикации");
    expect(host.textContent).not.toContain("PRIVATE_NOTE_BODY");
    expect(host.querySelector("[data-next-student-notes]")).toBeNull();
    expect(noteReads).toHaveLength(1);
    window.history.replaceState(null, "", "/profile");
  });
  it("P11 edit cancel -> opt-in reminders -> back, no reminder network", async () => {
    const rem: SyntheticReminderTransport = {
      fixtureKind: "AG2_REMINDER_SETTINGS_SYNTHETIC_ONLY",
      list: vi
        .fn()
        .mockResolvedValue([
          {
            id: "rem1",
            name: "Утренняя тренировка",
            enabled: true,
            reminderTime: "09:00",
            reminderDays: null,
            timezone: "Europe/Moscow",
          },
        ]),
      update: vi.fn(),
    };
    await render(rem);
    await click("Редактировать профиль");
    await click("Отмена");
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Утренняя тренировка");
    await click("Мой профиль");
    expect(host.textContent).toContain("Редактировать профиль");
    // Original Next requests notes only after selecting ?tab=notes.
    // Returning from reminders to activity must NOT fetch private notes.
    expect(
      fetcher.mock.calls
        .map((c) => c[0])
        .filter((path: string) => !path.startsWith("/api/v1/feed/")),
    ).toEqual(["/api/v1/user/profile"]);
    expect(fetcher.mock.calls.map((c) => c[0])).not.toContain("/api/v1/reminders");
    expect(fetcher.mock.calls.every(([, request]) => request?.method === "GET")).toBe(true);
  });
});

describe("existing Next Bio avatar owner picker on real Hono contract", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    // Source-level jsdom media decode only; never a browser/HTTP/S3 acceptance.
    const OriginalURL = globalThis.URL;
    vi.stubGlobal(
      "URL",
      class extends OriginalURL {
        static createObjectURL = vi.fn(() => "blob:ag2-local-avatar-fixture");
        static revokeObjectURL = vi.fn();
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 32;
        naturalHeight = 32;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
  });
  const nextUrl = "https://storage.yandexcloud.net/gafus-media/uploads/users/A/avatar/changed.png";
  const pick = async () => {
    await click("✎");
    const input = host.querySelector<HTMLInputElement>(
      'input[accept="image/jpeg,image/png,image/webp,image/gif"]',
    );
    expect(input).not.toBeNull();
    const image = new File([new Uint8Array([137, 80, 78, 71])], "own.png", {
      type: "image/png",
    });
    Object.defineProperty(input!, "files", { configurable: true, value: [image] });
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await pause();
  };
  it("retains animated GIF exactly, without Canvas or re-encoding", async () => {
    const gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97])], "animated.gif", {
      type: "image/gif",
    });
    const canvas = vi.spyOn(document, "createElement");
    expect(await prepareProfileAvatar(gif)).toBe(gif);
    expect(canvas.mock.calls.some(([name]) => name === "canvas")).toBe(false);
  });
  it("resizes a JPEG to <=800px preserving format/name and ~0.6MiB upload", async () => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1600;
        naturalHeight = 1200;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback, mime) =>
        callback(new Blob([new Uint8Array(120_000)], { type: mime ?? "image/jpeg" })),
      );
    const big = new File([new Uint8Array(2_300_000)], "example.jpg", {
      type: "image/jpeg",
      lastModified: 12345,
    });
    const result = await prepareProfileAvatar(big);
    expect(result).not.toBe(big);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("example.jpg");
    expect(result.lastModified).toBe(12345);
    expect(result.size).toBe(120_000);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0].slice(-2)).toEqual([800, 600]);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob.mock.calls[0][1]).toBe("image/jpeg");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("preserves lossless PNG with progressive downsampling below 2MiB", async () => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1600;
        naturalHeight = 1600;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      mime?: string,
    ) {
      const bytes =
        this.width >= 640
          ? 2_200_000
          : this.width >= 520
            ? 1_100_000
            : this.width >= 400
              ? 780_000
              : 440_000;
      cb(new Blob([new Uint8Array(bytes)], { type: mime ?? "image/png" }));
    });
    const result = await prepareProfileAvatar(
      new File([new Uint8Array(3_000_000)], "transparent.png", { type: "image/png" }),
    );
    expect(result.name).toBe("transparent.png");
    expect(result.type).toBe("image/png");
    expect(result.size).toBe(440_000);
  });
  it("uses best same-MIME result below 2MiB when 0.6MiB cannot be reached", async () => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1600;
        naturalHeight = 1000;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    let step = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb, mime) => {
      step++;
      cb(
        new Blob([new Uint8Array(step === 15 ? 1_090_000 : 1_400_000)], {
          type: mime ?? "image/webp",
        }),
      );
    });
    const result = await prepareProfileAvatar(
      new File([new Uint8Array(3_000_000)], "pet.webp", { type: "image/webp" }),
    );
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("pet.webp");
    expect(result.size).toBe(1_090_000);
    expect(step).toBe(15);
  });
  it("blocks >2MiB encoded result rather than posting or changing MIME", async () => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 2500;
        naturalHeight = 2400;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb, mime) =>
      cb(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: mime ?? "image/png" })),
    );
    await expect(
      prepareProfileAvatar(
        new File([new Uint8Array(3_000_000)], "huge.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("2 МБ");
  });
  it("rejects silently converted WebP output and oversize input before POST", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.webp", {
      type: "image/webp",
    });
    await expect(prepareProfileAvatar(oversized)).rejects.toThrow("5 МБ");
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1400;
        naturalHeight = 1400;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
      cb(new Blob(["png fallback"], { type: "image/png" })),
    );
    await expect(
      prepareProfileAvatar(
        new File([new Uint8Array(800_000)], "keep.webp", { type: "image/webp" }),
      ),
    ).rejects.toThrow("формата");
  });
  it("image decode failure cannot send POST and leaves a retryable local selection", async () => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await render();
    await pick();
    await click("Сохранить аватар");
    for (let i = 0; i < 12 && !host.textContent?.includes("Не удалось подготовить файл"); i++)
      await pause();
    expect(host.textContent).toContain("Не удалось подготовить файл");
    expect(fetcher.mock.calls.filter(([p]) => p === "/api/v1/user/avatar")).toHaveLength(0);
    expect(host.textContent).toContain("Сохранить аватар");
  });

  it("stages preview, cancels with no server POST, and keeps original avatar", async () => {
    await render();
    await pick();
    expect(host.textContent).toContain("Предпросмотр: own.png");
    await click("Отмена");
    expect(host.querySelector('[aria-label="Редактирование аватара"]')).toBeNull();
    expect(fetcher.mock.calls.filter(([p]) => p === "/api/v1/user/avatar")).toHaveLength(0);
  });
  it("sends one multipart POST then verifies owner+public GET before rendering new avatar", async () => {
    let avatar: string | null = null;
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (path === "/api/v1/user/avatar") {
        expect(options.method).toBe("POST");
        expect(options.body).toBeInstanceOf(FormData);
        avatar = nextUrl;
        return response({ avatarUrl: nextUrl });
      }
      if (path === "/api/v1/user/profile")
        return response({
          ...server,
          profile: { ...server.profile, avatarUrl: avatar },
        });
      if (path === "/api/v1/user/profile/public?username=owner")
        return response({
          username: "owner",
          role: "USER",
          pets: [],
          diplomas: [],
          profile: {
            fullName: "Владелец",
            about: "О собаке",
            birthDate: null,
            avatarUrl: avatar,
            telegram: null,
            instagram: null,
            website: null,
          },
        });
      throw Error("UNAPPROVED_API");
    });
    await render();
    await pick();
    await click("Сохранить аватар");
    for (let i = 0; i < 15 && !host.querySelector(`img[src="${nextUrl}"]`); i++) await pause();
    expect(fetcher.mock.calls.filter(([p]) => p === "/api/v1/user/avatar")).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(([p]) => p === "/api/v1/user/profile/public?username=owner"),
    ).toHaveLength(1);
    expect(host.querySelector(`img[src="${nextUrl}"]`)).not.toBeNull();
    expect(
      cache.getQueryData<{ profile: { avatarUrl: string } }>(["user", "profile", "A"])?.profile
        .avatarUrl,
    ).toBe(nextUrl);
  });
  it("ambiguous POST cannot auto-retry; manual GET with old avatar does not accept it", async () => {
    let attempts = 0;
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/user/avatar") {
        attempts++;
        throw new TypeError("NETWORK_ACK_UNKNOWN");
      }
      if (path === "/api/v1/user/profile") return response(server);
      if (path === "/api/v1/user/profile/public?username=owner") throw Error("NOT_EXPECTED");
      throw Error("UNAPPROVED_API");
    });
    await render();
    await pick();
    await click("Сохранить аватар");
    for (let i = 0; i < 12 && !host.textContent?.includes("Результат загрузки неизвестен"); i++)
      await pause();
    expect(attempts).toBe(1);
    await click("Проверить аватар");
    expect(attempts).toBe(1);
    expect(host.textContent).toContain("Повторная отправка запрещена");
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Изменить аватар"]'),
    ).not.toBeNull();
  });
  it("two same-turn confirm clicks cannot send a second multipart POST", async () => {
    const pending = deferred();
    let postCount = 0;
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/user/avatar") {
        postCount++;
        return pending.promise;
      }
      if (path === "/api/v1/user/profile") return response(server);
      throw Error("UNAPPROVED_API");
    });
    await render();
    await pick();
    const confirm = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Сохранить аватар",
    )!;
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(postCount).toBe(1);
    await act(async () => pending.resolve(response({ avatarUrl: nextUrl })));
    await pause();
    expect(postCount).toBe(1);
    expect(host.textContent).toContain("не подтверждён");
  });
  it("late old-principal 200 ACK must not update another principal profile", async () => {
    const pending = deferred();
    let posts = 0;
    fetcher.mockImplementation(async (path: string) => {
      if (path === "/api/v1/user/avatar") {
        posts++;
        return pending.promise;
      }
      if (path === "/api/v1/user/profile") return response(server);
      throw Error("UNAPPROVED_API");
    });
    await render();
    await pick();
    await click("Сохранить аватар");
    expect(posts).toBe(1);
    await act(async () => {
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "other", role: "USER" });
    });
    await act(async () => pending.resolve(response({ avatarUrl: nextUrl })));
    await pause();
    expect(
      fetcher.mock.calls.filter(([p]) => p === "/api/v1/user/profile/public?username=owner"),
    ).toHaveLength(0);
    expect(cache.getQueryData(["user", "profile", "A"])).not.toMatchObject({
      profile: { avatarUrl: nextUrl },
    });
  });
});
