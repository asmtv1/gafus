// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileOverview } from "./ProfileOverview";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

afterEach(() => vi.unstubAllGlobals());

async function display(userId: string, responseData: unknown, galleryNavOnly = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: responseData }), { status: 200 }),
  ));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, {id:userId,username:"owner",role:"USER"});
  await act(async () => {
    root.render(createElement(
      QueryClientProvider, { client: cache },
      createElement(ProfileOverview, { userId, galleryNavOnly, showGalleryOptIn: galleryNavOnly }),
    ));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return {
    container, cache, async cleanup() {
      await act(async () => root.unmount());
      cache.clear();
      container.remove();
    },
  };
}

describe("isolated profile overview", () => {
  it("does not render an orphaned Photo Albums link below the profile", async () => {
    const result = await display("A", {
      id: "A", username: "doglover", email: "owner@example.test",
      profile: { fullName: "Владелец", city: null, about: null },
    }, true);
    try {
      expect(result.container.querySelector("[data-next-profile-sections]")).not.toBeNull();
      expect(result.container.querySelector('a[href="/profile/albums"]')).toBeNull();
      expect(result.container.textContent).not.toContain("Фотоальбомы");
    } finally {
      await result.cleanup();
    }
  });

  it("shows own verified email only and does not render phone", async () => {
    const result = await display("A", {
      id: "A", username: "doglover", email: "private@example.com",
      phone: "+79001001010",
      profile: { fullName: "Тренер", city: "Москва", about: "Собаки" },
    });
    try {
      expect(result.container.textContent).toContain("Тренер");
      expect(result.container.textContent).toContain("@doglover");
      expect(result.container.textContent).toContain("Москва");
      expect(result.container.textContent).toContain("private@example.com");
      expect(result.container.textContent).not.toContain("+79001001010");
    } finally {
      await result.cleanup();
    }
  });

  it("renders original Next illustrations, owner contact fields and responsive source sections", async () => {
    const ui = await display("A", { id:"A", username:"doglover",
      email:"SHOULD_NOT_APPEAR_IN_SHARED_CACHE", hasAppPassword:true, hasVkLinked:true,
      profile: { fullName:"Владелец собаки", city:"Самара", about:"Любим тренировки",
        birthDate:"1996-07-12", instagram:"gafus_dogs",telegram:"gafusRu",
        website:"https://gafus.ru/" },
    });
    try {
      expect(ui.container.textContent).toContain("Владелец собаки");
      expect(ui.container.textContent).toContain("Самара");
      expect(ui.container.textContent).toContain("Контакты");
      expect(ui.container.textContent).toContain("Instagram");
      expect(ui.container.textContent).toContain("Телеграм");
      expect(ui.container.querySelector('a[href="https://t.me/gafusRu"]')).not.toBeNull();
      expect(ui.container.querySelector('a[href="https://www.instagram.com/gafus_dogs/"]')).not.toBeNull();
      expect(ui.container.querySelector('a[href="https://gafus.ru/"]')).not.toBeNull();
      expect(ui.container.querySelector('img[src="/images/profile-icons/about.webp"]')).not.toBeNull();
      expect(ui.container.textContent).not.toContain("SHOULD_NOT_APPEAR_IN_SHARED_CACHE");
      const settings = [...ui.container.querySelectorAll<HTMLButtonElement>("button")]
        .find(button=>button.textContent?.trim()==="Настройки аккаунта");
      expect(settings).toBeDefined();
      await act(async()=>settings?.click());
      expect(ui.container.textContent).toContain("Политика конфиденциальности");
      expect(ui.container.textContent).toContain("Согласие на распространение данных");
      expect(ui.container.textContent).toContain("Выйти из аккаунта");
      expect(ui.container.querySelector('img[src="/images/profile-icons/login.webp"]')?.getAttribute("width"))
        .toBe("40");
      expect(ui.container.querySelector('img[src="/images/profile-icons/email.webp"]')).not.toBeNull();
      expect(ui.container.querySelector('img[src="/images/profile-icons/password.webp"]')).not.toBeNull();
      expect(ui.container.querySelector('img[src="/images/profile-icons/telegram.webp"]')).not.toBeNull();
      expect(ui.container.querySelector('img[src="/images/profile-icons/logout.webp"]')).not.toBeNull();
      expect(ui.container.querySelector('img[src="/images/profile-icons/delete-account.webp"]')).not.toBeNull();
      expect(ui.container.querySelector('img[src="/images/profile-icons/premium.webp"]')).not.toBeNull();
      expect(JSON.stringify(ui.cache.getQueryData(["user","profile","A"])))
        .not.toContain("SHOULD_NOT_APPEAR_IN_SHARED_CACHE");
    } finally {
      await ui.cleanup();
      window.history.replaceState(null,"","/profile");
    }
  });

  it("updates only allowed fields and refetches the server-confirmed profile", async () => {
    const original = {
      id: "A", username: "doglover", profile: {
        fullName: "Старое имя", city: "Москва", about: "О себе",
      },
    };
    const result = await display("A", original);
    try {
      const updated = { ...original, profile: { ...original.profile, city: "Казань" } };
      const requests: { path: string; options: RequestInit }[] = [];
      vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) => {
        requests.push({ path, options });
        const isUpdate = options?.method === "PUT";
        return Promise.resolve(new Response(JSON.stringify({
          success: true, data: isUpdate ? { userId: "A" } : updated,
        }), { status: 200 }));
      }));
      // Next retained this action as a navigable link (native Ctrl/Meta-click).
      // A plain click invokes the SPA editor without a full document reload.
      const edit = result.container.querySelector<HTMLAnchorElement>(
        'a[href="/profile/editBio"]',
      );
      expect(edit?.textContent).toContain("Редактировать профиль");
      await act(async () => edit?.click());
      const input = result.container.querySelector<HTMLInputElement>("#profile-edit-city")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, "Казань");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        result.container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
      const mutation = requests.find(req => req.options?.method === "PUT");
      expect(mutation?.path).toBe("/api/v1/user/profile");
      expect(JSON.parse(String(mutation?.options.body))).toEqual({
        city: "Казань",
      });
      expect(result.container.textContent).toContain("Казань");
      expect(result.container.querySelector("form")).toBeNull();
    } finally {
      await result.cleanup();
    }
  });

  it("rejects profile save failures without overwriting visible data", async () => {
    const original = {
      id: "A", username: "doglover", profile: {
        fullName: "Имя", city: "Москва", about: null,
      },
    };
    const result = await display("A", original);
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: false, error: "Не доступно",
      }), { status: 503 })));
      // Next retained this action as a navigable link (native Ctrl/Meta-click).
      // A plain click invokes the SPA editor without a full document reload.
      const edit = result.container.querySelector<HTMLAnchorElement>(
        'a[href="/profile/editBio"]',
      );
      expect(edit?.textContent).toContain("Редактировать профиль");
      await act(async () => edit?.click());
      const input=result.container.querySelector<HTMLInputElement>("#profile-edit-city")!;
      expect(input).not.toBeNull();
      await act(async()=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"Казань");
        input.dispatchEvent(new Event("input",{bubbles:true}));
      });
      await act(async () => {
        result.container.querySelector<HTMLFormElement>("form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      expect(result.container.querySelector('[role="alert"]')).toBeTruthy();
      expect(result.container.querySelector("form")).toBeTruthy();
      expect(result.cache.getQueryData(["user", "profile", "A"])).toMatchObject(original);
    } finally {
      await result.cleanup();
    }
  });

  it("refuses to display the profile if server identity mismatches the session", async () => {
    const result = await display("B", {
      id: "A", username: "somebody",
      profile: { fullName: "Другой", city: null, about: null },
    });
    try {
      expect(result.container.querySelector('[role="alert"]')).toBeTruthy();
      expect(result.container.textContent).not.toContain("Другой");
    } finally {
      await result.cleanup();
    }
  });
});

