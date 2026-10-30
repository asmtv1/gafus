// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {MomentsCatalog} from "./MomentsCatalog";
import type {DetailWire} from "./postDetailReadApi";
const author={id:"PRIVATE_USER",username:"trainer",name:"Кинолог",
  role:"TRAINER",avatarUrl:"SECRET_SIGNED_URL"};
const post=(postId="p1")=>({
  id:postId,status:"published",text:"Учимся ждать",author,
  attachments:[],reactions:[],myReaction:null,
  createdAt:"2026-10-18T12:00:00Z",publishedAt:"2026-10-18T12:00:00Z",
  viewCount:1,commentCount:2,hasPoll:false,canEdit:false,
  recommendationExposureToken:"PRIVATE_RANK",
});
const comment=(id="c1",postId="p1")=>({
  id,postId,text:"Полезный совет",createdAt:"2026-10-18T12:00:00Z",
  author,rootId:null,replyToId:null,replyToName:null,deleted:false,
  replyCount:0,reactions:[],myReaction:null,canEdit:false,canDelete:false,
  token:"SECRET_COMMENT",
});
const page=(items:unknown[]=[],nextCursor:string|null=null)=>({
  items,nextCursor,serverNow:"2026-10-18T12:00:00Z",
  metadata:"PRIVATE_PAGE",
});
const delayed=<T,>()=>{let resolve!:(v:T)=>void;
  const promise=new Promise<T>(ok=>resolve=ok);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,wire:DetailWire;
let postWire:ReturnType<typeof vi.fn<DetailWire["post"]>>;
let commentsWire:ReturnType<typeof vi.fn<DetailWire["comments"]>>;
let focusWire:ReturnType<typeof vi.fn<DetailWire["focused"]>>;
let fetcher:ReturnType<typeof vi.fn>;
const settle=async()=>act(async()=>{await new Promise(done=>setTimeout(done,25));});
const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
async function mount(enabled=true,transport:DetailWire|null=wire,userId="owner"){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <MomentsCatalog userId={userId} showPostDetailOptIn={enabled}
      postDetailSyntheticTransport={transport??undefined}/>
  </QueryClientProvider>));await settle();
}
async function click(text:string){
  const target=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b=>b.textContent?.trim()===text);
  expect(target,text).toBeDefined();
  await act(async()=>target?.click());await settle();
}
async function enter(){await mount();await click("Просмотреть публикацию (макет)");}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,"","/moments");
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,
    refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner",username:"owner"});
  postWire=vi.fn(async()=>post());
  commentsWire=vi.fn(async()=>page([comment()]));
  focusWire=vi.fn(async()=>comment("c_focus"));
  wire={fixtureKind:"AG2_POST_DETAIL_SYNTHETIC_GET_ONLY",
    post:postWire,comments:commentsWire,focused:focusWire};
  fetcher=vi.fn(async(url:string,init:RequestInit)=>{
    if(init.method!=="GET")throw Error("WRITE_FORBIDDEN");
    if(url==="/api/v1/feed/status")return envelope({enabled:true,smartEnabled:false});
    if(url==="/api/v1/feed/posts?pageSize=20&sort=new")
      return envelope(page([post()]));
    throw Error("UNAPPROVED_API:"+url);
  });
  vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("WEB-URL-019 existing catalog -> exact first post detail read-only opt-in",()=>{
  it("M01 default off, existing catalogue still shows post",async()=>{
    await mount(false);
    expect(host.textContent).toContain("Учимся ждать");
    expect(host.textContent).not.toContain("Просмотреть публикацию (макет)");
    expect(postWire).not.toHaveBeenCalled();
  });
  it("M02 wrong/missing fixture => no extra entry",async()=>{
    await mount(true,null);
    expect(postWire).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Просмотреть публикацию (макет)");
  });
  it("M03 explicit selected post loads once, comments, back; no leaks",async()=>{
    await enter();
    expect(postWire).toHaveBeenCalledExactlyOnceWith("p1");
    expect(commentsWire).toHaveBeenCalledExactlyOnceWith("p1",null);
    expect(host.querySelector('[aria-label="Публикация и комментарии (макет)"]'))
      .not.toBeNull();
    expect(host.textContent).toContain("Полезный совет");
    expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|avatarUrl|token/);
    await click("К «Моментам»");
    expect(host.querySelector('[aria-label="Публикация и комментарии (макет)"]'))
      .toBeNull();
    expect(host.textContent).toContain("Просмотреть публикацию (макет)");
  });
  it("M04 empty comments",async()=>{
    commentsWire.mockResolvedValueOnce(page());await enter();
    expect(host.textContent).toContain("Комментариев пока нет");
  });
  it("M05 status/catalog error keeps detail entry hidden",async()=>{
    fetcher.mockImplementation(async(url:string)=>{
      if(url.endsWith("/status"))return envelope({enabled:false});
      return envelope(page([post()]));
    });await mount();
    expect(postWire).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Просмотреть публикацию (макет)");
  });
  it("M06 detail 404/error does not show synthetic comment",async()=>{
    postWire.mockRejectedValueOnce(Error("PRIVATE_HTTP_404"));
    await enter();expect(host.textContent).toContain("Публикация недоступна");
    expect(host.textContent).not.toContain("PRIVATE_HTTP_404");
    expect(commentsWire).not.toHaveBeenCalled();
    await click("Повторить публикацию");
    expect(host.textContent).toContain("Полезный совет");
  });
  it("M07 comments error and retry",async()=>{
    commentsWire.mockRejectedValueOnce(Error("PRIVATE_PG"));
    await enter();
    expect(host.textContent).toContain("Не удалось загрузить комментарии");
    expect(host.textContent).not.toContain("PRIVATE_PG");
    await click("Повторить комментарии");
    expect(host.textContent).toContain("Полезный совет");
  });
  it("M08 page cursor, deduplicate prior comment id",async()=>{
    commentsWire.mockImplementation(async(_postId,cursor)=>
      cursor?page([comment(),comment("c2")]):page([comment()],"next2"));
    await enter();await click("Ещё комментарии");
    expect(commentsWire).toHaveBeenCalledWith("p1","next2");
    expect(host.querySelectorAll(".post-detail-comments li")).toHaveLength(2);
  });
  it("M09 focused deep-link commentId fetched independent of pagination",async()=>{
    window.history.replaceState(null,"","/moments?commentId=c_focus");
    await enter();
    expect(focusWire).toHaveBeenCalledExactlyOnceWith("c_focus");
    expect(host.textContent).toContain("Комментарий из ссылки: Полезный совет");
  });
  it("M10 cross-post focused comment never displayed",async()=>{
    window.history.replaceState(null,"","/moments?commentId=c_focus");
    focusWire.mockResolvedValueOnce(comment("c_focus","other"));
    await enter();
    expect(host.textContent).toContain("относится к другой публикации");
    expect(host.textContent).not.toContain("Комментарий из ссылки: Полезный совет");
  });
  it("M11 duplicate commentId blocked without separate read",async()=>{
    window.history.replaceState(null,"","/moments?commentId=c1&commentId=c2");
    await enter();expect(focusWire).not.toHaveBeenCalled();
  });
  it("M12 A-B-A late post must not leak",async()=>{
    const d=delayed<unknown>();postWire.mockReturnValueOnce(d.promise);
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner"}));
    await act(async()=>d.resolve(post()));await settle();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(commentsWire).not.toHaveBeenCalled();
  });
  it("M13 A-B-A late comments must not appear",async()=>{
    const d=delayed<unknown>();commentsWire.mockReturnValueOnce(d.promise);
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner"}));
    await act(async()=>d.resolve(page([comment()])));await settle();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("M14 another owner can't open",async()=>{
    await mount(true,wire,"different_owner");
    expect(postWire).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("M15 synthetic detail performs zero real detail GET or mutation",async()=>{
    await enter();expect(fetcher.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/feed/status",
      "/api/v1/feed/me/pending-posts?pageSize=20",
      "/api/v1/feed/posts?pageSize=20&sort=new"]);
    expect(fetcher.mock.calls.every(([,init])=>init.method==="GET")).toBe(true);
  });
});
