// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { ProfileOverview } from "../profile/ProfileOverview";
import type { WalletSourceMock } from "./walletReadApi";
const status = (enabled = true) => ({
  serverNow: "2026-10-18T12:00:00Z",
  wallet: { balance: 8 },
  activity: { earned: 2, limit: 3, remaining: 1, windowSeconds: 86400, nextCapacityAt: null },
  rules: {
    postReward: 1,
    questionReward: 1,
    answerReward: 1,
    reactionThreshold: 10,
    reactionReward: 1,
    bestAnswerReward: 1,
    courseStepCost: 1,
    miniGuideCost: 1,
    accessDurationSeconds: 604800,
  },
  enabled: { economy: enabled, earning: enabled, spending: enabled },
  settingsRevision: 1,
  secret: "PRIVATE_TOKEN",
});
const item = (id = "t1") => ({
  id,
  kind: "EARN",
  delta: 1,
  balanceAfter: 8,
  createdAt: "2026-10-18T12:00:00Z",
  rewardKind: "POST_PUBLISHED",
  sourceEntityId: "PRIVATE_USER",
  targetKey: "SECRET_CONTENT",
});
const history = (items: unknown[] = [], cursor: string | null = null) => ({
  items,
  nextCursor: cursor,
  secret: "PRIVATE_CURSOR",
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
let host: HTMLDivElement, root: Root, client: QueryClient, wire: WalletSourceMock;
let statusWire: ReturnType<typeof vi.fn<WalletSourceMock["status"]>>;
let historyWire: ReturnType<typeof vi.fn<WalletSourceMock["history"]>>;
let fetcher: ReturnType<typeof vi.fn>;
const pause = async () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
async function mount(enabled = true, transport: WalletSourceMock | null = wire, owner = "owner") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ProfileOverview
          userId={owner}
          showWalletOptIn={enabled}
          walletSyntheticTransport={transport ?? undefined}
        />
      </QueryClientProvider>,
    ),
  );
  await pause();
}
async function click(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(found, label).toBeDefined();
  await act(async () => found?.click());
  await pause();
}
async function enter() {
  await mount();
  await click("Мои гафусы и история (макет)");
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner", username: "owner" });
  statusWire = vi.fn(async () => status());
  historyWire = vi.fn(async () => history([item()]));
  wire = {
    fixtureKind: "AG2_WALLET_SYNTHETIC_SELF_GET_ONLY",
    status: statusWire,
    history: historyWire,
  };
  fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url !== "/api/v1/user/profile" || init.method !== "GET")
      throw Error("UNEXPECTED_REAL_REQUEST");
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: "owner",
          username: "owner",
          profile: { fullName: "Владелец", city: "Самара", about: "Собака" },
          email: "PRIVATE_EMAIL",
        },
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("WEB-URL-027 owner Profile -> Wallet opt-in mounted", () => {
  it("M01 off by default, no mock reads", async () => {
    await mount(false);
    expect(host.textContent).not.toContain("Мои гафусы и история (макет)");
    expect(statusWire).not.toHaveBeenCalled();
  });
  it("M02 absent explicit synthetic transport -> no entry", async () => {
    await mount(true, null);
    expect(host.textContent).not.toContain("Мои гафусы и история (макет)");
  });
  it("M03 owner entry -> balance + history -> close; private data stripped", async () => {
    await enter();
    expect(statusWire).toHaveBeenCalledTimes(1);
    expect(historyWire).toHaveBeenCalledExactlyOnceWith(null);
    expect(host.textContent).toContain("8 🐾");
    expect(host.textContent).toContain("1 из 3");
    expect(host.textContent).toContain("Публикация");
    expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|sourceEntityId|targetKey/);
    await click("Мой профиль");
    expect(host.textContent).toContain("Мои гафусы и история (макет)");
    expect(host.textContent).not.toContain("1 из 3");
  });
  it("M04 economy disabled still reports balance", async () => {
    statusWire.mockResolvedValueOnce(status(false));
    await enter();
    expect(host.textContent).toContain("Новая система мотивации пока не включена");
  });
  it("M05 history empty", async () => {
    historyWire.mockResolvedValueOnce(history());
    await enter();
    expect(host.textContent).toContain("Пока нет операций");
  });
  it("M06 balance error doesn't request history; retry explicit", async () => {
    statusWire.mockRejectedValueOnce(Error("PRIVATE_ERROR"));
    await enter();
    expect(historyWire).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Не удалось получить баланс");
    expect(host.textContent).not.toContain("PRIVATE_ERROR");
    await click("Повторить баланс");
    expect(historyWire).toHaveBeenCalledOnce();
  });
  it("M07 history error, retry no balance mutation", async () => {
    historyWire.mockRejectedValueOnce(Error("PRIVATE_PG"));
    await enter();
    expect(host.textContent).toContain("Не удалось загрузить историю операций");
    await click("Повторить историю");
    expect(host.textContent).toContain("Публикация");
    expect(host.textContent).not.toContain("PRIVATE_PG");
  });
  it("M08 cursor next page and deduplication", async () => {
    historyWire.mockImplementation(async (cursor) =>
      cursor ? history([item(), item("t2")]) : history([item()], "next_2"),
    );
    await enter();
    await click("Показать ещё операции");
    expect(historyWire).toHaveBeenCalledWith("next_2");
    expect(host.querySelectorAll(".wallet-history li")).toHaveLength(2);
  });
  it("M09 bad status DTO fails closed", async () => {
    statusWire.mockResolvedValueOnce({ ...status(), wallet: { balance: -500 } });
    await enter();
    expect(host.textContent).toContain("Не удалось получить баланс");
    expect(historyWire).not.toHaveBeenCalled();
  });
  it("M10 bad history DTO fails closed", async () => {
    historyWire.mockResolvedValueOnce(history([item(), item()]));
    await enter();
    expect(host.textContent).toContain("Не удалось загрузить историю");
  });
  it("M11 pending status prevents history", async () => {
    const d = deferred<unknown>();
    statusWire.mockReturnValueOnce(d.promise);
    await enter();
    expect(host.textContent).toContain("Загружаем баланс гафусов");
    expect(historyWire).not.toHaveBeenCalled();
    await act(async () => d.resolve(status()));
    await pause();
    expect(historyWire).toHaveBeenCalledOnce();
  });
  it("M12 late status A-B-A blocked", async () => {
    const d = deferred<unknown>();
    statusWire.mockReturnValueOnce(d.promise);
    await enter();
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "another" }));
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner" }));
    await act(async () => d.resolve(status()));
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(historyWire).not.toHaveBeenCalled();
  });
  it("M13 late history A-B-A blocked", async () => {
    const d = deferred<unknown>();
    historyWire.mockReturnValueOnce(d.promise);
    await enter();
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "another" }));
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner" }));
    await act(async () => d.resolve(history([item()])));
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Публикация");
  });
  it("M14 foreign owner cannot opt in", async () => {
    await mount(true, wire, "someone_else");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(statusWire).not.toHaveBeenCalled();
  });
  it("M15 only normal profile GET (no mutations or paid GET)", async () => {
    await enter();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/user/profile", "/api/v1/feed/status",
      ]);
    expect(fetcher.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("M16 failed second history page retains earned entries and manual retry", async () => {
    let attempts = 0;
    historyWire.mockImplementation(async (cursor) =>
      cursor === null
        ? history([item()], "next_2")
        : ++attempts === 1
          ? Promise.reject({ status: 503 })
          : history([item("t2")], null),
    );
    await enter();
    await click("Показать ещё операции");
    expect(host.querySelectorAll(".wallet-history li")).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    await click("Повторить страницу операций");
    expect(host.querySelectorAll(".wallet-history li")).toHaveLength(2);
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect(attempts).toBe(2);
  });
  it("M17 repeated wallet history cursor cannot append cyclic page", async () => {
    historyWire.mockImplementation(async (cursor) =>
      cursor === null ? history([item()], "next_2") : history([item("t2")], "next_2"),
    );
    await enter();
    await click("Показать ещё операции");
    expect(host.querySelectorAll(".wallet-history li")).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(historyWire).toHaveBeenCalledTimes(2);
  });
});
