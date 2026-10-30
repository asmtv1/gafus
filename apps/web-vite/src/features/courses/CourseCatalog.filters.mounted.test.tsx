// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCatalog } from "./CourseCatalog";
import { FavoriteCourseButton } from "./FavoriteCourseButton";
const make = (
  id: string,
  name: string,
  isPaid: boolean,
  isPrivate: boolean,
  trainingLevel: string,
  userStatus: string,
) => ({
  id,
  name,
  type: id,
  shortDesc: "Тренировки",
  duration: "10 дней",
  isPaid,
  isPrivate,
  hasAccess: false,
  isFavorite: true,
  userStatus,
  trainingLevel,
});
const data = [
  make("free_01", "Бесплатная школа", false, false, "BEGINNER", "NOT_STARTED"),
  make("paid_01", "Занятия с кинологом", true, false, "INTERMEDIATE", "IN_PROGRESS"),
  make("private_01", "Приватные упражнения", false, true, "ADVANCED", "COMPLETED"),
];
const response = (rows: unknown) =>
  new Response(JSON.stringify({ success: true, data: rows }), { status: 200 });
let root: Root, host: HTMLDivElement, cache: QueryClient;
let requests: ReturnType<typeof vi.fn>;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 22));
  });
}
async function mount(userId: string | null = "A") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <CourseCatalog userId={userId} favoritesOnly />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function field(id: string, value: string) {
  const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  expect(el).not.toBeNull();
  await act(async () => {
    if (!el) return;
    const set = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype,
      "value",
    )?.set;
    set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}
const titles = () =>
  [...host.querySelectorAll(".course-card-heading h3")].map((el) => el.textContent);
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot((host = document.createElement("div")));
  document.body.append(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  requests = vi.fn().mockImplementation(() => Promise.resolve(response(data)));
  vi.stubGlobal("fetch", requests);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("COURSE-010 responsive client-only catalog filters", () => {
  it("C-L01 search is applied only to current server-projected names", async () => {
    await mount();
    await field("course-filter-search", "кинологом");
    expect(titles()).toEqual(["Занятия с кинологом"]);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("C-L02 legacy type and level selections combine without HTTP", async () => {
    await mount();
    await field("course-filter-kind", "paid");
    await field("course-filter-level", "INTERMEDIATE");
    expect(titles()).toEqual(["Занятия с кинологом"]);
    await field("course-filter-level", "ADVANCED");
    expect(titles()).toEqual([]);
    expect(host.textContent).toContain("По выбранным фильтрам курсы не найдены");
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("C-L03 progress filters and reset never infer entitlement", async () => {
    await mount();
    await field("course-filter-progress", "COMPLETED");
    expect(titles()).toEqual(["Приватные упражнения"]);
    // Current source card marks private course as such, without granting access.
    expect(host.textContent).toContain("Приватный");
    const reset = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Сбросить фильтры",
    );
    await act(async () => reset?.click());
    expect(titles()).toHaveLength(3);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("C-L04 sorting by name is local; server order remains default", async () => {
    await mount();
    expect(titles()).toEqual(data.map((item) => item.name));
    await field("course-filter-sort", "name");
    expect(titles()).toEqual(["Бесплатная школа", "Занятия с кинологом", "Приватные упражнения"]);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("C-L05 changing principal cannot retain previous owner's search", async () => {
    await mount("A");
    await field("course-filter-search", "Приватные");
    expect(titles()).toHaveLength(1);
    await mount("B");
    expect(host.querySelector<HTMLInputElement>("#course-filter-search")?.value).toBe("");
    expect(titles()).toHaveLength(3);
    expect(requests).toHaveBeenCalledTimes(2);
  });
});


// COURSE010: actual mounted favorite submit lifecycle, using the existing catalog test root.
const favoriteAck = (isFavorite: boolean) => new Response(
  JSON.stringify({ success: true, data: { isFavorite } }),
  { status: 200 },
);
const favoriteFailure = () => new Response(
  JSON.stringify({ success: false, error: "Unknown acknowledgement" }),
  { status: 500 },
);
function deferredFavoriteResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mountFavorite(userId: string, courseId: string, isFavorite = false) {
  await act(async () => root.render(
    <QueryClientProvider client={cache}>
      <FavoriteCourseButton userId={userId} courseId={courseId} isFavorite={isFavorite} />
    </QueryClientProvider>,
  ));
}
function favoriteButton(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Добавить в избранное"]');
  if (!button) throw new Error("Expected current favorite submit button");
  return button;
}

describe("COURSE010 favorite same-turn singleflight", () => {
  it("two native clicks in one React turn dispatch exactly one explicit add POST", async () => {
    const pending = deferredFavoriteResponse();
    requests.mockImplementation(() => pending.promise);
    await mountFavorite("actor-A", "free_01");
    const button = favoriteButton();
    await act(async () => {
      button.click();
      button.click();
      await Promise.resolve();
    });
    expect(requests).toHaveBeenCalledTimes(1);
    expect(requests.mock.calls[0][0]).toBe("/api/v1/courses/favorites");
    const payload = JSON.parse((requests.mock.calls[0][1] as RequestInit).body as string);
    expect(payload).toEqual({ courseId: "free_01", action: "add" });
    await act(async () => pending.resolve(favoriteAck(true)));
    await flush();
  });

  it("unknown acknowledgement has no automatic replay; refresh GET reconciliation remains, retry needs click", async () => {
    requests.mockResolvedValueOnce(favoriteFailure()).mockResolvedValueOnce(favoriteAck(true));
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await mountFavorite("actor-A", "free_01");
    await act(async () => favoriteButton().click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Не удалось подтвердить избранное");
    const refresh = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === "Обновить список курсов",
    );
    expect(refresh).toBeDefined();
    await act(async () => refresh?.click());
    expect(requests).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["courses", "catalog", "actor-A"] });
    await act(async () => favoriteButton().click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(2);
    expect((requests.mock.calls[1][1] as RequestInit).method).toBe("POST");
  });

  it("retiring actor/course keeps new submit available; stale ACK invalidates only old owner", async () => {
    const old = deferredFavoriteResponse();
    const newer = deferredFavoriteResponse();
    requests.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => newer.promise);
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await mountFavorite("actor-A", "free_01");
    await act(async () => { favoriteButton().click(); await Promise.resolve(); });
    expect(requests).toHaveBeenCalledTimes(1);
    await mountFavorite("actor-B", "paid_01");
    expect(favoriteButton().disabled).toBe(false);
    await act(async () => { favoriteButton().click(); await Promise.resolve(); });
    expect(requests).toHaveBeenCalledTimes(2);
    await act(async () => old.resolve(favoriteAck(true)));
    await flush();
    expect(favoriteButton().disabled).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["courses", "catalog", "actor-A"] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["courses", "catalog", "actor-B"] });
    await act(async () => newer.resolve(favoriteAck(true)));
    await flush();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["courses", "catalog", "actor-B"] });
  });

  it("same actor switching course is not blocked by prior course flight", async () => {
    const old = deferredFavoriteResponse();
    const newer = deferredFavoriteResponse();
    requests.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => newer.promise);
    await mountFavorite("actor-A", "free_01");
    await act(async () => { favoriteButton().click(); await Promise.resolve(); });
    await mountFavorite("actor-A", "paid_01");
    expect(favoriteButton().disabled).toBe(false);
    await act(async () => { favoriteButton().click(); await Promise.resolve(); });
    expect(requests).toHaveBeenCalledTimes(2);
    const bodies = requests.mock.calls.map(([, options]) =>
      JSON.parse((options as RequestInit).body as string),
    );
    expect(bodies).toEqual([
      { courseId: "free_01", action: "add" }, { courseId: "paid_01", action: "add" },
    ]);
    await act(async () => old.resolve(favoriteAck(true)));
    await flush();
    expect(favoriteButton().disabled).toBe(true);
    await act(async () => newer.resolve(favoriteAck(true)));
    await flush();
  });
  it("C-L11 original ratings filter verified Core averages without GET or inferred access",async()=>{
    requests.mockImplementation(()=>Promise.resolve(response(data.map((row,index)=>({
      ...row, avgRating: [4.7,null,3.3][index],
    })))));
    await mount();
    const toggle=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="Фильтры");
    const dialog=()=>document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Фильтры курсов"]');
    await act(async()=>toggle?.click());
    const four=[...dialog()!.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="4+ звезды");
    expect(four).toBeDefined();
    await act(async()=>four?.click());
    expect(titles()).toHaveLength(3);
    // Original Next uses a separate accessible numeric results badge.
    const apply = dialog()?.querySelector<HTMLButtonElement>(
      ".course-next-filters-footer .course-next-filters-apply");
    // Flex gap is visual spacing, not a literal DOM text-node separator.
    expect(apply?.firstChild?.textContent?.trim()).toBe("Показать");
    const badge = apply?.querySelector<HTMLElement>(".course-next-results-count");
    expect(badge?.textContent?.trim()).toBe("1");
    expect(badge?.getAttribute("aria-label")).toBe("Результатов: 1");
    await act(async()=>dialog()?.querySelector<HTMLButtonElement>(
      ".course-next-filters-footer .course-next-filters-apply")?.click());
    expect(titles()).toEqual(["Бесплатная школа"]);
    expect(requests).toHaveBeenCalledTimes(1);
  });
  it("C-L10 source options stage locally and apply once without server writes",async()=>{
    await mount();
    const toggle=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="Фильтры");
    const dialog=()=>document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Фильтры курсов"]');
    await act(async()=>toggle?.click());
    expect(dialog()?.querySelectorAll(".course-next-drawer-section")).toHaveLength(4);
    const paid=[...dialog()!.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="Платные");
    expect(paid).toBeDefined();
    await act(async()=>paid?.click());
    expect(paid?.getAttribute("aria-pressed")).toBe("true");
    expect(titles()).toHaveLength(3);
    await act(async()=>dialog()?.querySelector<HTMLButtonElement>(
      ".course-next-filters-footer .course-next-filters-apply")?.click());
    expect(dialog()).toBeNull();
    expect(titles()).toEqual(["Занятия с кинологом"]);
    expect(requests).toHaveBeenCalledTimes(1);
  });
  it("C-L12 source reset button is visible on the initial all tab and reproduces staged free vs applied all",async()=>{
    await mount();
    const toggle=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="Фильтры");
    await act(async()=>toggle?.click());
    const dialog=()=>document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Фильтры курсов"]');
    const reset=dialog()?.querySelector<HTMLButtonElement>(".course-next-filters-reset");
    expect(reset?.textContent?.trim()).toBe("Сбросить");
    expect(dialog()?.querySelector(".course-next-filters-apply")).not.toBeNull();
    await act(async()=>reset?.click());
    expect(dialog()?.querySelector(".course-next-filters-reset")).toBeNull();
    const free=[...dialog()!.querySelectorAll<HTMLButtonElement>(".course-next-drawer-options button")]
      .find(button=>button.textContent?.trim()==="Бесплатные");
    expect(free?.getAttribute("aria-pressed")).toBe("true");
    expect(titles()).toHaveLength(3);
    expect(requests).toHaveBeenCalledTimes(1);
    await act(async()=>dialog()?.querySelector<HTMLButtonElement>(
      ".course-next-filters-apply")?.click());
    expect(titles()).toEqual(["Бесплатная школа"]);
    expect(requests).toHaveBeenCalledTimes(1);
  });
  it("C-L09 original filter drawer opens with overlay and closes by Escape, no API mutation",async()=>{
    await mount();
    const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(el => el.textContent?.trim()==="Фильтры");
    expect(button).toBeDefined();
    await act(async()=>button?.click());
    // The source drawer is a viewport-level portal, outside the mounted host.
    const dialog=document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Фильтры курсов"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("course-next-filters-drawer")).toBe(true);
    expect(document.body.querySelector("button.course-next-filters-backdrop")).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Escape",bubbles:true,
    })));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector("button.course-next-filters-backdrop")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(requests).toHaveBeenCalledTimes(1);
  });

});
