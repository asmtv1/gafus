// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletConnectedPanel } from "./WalletConnectedPanel";

const wallet = {
  serverNow: "2026-10-18T12:00:00.000Z", wallet: { balance: 8 },
  activity: { earned: 2, limit: 3, windowSeconds: 86400, remaining: 1,
    nextCapacityAt: null },
  rules: { postReward: 1, questionReward: 1, answerReward: 1,
    reactionThreshold: 10, reactionReward: 1, bestAnswerReward: 1,
    courseStepCost: 1, miniGuideCost: 1, accessDurationSeconds: 604800 },
  enabled: { economy: true, earning: true, spending: true }, settingsRevision: 7,
  secretEmail: "PRIVATE_EMAIL_NOT_RENDER",
};
const response = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data,
}), { status });
afterEach(() => vi.unstubAllGlobals());
async function mount(fetcher: ReturnType<typeof vi.fn>, isCurrent: () => boolean = () => true) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <WalletConnectedPanel ownerId="actor1" isCurrent={isCurrent}/>
  </QueryClientProvider>));
  for(let i = 0; i < 12 && !host.textContent?.includes("История операций"); i++) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  }
  return {host, cleanup: async () => {
    await act(async () => root.unmount()); cache.clear(); host.remove();
  }};
}
describe("original Next GafusWalletPage with Hono owner GET", () => {
  it("shows the current balance and no server secrets, never POST", async () => {
    const fetcher = vi.fn((path: string, _opts: RequestInit) => Promise.resolve(response(
      path.includes("/history") ? { items: [], nextCursor: null } : wallet,
    )));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.querySelector("[data-next-wallet]")).not.toBeNull();
      // The original Next wallet header does not contain a bonus "?" icon.
      // Its approved extra rules remain discoverable below the wallet card.
      expect(ui.host.querySelector("[data-next-wallet] details")).toBeNull();
      const rules=ui.host.querySelector("details.web1-wallet-reward-rules");
      expect(rules).not.toBeNull();
      expect(rules?.previousElementSibling?.hasAttribute("data-next-wallet")).toBe(true);
      expect(ui.host.querySelector('[aria-label="Баланс: 8 Гафусов"]')).not.toBeNull();
      expect(ui.host.textContent).toContain("Пока нет операций");
      expect(ui.host.textContent).not.toContain("PRIVATE_EMAIL_NOT_RENDER");
      expect(fetcher.mock.calls.map(call => call[0])).toEqual([
        "/api/v1/gafus/status", "/api/v1/gafus/history?limit=20",
      ]);
      expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
    } finally { await ui.cleanup(); }
  });
  it("failed status never releases history or private wallet", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(null, 403));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.querySelector("[data-next-wallet]")).toBeNull();
      expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
      expect(fetcher.mock.calls).toHaveLength(1);
    } finally { await ui.cleanup(); }
  });
  it("does not expose partially loaded balance before genuine history GET finishes", async () => {
    let resolveHistory!: (value: Response) => void;
    const fetcher = vi.fn((path: string) => path.includes("/history")
      ? new Promise<Response>(resolve => { resolveHistory = resolve; })
      : Promise.resolve(response(wallet)));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Загружаем Гафусы");
      expect(ui.host.querySelector("[data-next-wallet]")).toBeNull();
      expect(ui.host.querySelector('img[src="/images/loading-mascot-router-poster.webp"]'))
        .not.toBeNull();
      expect(ui.host.querySelector('img[src="/images/loading-mascot-router.webp"]'))
        .not.toBeNull();
      expect(fetcher.mock.calls.map(call => call[0])).toEqual([
        "/api/v1/gafus/status", "/api/v1/gafus/history?limit=20",
      ]);
      await act(async () => resolveHistory(response({ items: [], nextCursor: null })));
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
      expect(ui.host.querySelector("[data-next-wallet]")).not.toBeNull();
      expect(ui.host.textContent).toContain("История операций");
      expect(ui.host.querySelector('details summary[aria-label="Как начисляются Гафусы"]'))
        .not.toBeNull();
    } finally { await ui.cleanup(); }
  });
  it("history rejection never exposes balance separately from the source wallet", async () => {
    const fetcher = vi.fn((path: string, _opts: RequestInit) => Promise.resolve(path.includes("/history")
      ? response(null, 503) : response(wallet)));
    const ui = await mount(fetcher);
    try {
      expect(ui.host.querySelector("[data-next-wallet]")).toBeNull();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить историю операций");
      expect(ui.host.querySelector("button")?.textContent).toContain("Повторить");
      expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
    } finally { await ui.cleanup(); }
  });
  it("retains already loaded source history on a transient page-2 error, then retries GET", async () => {
    const firstItem={id:"receipt_one",kind:"EARN",rewardKind:"POST_PUBLISHED",
      delta:1,balanceAfter:8,createdAt:"2026-10-18T12:00:00.000Z"};
    const secondItem={...firstItem,id:"receipt_two",kind:"SPEND",rewardKind:null,delta:-1};
    let attempts=0;
    const fetcher=vi.fn((path:string,_opts:RequestInit)=>Promise.resolve(
      !path.includes("/history")?response(wallet):
        !path.includes("cursor=next_page")?response({items:[firstItem],nextCursor:"next_page"}):
          ++attempts===1?response(null,503):response({items:[secondItem],nextCursor:null}),
    ));
    const ui=await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Публикация");
      const more=()=>[...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button=>button.textContent?.trim()==="Показать ещё");
      expect(more()).toBeDefined();
      await act(async()=>more()?.click());
      await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
      expect(ui.host.querySelector("[data-next-wallet]")).not.toBeNull();
      expect(ui.host.textContent).toContain("Публикация");
      expect(ui.host.querySelector('[aria-label="Баланс: 8 Гафусов"]')).not.toBeNull();
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain(
        "Не удалось загрузить следующую страницу истории");
      expect(more()).toBeDefined();
      await act(async()=>more()?.click());
      await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
      expect(ui.host.querySelector('[role="alert"]')).toBeNull();
      expect(ui.host.textContent).toContain("Открытие обучения");
      expect(ui.host.textContent).toContain("Публикация");
      expect(attempts).toBe(2);
      expect(fetcher.mock.calls.every(([,options]:[string,RequestInit])=>
        options.method==="GET")).toBe(true);
    } finally { await ui.cleanup(); }
  });
  it("hides private balance/history if pagination responds with revoked 401", async () => {
    const item={id:"receipt_one",kind:"EARN",rewardKind:"POST_PUBLISHED",
      delta:1,balanceAfter:8,createdAt:"2026-10-18T12:00:00.000Z"};
    const fetcher=vi.fn((path:string)=>Promise.resolve(!path.includes("/history")?
      response(wallet):!path.includes("cursor=next_page")?
        response({items:[item],nextCursor:"next_page"}):response(null,401)));
    const ui=await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Публикация");
      const button=[...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(el=>el.textContent?.trim()==="Показать ещё");
      await act(async()=>button?.click());
      await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
      expect(ui.host.querySelector("[data-next-wallet]")).toBeNull();
      expect(ui.host.textContent).not.toContain("Публикация");
      expect(ui.host.querySelector('[aria-label="Баланс: 8 Гафусов"]')).toBeNull();
      expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
    } finally { await ui.cleanup(); }
  });
  it("keeps exact Next source fallback title for EARN with no rewardKind", async () => {
    const at="2026-10-18T12:00:00.000Z";
    const items=[
      {id:"receipt_general",kind:"EARN",rewardKind:null,delta:1,balanceAfter:8,createdAt:at},
      {id:"receipt_post",kind:"EARN",rewardKind:"POST_PUBLISHED",
        delta:1,balanceAfter:7,createdAt:at},
    ];
    const fetcher=vi.fn((path:string)=>Promise.resolve(path.includes("/history")?
      response({items,nextCursor:null}):response(wallet)));
    const ui=await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Операция");
      expect(ui.host.textContent).toContain("Публикация");
      expect(ui.host.textContent).not.toContain("Начисление");
      expect(ui.host.querySelector('[data-next-wallet] section[class*="summary"]'))
        .not.toBeNull();
      expect(fetcher.mock.calls).toHaveLength(2);
    } finally { await ui.cleanup(); }
  });
  it("invalid owner stops every request", async () => {
    const fetcher = vi.fn();
    const ui = await mount(fetcher, () => false);
    try { expect(ui.host.textContent).not.toContain("История операций");
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });
});