// STUDENT_NOTES_READ: actual own ProfileOverview, real QueryClient and mocked fetch.
const studentDate = "2026-10-18T10:11:12.000Z";
const myNote = (id: string, title: string | null | undefined = "Шаги тренировок") => ({
  id, ...(title === undefined ? {} : { title }), tags: ["прогресс", "упражнения"],
  createdAt: studentDate,
  trainer: { id: "trainer-1", username: "dogtrainer", profile: {
    fullName: "Елена Тренер", avatarUrl: "https://private.example/trainer/avatar",
  } },
  entries: [{ id: `${id}-entry`, content: "Тренируем выдержку <img src=x onerror=alert(1)>",
    order: 0, isVisibleToStudent: true, createdAt: studentDate, updatedAt: studentDate }],
});
const ownProfile = (id: string) => ({ id, username: "owner" + id,
  profile: { fullName: "Владелец " + id, city: null, about: null } });
const ownResponse = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data, error: "PRIVATE_NOTES_SERVER_STACK",
}), { status });
function unresolvedNotes() {
  let resolve!: (answer: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
async function studentNotesProfile(fetcher: ReturnType<typeof vi.fn>, userId = "A",
  actor: string | null = "A") {
  // Notes are now a dedicated profile tab. Avoid querying private notes on
  // activity/settings; open the real existing /profile?tab=notes route.
  window.history.replaceState(null, "", "/profile?tab=notes");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (actor !== null) cache.setQueryData(CURRENT_USER_QUERY_KEY,
    { id: actor, username: "owner" + actor, role: "USER" });
  const rerender = async (nextOwner: string) => {
    await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
      createElement(ProfileOverview, { userId: nextOwner }))));
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
  };
  await rerender(userId);
  return { container, cache, rerender, async cleanup() {
    await act(async () => root.unmount()); cache.clear(); container.remove();
    window.history.replaceState(null, "", "/profile");
  } };
}
const studentCalls = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(call => call[0] === "/api/v1/notes/student");

