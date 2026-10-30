// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemindersConnectedPage } from "./RemindersConnectedPage";

const reminder = (i = 1) => ({
  id: `reminder_${i}`, name: `Занятие ${i}`, enabled: true,
  reminderTime: "09:00", reminderDays: null, timezone: "Europe/Moscow",
  userId: "PRIVATE_OWNER_ID", pushToken: "SECRET_TOKEN",
});
const response = (status: number, data?: unknown) => new Response(JSON.stringify({
  success: status >= 200 && status < 300, data,
}), { status, headers: { "content-type": "application/json" } });
let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
let entries: ReturnType<typeof reminder>[];
let lastKey = "";
let loseAck = false;
let fetcher: ReturnType<typeof vi.fn>;
async function flush() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
}
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <RemindersConnectedPage ownerId="owner_A" />
  </QueryClientProvider>));
  await flush();
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label);
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await flush();
}
const renderedNames = () => [...host.querySelectorAll<HTMLElement>(
  "[data-next-reminder-row] [data-reminder-name]",
)].map(name => name.textContent);
async function setInput(label: string, value: string) {
  const input = [...host.querySelectorAll<HTMLInputElement>("input")]
    .find(x => x.closest("label")?.textContent?.trim().startsWith(label));
  expect(input, label).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function chooseZone(zone: string) {
  const select = host.querySelector<HTMLSelectElement>("select[required]");
  expect(select).not.toBeNull();
  expect([...select!.options].some(option => option.value === zone)).toBe(true);
  await act(async () => {
    select!.value = zone;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(select?.value).toBe(zone);
}
async function submit(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x => x.type === "submit" && x.textContent?.trim() === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  entries = [reminder()]; lastKey = ""; loseAck = false;
  fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === "/api/v1/reminders" && init.method === "GET") return response(200, entries);
    if (path === "/api/v1/reminders" && init.method === "POST") {
      const body = JSON.parse(String(init.body));
      lastKey = String((init.headers as Record<string, string>)["Idempotency-Key"]);
      expect(lastKey).toMatch(/^[0-9a-f-]{36}$/);
      const created = { ...reminder(2), ...body };
      entries.push(created);
      if (loseAck) throw Error("LOST_ACK_AFTER_COMMIT");
      return response(200, created);
    }
    if (path.startsWith("/api/v1/reminders/operations/") && init.method === "GET")
      return response(200, { status: "COMMITTED", reminder: entries.at(-1) });
    if (path === "/api/v1/reminders/reminder_1" && init.method === "PUT") {
      entries[0] = { ...entries[0], ...JSON.parse(String(init.body)) };
      return response(200, entries[0]);
    }
    if (path === "/api/v1/reminders/reminder_1" && init.method === "DELETE") {
      entries = entries.filter(item => item.id !== "reminder_1");
      return response(200);
    }
    throw Error(`UNEXPECTED_${init.method}_${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("confirm", vi.fn(() => true));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount()); cache.clear(); host.remove(); vi.unstubAllGlobals();
});
describe("ordinary /reminders Hono CRUD, not synthetic preview", () => {
  it("full-width editor overrides the Vite-wide 24rem form constraint", () => {
    const styles = readFileSync("src/features/profile/RemindersControls.module.css", "utf8");
    expect(styles).toMatch(/\.editorCard, \.confirmPanel \{[^}]*width: 100%;/s);
    expect(styles).toMatch(/\.editorCard, \.confirmPanel \{[^}]*max-width: none;/s);
    expect(styles).toContain("box-sizing: border-box");
  });
  it("uses original Next inline mascot and hides edit controls until owner GET settles",async()=>{
    let settle!:(response:Response)=>void;
    fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{settle=resolve;}));
    await mount();
    expect(host.querySelector('[role="status"]')?.textContent)
      .toContain("Загрузка напоминаний…");
    expect(host.querySelector<HTMLImageElement>(
      'img[src="/images/loading-mascot-router.webp"]')?.height).toBe(168);
    expect(host.querySelector<HTMLImageElement>(
      'img[src="/images/loading-mascot-router-poster.webp"]')?.width).toBe(168);
    expect(host.querySelector("[data-next-reminders-source-layout] h3")).toBeNull();
    expect(host.querySelector(".reminder-list")).toBeNull();
    expect(fetcher.mock.calls.map(([path,init])=>[path,init.method]))
      .toEqual([["/api/v1/reminders","GET"]]);
    await act(async()=>settle(response(200,entries)));
    await flush();
    expect(host.querySelector("[data-next-reminders-source-layout] h3")?.textContent)
      .toContain("Напоминания о тренировках");
    expect(host.textContent).not.toContain("Загрузка напоминаний…");
    expect(renderedNames()).toEqual(["Занятие 1"]);
  });
  it("owner GET projects only nonsecret reminder metadata", async () => {
    await mount();
    expect(renderedNames()).toContain("Занятие 1");
    expect(host.innerHTML).not.toContain("SECRET_TOKEN");
    expect(JSON.stringify(cache.getQueryData(["reminders", "owner", "live", "owner_A"])))
      .not.toContain("PRIVATE_OWNER_ID");
  });
  it("collapsed row is read-only with switch, time, disclosure and delete",async()=>{
    await mount();
    const row=host.querySelector("[data-next-reminder-row]");
    expect(row).not.toBeNull();
    // The original Next uses div.remindersList > div.reminderItem;
    // browser `ul/li` default marker and 40px padding are not source parity.
    const list=host.querySelector(".reminder-list");
    expect(list?.tagName).toBe("DIV");
    expect(row?.tagName).toBe("DIV");
    expect(row?.parentElement).toBe(list);
    expect(list?.querySelector("ul,li")).toBeNull();
    expect(row?.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(row?.querySelector("[data-reminder-name]")?.textContent).toBe("Занятие 1");
    expect(row?.querySelector('input[aria-label="Название напоминания"]')).toBeNull();
    expect(row?.textContent).toContain("09:00");
    expect(row?.querySelector('button[aria-label="Развернуть"]')).not.toBeNull();
    expect(row?.querySelector('button[aria-label="Удалить"]')?.textContent).toBe("×");
    expect(row?.querySelector('[class*="reminderDetails"]')).toBeNull();
    expect(row?.querySelector('button[aria-label="Удалить"]')).toHaveProperty("disabled",false);
  });
  it("expanded card edits name, time, days and zone in one confirmed PUT", async () => {
    await mount();
    await click("Развернуть");
    const form=host.querySelector<HTMLFormElement>('form[aria-label^="Изменить"]');
    expect(form).not.toBeNull();
    expect(host.querySelectorAll("[data-next-reminder-row] form")).toHaveLength(1);
    expect(host.querySelector('button[aria-label="Изменить"]')).toBeNull();
    await setInput("Название", "Утренняя дрессировка");
    const time=form?.querySelector<HTMLInputElement>('input[type="time"]');
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
      setter?.call(time,"10:30");
      time?.dispatchEvent(new Event("input",{bubbles:true}));
      time?.dispatchEvent(new Event("change",{bubbles:true}));
    });
    const monday=form?.querySelector<HTMLInputElement>('fieldset input[type="checkbox"]');
    await act(async()=>monday?.click());
    await chooseZone("Europe/Samara");
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
    expect(entries[0]).toMatchObject({
      name:"Занятие 1",reminderTime:"09:00",reminderDays:null,timezone:"Europe/Moscow",
    });
    await submit("Сохранить изменения");
    expect(entries[0]).toMatchObject({
      name:"Утренняя дрессировка",reminderTime:"10:30",reminderDays:"1",timezone:"Europe/Samara",
    });
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET","PUT","GET"]);
    expect(host.querySelector('form[aria-label^="Изменить"]')).toBeNull();
    expect(renderedNames()).toContain("Утренняя дрессировка");
  });
  it("quick enable switch uses one PUT and no editor", async () => {
    await mount();
    const toggle=host.querySelector<HTMLInputElement>(
      '[data-next-reminder-row] input[aria-label^="Напоминание"]',
    );
    expect(toggle?.checked).toBe(true);
    await act(async()=>toggle?.click());await flush();
    expect(entries[0]?.enabled).toBe(false);
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET","PUT","GET"]);
    expect(host.querySelector('form[aria-label^="Изменить"]')).toBeNull();
    await click("Развернуть");
    expect(host.querySelector('form[aria-label^="Изменить"]')).not.toBeNull();
    expect(toggle?.disabled).toBe(true);
  });
  it("cancel and collapse discard the entire unsaved draft without requests", async () => {
    await mount();
    await click("Развернуть");
    await setInput("Название","Черновик");
    await chooseZone("Europe/Samara");
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
    await click("Отмена");
    expect(host.querySelector('form[aria-label^="Изменить"]')).toBeNull();
    expect(renderedNames()).toEqual(["Занятие 1"]);
    await click("Развернуть");
    expect(host.querySelector<HTMLInputElement>('form[aria-label^="Изменить"] input')?.value)
      .toBe("Занятие 1");
    await setInput("Название", "Ещё черновик");
    await click("Свернуть");
    expect(host.querySelector('form[aria-label^="Изменить"]')).toBeNull();
    expect(entries[0]?.name).toBe("Занятие 1");
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
  });
  it("unchanged editor cannot send an empty PUT, even on a disabled reminder", async () => {
    entries=[{...reminder(),enabled:false}];
    await mount();
    await click("Развернуть");
    const form=host.querySelector<HTMLFormElement>('form[aria-label^="Изменить"]');
    const save=form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(form).not.toBeNull();
    expect(save?.disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[data-next-reminder-row] input[type="checkbox"]')
      ?.disabled).toBe(true);
    await setInput("Название","Изменённое выключенное напоминание");
    expect(save?.disabled).toBe(false);
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
    await submit("Сохранить изменения");
    expect(entries[0]?.name).toBe("Изменённое выключенное напоминание");
    expect(entries[0]?.enabled).toBe(false);
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET","PUT","GET"]);
  });
  it("blocks switching or refreshing other cards while one draft is open", async () => {
    entries=[reminder(1),reminder(2)];
    await mount();
    await click("Развернуть");
    await setInput("Название","Не потерять");
    const cards=[...host.querySelectorAll<HTMLElement>("[data-next-reminder-row]")];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.querySelector('button[aria-label="Свернуть"]')).not.toBeNull();
    expect(cards[1]?.querySelector<HTMLButtonElement>('button[aria-label="Развернуть"]')?.disabled)
      .toBe(true);
    expect(cards[1]?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled)
      .toBe(true);
    const refresh=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.trim()==="Обновить список");
    expect(refresh?.disabled).toBe(true);
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
    await click("Отмена");
    expect(cards[1]?.querySelector<HTMLButtonElement>('button[aria-label="Развернуть"]')?.disabled)
      .toBe(false);
    expect(refresh?.disabled).toBe(false);
    expect(entries[0]?.name).toBe("Занятие 1");
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
  });
  it("empty state has one primary create action and adjacent refresh, no extra actions",async()=>{
    entries=[];
    await mount();
    expect(host.querySelector("details")).toBeNull();
    expect(host.textContent).toContain("+ Добавить напоминание (0/5)");
    const add=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent?.includes("+ Добавить напоминание"));
    expect(add?.classList.contains("gafus-primary-button")).toBe(true);
    expect(add?.className).toMatch(/root/);
    expect(host.textContent).not.toContain("Дополнительные действия");
    expect(add?.parentElement?.getAttribute("aria-label")).toBe("Управление напоминаниями");
    expect(add?.nextElementSibling?.textContent).toContain("Обновить список");
    expect(add?.getAttribute("data-gafus-shared-button")).toBe("primary");
    expect(add?.nextElementSibling?.getAttribute("data-gafus-shared-button")).toBe("caramel");
    expect(host.querySelector('form[aria-label="Создать напоминание"]')).toBeNull();
    expect(add?.className).toMatch(/addButton/);
  });
  it("timezone is a real IANA dropdown with Samara and worldwide choices", async () => {
    await mount();
    await click("+ Добавить напоминание (1/5)");
    const form = host.querySelector('form[aria-label="Создать напоминание"]');
    const select = form?.querySelector<HTMLSelectElement>("select");
    expect(select).not.toBeNull();
    expect(form?.querySelector('input[maxlength="100"][value="Europe/Samara"]')).toBeNull();
    expect(select?.closest("label")?.textContent).toContain("Часовой пояс");
    expect(select?.getAttribute("required")).not.toBeNull();
    expect([...select!.options].some(option => option.value === "Europe/Samara"
      && option.textContent?.includes("Самара"))).toBe(true);
    expect([...select!.options].some(option => option.value === "Europe/Paris")).toBe(true);
    expect([...select!.options].some(option => option.value === "Asia/Tokyo")).toBe(true);
    expect(fetcher.mock.calls.map(([_, init]) => init.method)).toEqual(["GET"]);
  });
  it("creates an owner reminder with the selected IANA zone, never free text", async () => {
    entries = [];
    await mount();
    await click("+ Добавить напоминание (0/5)");
    await setInput("Название", "Тренировка в Самаре");
    await chooseZone("Europe/Samara");
    await submit("Создать напоминание");
    expect(entries[0]?.timezone).toBe("Europe/Samara");
    const posted = fetcher.mock.calls.find(([_, init]) => init.method === "POST");
    expect(JSON.parse(String(posted?.[1].body)).timezone).toBe("Europe/Samara");
    expect(renderedNames()).toContain("Тренировка в Самаре");
  });
  it("edit dropdown retains the original timezone and saves selected change", async () => {
    await mount();
    await click("Развернуть");
    const before = host.querySelector<HTMLSelectElement>('form[aria-label^="Изменить"] select');
    expect(before?.value).toBe("Europe/Moscow");
    await chooseZone("Europe/Samara");
    await submit("Сохранить изменения");
    expect(entries[0]?.timezone).toBe("Europe/Samara");
    const put = fetcher.mock.calls.find(([_, init]) => init.method === "PUT");
    expect(JSON.parse(String(put?.[1].body)).timezone).toBe("Europe/Samara");
    expect(fetcher.mock.calls.map(([_, init]) => init.method)).toEqual(["GET", "PUT", "GET"]);
  });
  it("keeps a valid older IANA alias selected instead of silently switching zones", async () => {
    entries = [{ ...reminder(), timezone: "Etc/GMT-4" }];
    await mount();
    await click("Развернуть");
    const selector = host.querySelector<HTMLSelectElement>('form[aria-label^="Изменить"] select');
    expect(selector?.value).toBe("Etc/GMT-4");
    expect(selector?.selectedOptions[0]?.textContent).toContain("Etc/GMT-4");
    await click("Отмена");
    expect(entries[0]?.timezone).toBe("Etc/GMT-4");
    expect(fetcher.mock.calls.map(([_, init]) => init.method)).toEqual(["GET"]);
  });
  it("primary CTA opens styled form without POST, then creates through idempotent owner API",async()=>{
    entries=[];
    await mount();
    await click("+ Добавить напоминание (0/5)");
    expect(entries).toHaveLength(0);
    expect(fetcher.mock.calls.map(([_,init]) => init.method)).toEqual(["GET"]);
    expect(host.textContent).not.toContain("Дополнительные действия");
    const editor = host.querySelector<HTMLFormElement>('form[aria-label="Создать напоминание"]');
    expect(editor).not.toBeNull();
    expect(editor?.className).toMatch(/editorCard/);
    expect(editor?.querySelector('button[type="submit"]')?.getAttribute("data-gafus-shared-button"))
      .toBe("primary");
    expect(editor?.querySelector('button[type="button"]')?.getAttribute("data-gafus-shared-button"))
      .toBe("secondary");
    await setInput("Название", "Утренние занятия");
    await submit("Создать напоминание");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("Утренние занятия");
    expect(renderedNames()).toContain("Утренние занятия");
    expect(host.textContent).toContain("Сохранено и подтверждено сервером");
    const success=host.querySelector('[role="status"][class*="success"]');
    expect(success?.querySelector('button[aria-label="Закрыть"]')).not.toBeNull();
    const before=fetcher.mock.calls.length;
    await click("Закрыть");
    expect(host.textContent).not.toContain("Сохранено и подтверждено сервером");
    expect(renderedNames()).toContain("Утренние занятия");
    expect(fetcher.mock.calls).toHaveLength(before);
    expect(fetcher.mock.calls.filter(([_,init])=>init.method==="POST")).toHaveLength(1);
  });
  it("main CTA creates with unique idempotency key and server readback", async () => {
    entries = [reminder()];
    await mount(); await click("+ Добавить напоминание (1/5)");
    expect(entries).toHaveLength(1);
    await setInput("Название", "Утро с собакой");
    await submit("Создать напоминание");
    expect(renderedNames()).toContain("Утро с собакой");
    expect(host.textContent).toContain("Сохранено и подтверждено сервером");
    expect(fetcher.mock.calls.map(([_, init]) => init.method)).toEqual(["GET", "GET", "POST", "GET"]);
  });
  it("main create lost ACK is resolved by GET receipt with NO replay", async () => {
    entries = [reminder()]; loseAck = true;
    await mount(); await click("+ Добавить напоминание (1/5)");
    await setInput("Название", "Днём погулять");
    await submit("Создать напоминание");
    expect(lastKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetcher.mock.calls.map(([path, init]) => [
      path.startsWith("/api/v1/reminders/operations/") ? "operation" : path,
      init.method,
    ])).toEqual([
      ["/api/v1/reminders", "GET"], ["/api/v1/reminders", "GET"],
      ["/api/v1/reminders", "POST"], ["operation", "GET"],
      ["/api/v1/reminders", "GET"],
    ]);
    expect(renderedNames()).toContain("Днём погулять");
    expect(host.textContent).toContain("Сохранено и подтверждено сервером");
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
  });
  it("edits then deletes via one form and authoritative GET readback", async () => {
    await mount();
    await click("Развернуть");
    expect(host.querySelectorAll('form[aria-label^="Изменить"]')).toHaveLength(1);
    await setInput("Название", "Новое название");
    await submit("Сохранить изменения");
    expect(renderedNames()).toContain("Новое название");
    await click("Удалить");
    expect(host.querySelector('[aria-label="Подтверждение удаления напоминания"]'))
      .not.toBeNull();
    expect(fetcher.mock.calls.every(([_,init])=>init.method!=="DELETE")).toBe(true);
    const dangerous=host.querySelector<HTMLButtonElement>(
      '[aria-label="Подтверждение удаления напоминания"] button',
    );
    expect(dangerous?.getAttribute("data-gafus-shared-button")).toBe("secondary");
    expect(dangerous?.className).toMatch(/red/);
    await click("Да, удалить");
    expect(host.textContent).toContain("Напоминаний пока нет");
    expect(host.textContent).toContain("Напоминание удалено");
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual([
      "GET","PUT","GET","DELETE","GET",
    ]);
  });
  it("cancel explicit delete keeps original owner reminder with zero DELETE requests", async () => {
    await mount();
    // Source Next uses the compact red × with accessible name "Удалить".
    await click("Развернуть");
    await click("Удалить");
    expect(host.querySelector('[aria-label="Подтверждение удаления напоминания"]'))
      .not.toBeNull();
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "DELETE")).toHaveLength(0);
    await click("Не удалять");
    expect(renderedNames()).toContain("Занятие 1");
    expect(host.querySelector('[aria-label="Подтверждение удаления напоминания"]')).toBeNull();
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "DELETE")).toHaveLength(0);
  });
  it("cancel create discards draft, never posts, and reset opens a clean form", async () => {
    await mount();
    await click("+ Добавить напоминание (1/5)");
    await setInput("Название", "Черновик");
    expect(host.querySelector('form[aria-label="Создать напоминание"]')?.className)
      .toMatch(/editorCard/);
    await click("Отмена");
    expect(host.querySelector('form[aria-label="Создать напоминание"]')).toBeNull();
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
    await click("+ Добавить напоминание (1/5)");
    const name=host.querySelector<HTMLInputElement>('form[aria-label="Создать напоминание"] input');
    expect(name?.value).toBe("");
    expect(entries).toHaveLength(1);
  });
  it("refresh stays beside primary CTA and only performs owner GET", async () => {
    await mount();
    const controls=host.querySelector('[aria-label="Управление напоминаниями"]');
    expect(controls?.children).toHaveLength(2);
    expect(controls?.children[0]?.textContent).toContain("+ Добавить напоминание");
    expect(controls?.children[1]?.textContent).toContain("Обновить список");
    expect(controls?.children[1]?.getAttribute("data-gafus-shared-button")).toBe("caramel");
    expect(host.textContent).not.toContain("Дополнительные действия");
    await click("Обновить список");
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET","GET"]);
  });
  it("expanded editor is integrated in card, with red cancel and no duplicate",async()=>{
    await mount();
    await click("Развернуть");
    const editor=host.querySelector<HTMLFormElement>('form[aria-label^="Изменить"]');
    expect(editor?.className).toMatch(/inlineEditor/);
    expect(editor?.parentElement?.hasAttribute("data-next-reminder-row")).toBe(true);
    expect(editor?.querySelector("input")?.closest("label")?.className).toMatch(/field/);
    expect(editor?.querySelector('button[type="submit"]')?.getAttribute("data-gafus-shared-button"))
      .toBe("primary");
    const cancel=editor?.querySelector<HTMLButtonElement>('button[data-gafus-shared-button="secondary"]');
    expect(cancel?.className).toMatch(/red/);
    expect(host.querySelectorAll('[data-next-reminder-row] input[type="time"]')).toHaveLength(1);
    expect(host.querySelector('button[aria-label="Свернуть"]')?.getAttribute("aria-controls"))
      .toBe(editor?.id);
    await click("Отмена");
    expect(host.querySelector('form[aria-label^="Изменить"]')).toBeNull();
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
  });
  it("uses shared red cancel on both the toolbar and the create form", async () => {
    await mount();
    await click("+ Добавить напоминание (1/5)");
    const toolbarCancel=host.querySelector<HTMLButtonElement>(
      '[aria-label="Управление напоминаниями"] button[aria-expanded="true"]',
    );
    expect(toolbarCancel?.textContent).toContain("Отменить добавление");
    expect(toolbarCancel?.getAttribute("data-gafus-shared-button")).toBe("secondary");
    expect(toolbarCancel?.className).toMatch(/red/);
    const formCancel=host.querySelector<HTMLButtonElement>(
      'form[aria-label="Создать напоминание"] button[data-gafus-shared-button="secondary"]',
    );
    expect(formCancel?.textContent).toContain("Отмена");
    expect(formCancel?.className).toMatch(/red/);
    expect(host.querySelector('[aria-label="Управление напоминаниями"] button'
      + '[data-gafus-shared-button="caramel"]')).not.toBeNull();
    await click("Отменить добавление");
    expect(host.querySelector('form[aria-label="Создать напоминание"]')).toBeNull();
    expect(fetcher.mock.calls.map(([_,init])=>init.method)).toEqual(["GET"]);
  });
  it("at five owner reminders no create action is shown", async () => {
    entries = Array.from({ length: 5 }, (_, i) => reminder(i + 1));
    await mount();
    expect(host.textContent).toContain("Достигнут лимит: 5 напоминаний");
    expect(host.querySelector('button[aria-controls="reminder-create-form"]')).toBeNull();
    expect(host.textContent).toContain("Обновить список");
  });
});
