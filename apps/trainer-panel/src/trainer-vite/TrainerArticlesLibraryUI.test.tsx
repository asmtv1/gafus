// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TrainerOwnArticlesRead20261022 } from "./TrainerOwnArticlesRead20261022";

const actor = { id: "trainer_1", role: "TRAINER" as const };
const session = () => ({ actor, token: "local", authEpoch: "epoch" });
const safe = { "cache-control": "private, no-store" };
const items = [
  { id: "article_1", title: "Учим команду сидеть", slug: "sidet", visibility: "PUBLIC",
    likeCount: 12, viewCount: 120, createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z" },
  { id: "article_2", title: "Прогулки с собакой", slug: "walks", visibility: "PAID",
    likeCount: 3, viewCount: 4, createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-03T10:00:00.000Z" },
];
let visible: typeof items;
const reads = vi.fn(async (path: string) => {
  if (path.endsWith("/viewers")) return { status: 200, headers: safe, body: { success: true, data: {
    viewers: [{ userId: "reader_1", username: "reader", fullName: "Читатель",
      lastViewedAt: "2026-11-03T10:00:00.000Z" }],
  } } };
  if (path.includes("/manage/")) return { status: 404, headers: safe,
    body: { success: false, code: "NOT_FOUND" } };
  return { status: 200, headers: safe, body: { success: true, data: { articles: visible } } };
});
const writes = vi.fn(async (req: { method: string; path: string }) => {
  if (req.method === "DELETE") visible = visible.filter(row => !req.path.endsWith(row.id));
  return { status: 200, headers: safe, body: { success: true } };
});
let root: Root;
let host: HTMLDivElement;
async function mount() {
  await act(async () => root.render(createElement(TrainerOwnArticlesRead20261022, {
    pathname: "/main-panel/articles", actor, token: "local", authEpoch: "epoch",
    enabled: true, showEditorLinks: true, transport: reads,
    writeTransport: writes, getCurrentSession: session,
  })));
}
async function clickLabel(label: string) {
  const button = [...host.querySelectorAll("button")].find(node =>
    node.getAttribute("aria-label") === label || node.textContent?.trim() === label);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function selectFilter(value: string, label: string) {
  const outer = [...host.querySelectorAll("label")].find(node => node.textContent?.includes(label));
  const select = outer?.querySelector("select");
  if (!select) throw Error("SELECT_NOT_FOUND");
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  visible = [...items]; reads.mockClear(); writes.mockClear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.restoreAllMocks();
});
describe("own articles editorial library", () => {
  it("shows accessible table with localized statuses, statistics and action links", async () => {
    await mount();
    expect(host.querySelectorAll(".trainer-articles-table tbody tr")).toHaveLength(2);
    expect(host.querySelectorAll(".trainer-articles-metrics strong")).toHaveLength(4);
    expect(host.textContent).toContain("Публичная");
    expect(host.textContent).toContain("По подписке");
    expect(host.textContent).toContain("124");
    expect(host.querySelector('a[href="/articles/article_1/edit"]')).toBeTruthy();
    expect(host.querySelector('a[href="/articles/new"]')).toBeTruthy();
  });
  it("filters by visibility and sorts by views, without making another GET", async () => {
    await mount();
    await selectFilter("PAID", "Видимость");
    expect(host.querySelectorAll(".trainer-articles-table tbody tr")).toHaveLength(1);
    expect(host.textContent).toContain("Загружено статей: 2; показано: 1");
    await clickLabel("Очистить поиск");
    await selectFilter("views", "Сортировка");
    const rows = [...host.querySelectorAll(".trainer-articles-title-button")];
    expect(rows.map(node => node.textContent)).toEqual(["Учим команду сидеть", "Прогулки с собакой"]);
    expect(reads).toHaveBeenCalledTimes(1);
  });
  it("loads author-scoped viewers on demand and closes dialog", async () => {
    await mount();
    expect(reads).toHaveBeenCalledTimes(1);
    await clickLabel("Кто смотрел: Учим команду сидеть");
    expect(reads).toHaveBeenCalledWith(
      "/api/v1/trainer/articles/own-summary/article_1/viewers", expect.any(AbortSignal));
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Читатель");
    expect(host.textContent).toContain("Гостевые посещения");
    await clickLabel("Закрыть список читателей");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("deletes only after consent and verified 404 readback, then refreshes the list", async () => {
    const ask = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await mount();
    await clickLabel("Удалить статью: Прогулки с собакой");
    expect(writes).not.toHaveBeenCalled();
    await clickLabel("Удалить статью: Прогулки с собакой");
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({
      method: "DELETE", path: "/api/v1/trainer/articles/manage/article_2",
    }));
    expect(host.querySelectorAll(".trainer-articles-table tbody tr")).toHaveLength(1);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
