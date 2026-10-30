// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyQuestionsPanel } from "./MyQuestionsPanel";
const question = {
  id: "question1", title: "Как приучить собаку", body: "Приучаем спокойно идти рядом",
  category: "Поведение", status: "waiting", answerCount: 2, viewCount: 7,
  closed: false, tags: [], bestAnswer: null,
  createdAt: "2026-10-01T11:00:00.000Z", author: { name: "Автор" },
};
const response = (data: unknown, code = 200) => new Response(JSON.stringify({
  success: code === 200, data,
}), { status: code });
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");document.body.appendChild(host);
  const root = createRoot(host);
  const cache = new QueryClient({defaultOptions: {queries: {retry: false}}});
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <MyQuestionsPanel ownerId="author1"/>
  </QueryClientProvider>));
  await act(async () => new Promise(resolve => setTimeout(resolve, 15)));
  return {host, cache, cleanup: async () => {
    await act(async () => root.unmount());cache.clear();host.remove();
  }};
}
afterEach(() => vi.unstubAllGlobals());
describe("profile Next MyQuestionsList user boundary", () => {
  it("uses shared 168px Web loading mascot until the authenticated Hono owner GET settles", async () => {
    const pending = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const ui = await mount(pending);
    try {
      const state = ui.host.querySelector('[role="status"][aria-live="polite"]');
      expect(state?.textContent).toContain("Загружаем ваши вопросы…");
      const poster=state?.querySelector<HTMLImageElement>(
        'img[src="/images/loading-mascot-router-poster.webp"]');
      const animated=state?.querySelector<HTMLImageElement>(
        'img[src="/images/loading-mascot-router.webp"]');
      expect(poster?.width).toBe(168);
      expect(animated?.height).toBe(168);
      expect(state?.getAttribute("data-gafus-loader")).toBe("inline");
      expect(ui.host.querySelector('a[href="/questions/new"]')).toBeNull();
      expect(pending).toHaveBeenCalledTimes(1);
    } finally {await ui.cleanup();}
  });
  it("uses mine=true Hono read and source profile layout, not public filters", async () => {
    const fetcher=vi.fn().mockResolvedValue(response({
      items:[question],nextPage:null,canPublish:true,blockReason:null,
    }));
    const ui=await mount(fetcher);
    try {
      expect(ui.host.querySelector("[data-next-my-questions]")).not.toBeNull();
      expect(ui.host.textContent).toContain("Как приучить собаку");
      const primaryLink=ui.host.querySelector<HTMLAnchorElement>('a[href="/questions/new"]');
      expect(primaryLink).not.toBeNull();
      expect(primaryLink?.classList.contains("gafus-primary-button")).toBe(true);
      expect(primaryLink?.className).toContain("root");
      expect(primaryLink?.className).toContain("askButton");
      expect(ui.host.querySelector("#question-search")).toBeNull();
      expect(fetcher.mock.calls.map(call=>call[0])).toEqual([
        "/api/v1/questions?page=1&sort=new&mine=true",
      ]);
    }finally {await ui.cleanup();}
  });
  it("shows original Next closed badge, tags, actual view count, and the best-answer preview",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response({
      items:[{...question,status:"resolved",closed:true,tags:["прогулки","дрессировка"],
        viewCount:17,bestAnswer:{id:"owner-best",body:"Занимайтесь регулярно"}}],
      nextPage:null,canPublish:false,blockReason:null,
    }));
    const ui=await mount(fetcher);
    try {
      expect(ui.host.textContent).toContain("Решён");
      expect(ui.host.textContent).toContain("Обсуждение закрыто");
      expect(ui.host.textContent).toContain("#прогулки");
      expect(ui.host.textContent).toContain("#дрессировка");
      expect(ui.host.textContent).toContain("Лучший ответ");
      expect(ui.host.textContent).toContain("Занимайтесь регулярно");
      expect(ui.host.textContent).toContain("17");
      const preview=ui.host.querySelector('a[href="/questions/question1"]');
      expect(preview?.querySelector('[class*="bestPreview"]')).not.toBeNull();
      expect(preview?.querySelectorAll('svg[aria-hidden="true"]').length).toBe(3);
      expect(ui.host.querySelector('a[href="/questions/new"]')).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }finally{await ui.cleanup();}
  });
  it("renders the approved author avatar and matches compact Next profile question card",async()=>{
    const url="https://gafus.ru/uploads/users/author-avatar.webp";
    const fetcher=vi.fn().mockResolvedValue(response({
      items:[{...question,author:{name:"Автор",avatarUrl:url}}],
      nextPage:null,canPublish:true,blockReason:null,
    }));
    const ui=await mount(fetcher);
    try {
      const card=ui.host.querySelector<HTMLAnchorElement>('a[href="/questions/question1"]');
      expect(card?.classList.contains("next-question-preview")).toBe(true);
      expect(card?.querySelector("h2")?.textContent).toBe("Как приучить собаку");
      const avatar=card?.querySelector<HTMLImageElement>('img[src="'+url+'"]');
      expect(avatar?.getAttribute("alt")).toBe("");
      expect(avatar?.className).toContain("avatar");
      // Browser network failure must fall back to the author's initial.
      await act(async()=>avatar?.dispatchEvent(new Event("error")));
      expect(card?.querySelector('img[src="'+url+'"]')).toBeNull();
      expect(card?.querySelector('[class*="avatar"]')?.textContent).toBe("А");
    }finally {await ui.cleanup();}
  });
  it("uses the author initial when no avatar was provided",async()=>{
    const ui=await mount(vi.fn().mockResolvedValue(response({
      items:[question],nextPage:null,canPublish:false,blockReason:null,
    })));
    try {
      const card=ui.host.querySelector('a[href="/questions/question1"]');
      expect(card?.querySelector('[class*="avatar"]')?.textContent).toBe("А");
      expect(card?.querySelector('[class*="avatar"] img')).toBeNull();
    }finally {await ui.cleanup();}
  });
  it("never renders raw author IDs, private avatar URLs or moderation data from the list",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response({
      items:[{...question,author:{id:"PRIVATE_AUTHOR_ID",name:"Автор",
        avatarUrl:"https://private.example.invalid/signed-avatar?SECRET_PRIVATE_KEY=1"},
        tags:[],bestAnswer:null,hiddenAt:"PRIVATE_MODERATION_VALUE"}],
      nextPage:null,canPublish:false,blockReason:null,
    }));
    const ui=await mount(fetcher);
    try{
      expect(ui.host.textContent).toContain("Как приучить собаку");
      expect(ui.host.innerHTML).not.toContain("PRIVATE_AUTHOR_ID");
      expect(ui.host.innerHTML).not.toContain("SECRET_PRIVATE_KEY");
      expect(ui.host.innerHTML).not.toContain("PRIVATE_MODERATION_VALUE");
      expect(ui.host.querySelector('img[src*="signed-avatar"]')).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }finally{await ui.cleanup();}
  });
  it("rejects malformed privileged list preview rather than rendering injected fields",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response({
      items:[{...question,tags:["ok"],viewCount:0,
        bestAnswer:{id:"owner-best",body:"x".repeat(300)}}],
      nextPage:null,canPublish:true,blockReason:null,
    }));
    const ui=await mount(fetcher);
    try{
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить вопросы");
      expect(ui.host.textContent).not.toContain("x".repeat(300));
      expect(ui.host.querySelector('a[href="/questions/new"]')).toBeNull();
    }finally{await ui.cleanup();}
  });
  it("retains already loaded owner cards on in-flight background refresh, as original Next",async()=>{
    let finish!: (value:Response)=>void;
    const fetcher=vi.fn()
      .mockResolvedValueOnce(response({items:[question],nextPage:null,
        canPublish:true,blockReason:null}))
      .mockImplementationOnce(()=>new Promise<Response>(ok=>{finish=ok;}));
    const ui=await mount(fetcher);
    try{
      expect(ui.host.textContent).toContain(question.title);
      const refreshing=ui.cache.invalidateQueries({
        queryKey:["questions","owner","author1","profile","mine"],
      });
      await act(async()=>new Promise(resolve=>setTimeout(resolve,15)));
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(ui.host.textContent).toContain(question.title);
      expect(ui.host.querySelector('a[href="/questions/new"]')).not.toBeNull();
      expect(ui.host.querySelector('[role="status"]')).toBeNull();
      await act(async()=>finish(response({items:[{...question,viewCount:12}],
        nextPage:null,canPublish:true,blockReason:null})));
      await act(async()=>refreshing);
      await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
      expect(ui.host.textContent).toContain(question.title);
      expect(ui.host.textContent).toContain("12");
    }finally{await ui.cleanup();}
  });
  it("keeps original Next cards and error banner after transient 503 during refresh",async()=>{
    const fetcher=vi.fn()
      .mockResolvedValueOnce(response({items:[question],nextPage:null,
        canPublish:true,blockReason:null}))
      .mockResolvedValueOnce(response(null,503));
    const ui=await mount(fetcher);
    try{
      await act(async()=>ui.cache.invalidateQueries({
        queryKey:["questions","owner","author1","profile","mine"],
      }));
      await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(ui.host.textContent).toContain(question.title);
      expect(ui.host.querySelector('a[href="/questions/new"]')).not.toBeNull();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить вопросы");
      expect(ui.host.querySelector('[role="status"]')).toBeNull();
    }finally{await ui.cleanup();}
  });
  it("clears cached owner cards after refresh loses authorization",async()=>{
    const fetcher=vi.fn()
      .mockResolvedValueOnce(response({items:[question],nextPage:null,
        canPublish:true,blockReason:null}))
      .mockResolvedValueOnce(response(null,403));
    const ui=await mount(fetcher);
    try{
      expect(ui.host.textContent).toContain(question.title);
      await act(async()=>ui.cache.invalidateQueries({
        queryKey:["questions","owner","author1","profile","mine"],
      }));
      expect(fetcher).toHaveBeenCalledTimes(2);
      await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
      expect(ui.host.textContent).not.toContain(question.title);
      expect(ui.host.querySelector('a[href="/questions/new"]')).toBeNull();
      expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
    }finally{await ui.cleanup();}
  });
  it("permission denied hides all cached cards/create links", async () => {
    const ui=await mount(vi.fn().mockResolvedValue(response(null,403)));
    try {
      expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
      expect(ui.host.textContent).not.toContain(question.body);
      expect(ui.host.querySelector('a[href="/questions/new"]')).toBeNull();
    }finally {await ui.cleanup();}
  });
});