describe("STUDENT_NOTES_READ original own profile notes vertical", () => {
  it("shows server-ordered notes, safe trainer, null and absent titles, tags, text-only entries", async () => {
    const notes = [myNote("note-3", null), myNote("note-1"),
      { ...myNote("note-2"), title: undefined },
      { ...myNote("note-4"), title: "   ", trainer: {
        id: "trainer-4", username: "backup-trainer", profile: null,
      } }];
    const fetcher = vi.fn((path: string) => Promise.resolve(ownResponse(
      path === "/api/v1/notes/student" ? notes : ownProfile("A"))));
    const ui = await studentNotesProfile(fetcher);
    try {
      const panel = ui.container.querySelector('[aria-label="Заметки тренера"]');
      expect(panel).not.toBeNull();
      // Source Next renders h3 for truthy titles, including whitespace-only.
      // Null and missing titles must not invent a heading.
      expect(panel?.textContent).not.toContain("Заметка без названия");
      expect(panel?.textContent).toContain("Елена Тренер");
      // Original Next notes layout does not show the wire's private tags.
      expect(panel?.textContent).not.toContain("прогресс");
      expect(panel?.textContent).toContain("Тренируем выдержку <img src=x onerror=alert(1)>");
      expect(panel?.querySelector('img[src="x"]')).toBeNull();
      expect([...panel!.querySelectorAll("img")].every(img=>
        img.getAttribute("src")?.startsWith("/images/profile-icons/"))).toBe(true);
      expect(panel?.innerHTML).not.toContain('src="x"');
      expect(ui.container.innerHTML).not.toContain("private.example");
      expect([...panel!.querySelectorAll("article")].map(node => node.getAttribute("data-note-id")))
        .toEqual(["note-3", "note-1", "note-2", "note-4"]);
      expect(panel?.querySelectorAll("h3")).toHaveLength(2);
      expect(panel?.querySelector('[data-note-id="note-4"] h3')?.textContent).toBe("   ");
      expect(panel?.textContent).toContain("backup-trainer");
      expect(studentCalls(fetcher)).toHaveLength(1);
      expect(studentCalls(fetcher)[0][1]).toMatchObject({
        method: "GET", cache: "no-store", credentials: "include",
      });
    } finally { await ui.cleanup(); }
  });

  it("valid empty notes shows a real empty state, not an error", async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(ownResponse(
      path === "/api/v1/notes/student" ? [] : ownProfile("A"))));
    const ui = await studentNotesProfile(fetcher);
    try {
      expect(ui.container.textContent).toContain("Пока нет заметок от кинолога");
      expect(ui.container.querySelector('[aria-label="Заметки тренера"] [role="alert"]'))
        .toBeNull();
      expect(studentCalls(fetcher)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("strict-invalid nested wire fails closed without private text or false empty state", async () => {
    const malformed = { ...myNote("invalid"), entries: [{
      ...myNote("invalid").entries[0], createdAt: "not ISO", content: "PRIVATE_INVALID_ENTRY",
    }] };
    const fetcher = vi.fn((path: string) => Promise.resolve(ownResponse(
      path === "/api/v1/notes/student" ? [malformed] : ownProfile("A"))));
    const ui = await studentNotesProfile(fetcher);
    try {
      expect(ui.container.querySelector('[aria-label="Заметки тренера"] [role="alert"]'))
        .not.toBeNull();
      expect(ui.container.textContent).not.toContain("PRIVATE_INVALID_ENTRY");
      expect(ui.container.textContent).not.toContain("Пока нет заметок от кинолога");
    } finally { await ui.cleanup(); }
  });

  it("500 shows manual retry and then only fresh server 200 entries", async () => {
    let reads = 0;
    const fetcher = vi.fn((path: string) => Promise.resolve(path !== "/api/v1/notes/student"
      ? ownResponse(ownProfile("A"))
      : ++reads === 1 ? ownResponse(null, 500) : ownResponse([myNote("recovered")])));
    const ui = await studentNotesProfile(fetcher);
    try {
      const panel = ui.container.querySelector('[aria-label="Заметки тренера"]')!;
      expect(panel.querySelector('[role="alert"]')).not.toBeNull();
      expect(panel.textContent).not.toContain("Пока нет заметок от кинолога");
      expect(panel.textContent).not.toContain("PRIVATE_NOTES_SERVER_STACK");
      expect(reads).toBe(1);
      await act(async () => panel.querySelector<HTMLButtonElement>("button")?.click());
      await act(async () => { await new Promise(done => setTimeout(done, 30)); });
      expect(reads).toBe(2);
      expect(panel.textContent).toContain("Шаги тренировок");
    } finally { await ui.cleanup(); }
  });

  it.each([401, 403])("HTTP %s denies notes without stale/private records", async status => {
    const fetcher = vi.fn((path: string) => Promise.resolve(ownResponse(
      path === "/api/v1/notes/student" ? null : ownProfile("A"),
      path === "/api/v1/notes/student" ? status : 200)));
    const ui = await studentNotesProfile(fetcher);
    try {
      const panel = ui.container.querySelector('[aria-label="Заметки тренера"]')!;
      expect(panel.querySelector('[role="alert"]')).not.toBeNull();
      expect(panel.textContent).not.toContain("Пока нет заметок от кинолога");
      expect(panel.querySelector("button")).toBeNull();
      expect(!!panel.querySelector('a[href="/login"]')).toBe(status === 401);
      expect(studentCalls(fetcher)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });

  it("old successful notes are hidden during revalidation and permanent 403 denial", async () => {
    let denied = false;
    const pending = unresolvedNotes();
    const fetcher = vi.fn((path: string) => path !== "/api/v1/notes/student"
      ? Promise.resolve(ownResponse(ownProfile("A")))
      : denied ? pending.promise : Promise.resolve(ownResponse([myNote("private-old")])));
    const ui = await studentNotesProfile(fetcher);
    try {
      for (let attempt=0; attempt<20 && !ui.container.textContent?.includes("Шаги тренировок"); attempt++) {
        await act(async () => { await new Promise(done => setTimeout(done, 15)); });
      }
      expect(ui.container.textContent).toContain("Шаги тренировок");
      denied = true;
      await act(async () => {
        void ui.cache.invalidateQueries({ queryKey: ["user", "student-notes", "A"] });
        await new Promise(done => setTimeout(done, 15));
      });
      const panel = ui.container.querySelector('[aria-label="Заметки тренера"]')!;
      expect(panel.textContent).not.toContain("Шаги тренировок");
      expect(panel.textContent).toContain("Загрузка заметок…");
      await act(async () => pending.resolve(ownResponse(null, 403)));
      await act(async () => { await new Promise(done => setTimeout(done, 20)); });
      expect(panel.textContent).toContain("Нет доступа к заметкам тренера");
      expect(panel.textContent).not.toContain("Шаги тренировок");
      expect(panel.querySelector("button")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("guest, public other user and mismatched profile never send student-notes GET", async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(ownResponse(
      path === "/api/v1/notes/student" ? [myNote("SECRET")] : ownProfile("B"))));
    const guest = await studentNotesProfile(fetcher, "A", null);
    try {
      expect(studentCalls(fetcher)).toHaveLength(0);
      expect(guest.container.textContent).not.toContain("Заметки тренера");
    } finally { await guest.cleanup(); }
    const foreign = await studentNotesProfile(fetcher, "B", "A");
    try {
      expect(studentCalls(fetcher)).toHaveLength(0);
      expect(foreign.container.textContent).not.toContain("Заметки тренера");
    } finally { await foreign.cleanup(); }
    const mismatch = await studentNotesProfile(fetcher, "A", "A");
    try {
      expect(studentCalls(fetcher)).toHaveLength(0);
      expect(mismatch.container.textContent).not.toContain("Заметки тренера");
    } finally { await mismatch.cleanup(); }
  });

  it("owner A→B→A and late GET never display old notes or reuse stale auth", async () => {
    const oldNotes = unresolvedNotes();
    const fetcher = vi.fn((path: string) => path === "/api/v1/notes/student"
      ? oldNotes.promise : Promise.resolve(ownResponse(ownProfile("A"))));
    const ui = await studentNotesProfile(fetcher);
    try {
      expect(ui.container.textContent).not.toContain("PRIVATE_NOTES_CONTENT");
      expect(studentCalls(fetcher)).toHaveLength(1);
      await act(async () => ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "B", username: "ownerB", role: "USER" }));
      await ui.rerender("B");
      expect(ui.container.textContent).not.toContain("Заметки тренера");
      await act(async () => oldNotes.resolve(ownResponse([{
        ...myNote("old"), entries: [{...myNote("old").entries[0],
          content: "PRIVATE_NOTES_CONTENT"}],
      }])));
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      expect(ui.container.textContent).not.toContain("PRIVATE_NOTES_CONTENT");
      await act(async () => ui.cache.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "A", username: "ownerA", role: "USER" }));
      await ui.rerender("A");
      expect(ui.container.textContent).not.toContain("PRIVATE_NOTES_CONTENT");
      expect(studentCalls(fetcher)).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });
});
