// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {useRoutePath} from "../../shared/router/location";
import {MomentDetails} from "./MomentDetails";
import {MomentsProfile} from "./MomentsProfile";
import {MomentsNotificationsOptIn} from "./MomentsNotificationsOptIn";
import {projectNotificationPage,type NotificationReadWire} from "./notificationsReadApi";

const author={id:"SECRET_AUTHOR_ID",username:"trainer",name:"Кинолог",
  role:"TRAINER",avatarUrl:"PRIVATE_AVATAR_URL",email:"PRIVATE_MAIL"};
const p=(id="p1",username="trainer")=>({
  id,status:"published",text:id==="p1"?"Учимся ждать":"Другая публикация",
  author:{...author,username},attachments:[],reactions:[],myReaction:null,
  commentCount:1,viewCount:3,createdAt:"2026-10-18T12:00:00Z",
  publishedAt:"2026-10-18T12:00:00Z",canEdit:false,
  recommendationExposureToken:"SECRET_RANK",
});
const page=(posts:unknown[]=[],cursor:string|null=null)=>({
  items:posts,nextCursor:cursor,serverNow:"2026-10-18T12:00:00Z",
  privateMeta:"SECRET_PAGE_META"});
const notif=()=>({id:"notice1",kind:"author_post",postId:"p1",readAt:null,
  createdAt:"2026-10-18T12:00:00Z",targetAvailable:true,actorCount:1,
  actors:[author],secret:"PRIVATE_NOTIFICATION_SECRET"});
const send=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status===200,data,error:"PRIVATE_TRACE",
}),{status});
const deferred=<T,>()=>{let resolve!:(v:T)=>void;
  const promise=new Promise<T>(ok=>resolve=ok);return {promise,resolve};};

let node:HTMLDivElement,root:Root,client:QueryClient;
let responder:ReturnType<typeof vi.fn<(url:string)=>Promise<Response>>>;
let notify:NotificationReadWire;
async function settle(){await act(async()=>{await new Promise(ok=>setTimeout(ok,30));});}
function RouteHarness(){
  const route=useRoutePath();
  if(route==="/moments/p1")return <MomentDetails userId="viewer" postId="p1"/>;
  if(route==="/moments/profile/trainer")return <MomentsProfile userId="viewer" username="trainer"/>;
  if(route==="/moments")return <section>
    <MomentsNotificationsOptIn enabled ownerId="viewer" transport={notify}/>
  </section>;
  return <p role="alert">Неизвестный тестовый адрес.</p>;
}
async function render(initial="/moments/p1"){
  window.history.replaceState(null,"",initial);
  await act(async()=>root.render(<QueryClientProvider client={client}>
    <RouteHarness/>
  </QueryClientProvider>));
  await settle();
}
async function click(text:string){
  const el=[...node.querySelectorAll<HTMLElement>("a,button")]
    .find(item=>item.textContent?.trim()===text);
  expect(el,text).toBeDefined();
  await act(async()=>el?.click());await settle();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  node=document.createElement("div");document.body.append(node);root=createRoot(node);
  client=new QueryClient({defaultOptions:{queries:{retry:false,
    refetchOnWindowFocus:false}}});
  client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"viewer",username:"viewer"});
  notify={fixtureKind:"AG2_FEED_NOTIFICATIONS_SYNTHETIC_GET_ONLY" as const,
    status:async()=>({enabled:true}),
    list:async()=>page([notif()]),
  };
  responder=vi.fn(async(url:string)=>{
    if(url==="/api/v1/feed/status")return send({enabled:true,smartEnabled:false});
    if(url==="/api/v1/feed/posts/p1")return send(p());
    if(url.startsWith("/api/v1/feed/posts/p1/comments"))return send(page([]));
    if(url.startsWith("/api/v1/feed/profiles/trainer/posts"))
      return send(page([p()]));
    throw Error("UNAPPROVED_ENDPOINT");
  });
  vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>
    init.method==="GET"?responder(url):Promise.reject(Error("NO_WRITE"))));
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  client.clear();node.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("WEB-URL-024 author profile from post/notifications and user visibility",()=>{
  it("A01 post author link navigates existing detail -> existing profile",async()=>{
    await render();
    expect(node.querySelector('a[href="/moments/profile/trainer"]')).not.toBeNull();
    await click("@trainer");
    expect(window.location.pathname).toBe("/moments/profile/trainer");
    expect(node.textContent).toContain("Публикации @trainer");
    expect(node.textContent).toContain("Учимся ждать");
    expect(node.innerHTML).not.toMatch(/SECRET_|PRIVATE_|avatarUrl|email/);
    expect(responder.mock.calls.map(([url])=>url)).toContain(
      "/api/v1/feed/profiles/trainer/posts?pageSize=20");
  });
  it("A02 notification actor link navigates existing read UI -> public author",async()=>{
    await render("/moments");
    await click("История уведомлений (макет)");
    const link=node.querySelector('a[href="/moments/profile/trainer"]');
    expect(link?.textContent).toContain("Кинолог");
    await click("Кинолог");
    expect(window.location.pathname).toBe("/moments/profile/trainer");
    expect(node.textContent).toContain("Публикации @trainer");
    expect(node.innerHTML).not.toContain("PRIVATE_AVATAR_URL");
  });
  it("A03 decoder only public actor username and label, not hidden fields",()=>{
    const data=projectNotificationPage(page([notif()]));
    expect(data.items[0].actorProfiles).toEqual([{name:"Кинолог",username:"trainer"}]);
    expect(JSON.stringify(data)).not.toMatch(/SECRET_|PRIVATE_|avatarUrl|email/);
  });
  it("A04 pagination dedups, public role only, server-owned cursor",async()=>{
    responder.mockImplementation(async(url:string)=>{
      if(url.endsWith("status"))return send({enabled:true});
      if(url.includes("profiles/trainer/posts"))return url.includes("cursor=next1")?
        send(page([p(),p("p2")])):send(page([p()],"next1"));
      throw Error("Unexpected GET");
    });
    await render("/moments/profile/trainer");
    expect(node.querySelectorAll("ul.compact-grid > li")).toHaveLength(1);
    await click("Ещё публикации");
    expect(node.querySelectorAll("ul.compact-grid > li")).toHaveLength(2);
    expect(node.textContent).toContain("Другая публикация");
    const calls=responder.mock.calls.map(([url])=>url);
    expect(calls).toContain("/api/v1/feed/profiles/trainer/posts?cursor=next1&pageSize=20");
    expect(node.innerHTML).not.toMatch(/SECRET_|PRIVATE_|avatarUrl/);
  });
  it("A05 server 403 blocked/unavailable never rendered fake empty",async()=>{
    responder.mockImplementation(async url=>url.endsWith("status")?
      send({enabled:true}):send(null,403));
    await render("/moments/profile/trainer");
    expect(node.textContent).toContain("Публикации пользователя недоступны");
    expect(node.textContent).not.toContain("Нет доступных публикаций");
  });
  it("A06 server 404 deleted/unavailable never rendered fake empty",async()=>{
    responder.mockImplementation(async url=>url.endsWith("status")?
      send({enabled:true}):send(null,404));
    await render("/moments/profile/trainer");
    expect(node.textContent).toContain("Публикации автора недоступны");
  });
  it("A07 empty 200 never asserts whether author is deleted/blocked",async()=>{
    responder.mockImplementation(async url=>url.endsWith("status")?
      send({enabled:true}):send(page([])));
    await render("/moments/profile/trainer");
    expect(node.textContent).toContain("Нет доступных публикаций этого автора");
    const empty = node.querySelector<HTMLElement>('[data-profile-moments-empty][role="status"]');
    expect(empty).not.toBeNull();
    expect(empty?.querySelector("h3")?.textContent).toBe("Публикаций пока нет");
    expect(empty?.querySelector('svg[aria-hidden="true"]')).toBeNull();
    expect(empty?.querySelector('span[aria-hidden="true"] svg')).not.toBeNull();
    expect(node.textContent).not.toContain("Профиль может быть удалён");
  });
  it("A08 foreign author's post rejected fail-closed",async()=>{
    responder.mockImplementation(async url=>url.endsWith("status")?
      send({enabled:true}):send(page([p("p1","another")])));
    await render("/moments/profile/trainer");
    expect(node.textContent).toContain("Публикации пользователя недоступны");
    expect(node.textContent).not.toContain("Другая публикация");
  });
  it("A09 rollout disabled no public posts GET",async()=>{
    responder.mockImplementation(async()=>send({enabled:false}));
    await render("/moments/profile/trainer");
    expect(node.textContent).toContain("Моменты сейчас недоступны");
    expect(responder.mock.calls).toHaveLength(1);
  });
  it("A10 session A->B->A during pending profile list never shows late content",async()=>{
    const d=deferred<Response>();
    responder.mockImplementation(async url=>url.endsWith("status")?
      send({enabled:true}):d.promise);
    await render("/moments/profile/trainer");
    expect(node.textContent).toContain("Загружаем публикации");
    await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"other"}));
    await act(async()=>client.setQueryData(CURRENT_USER_QUERY_KEY,{id:"viewer"}));
    await act(async()=>d.resolve(send(page([p()]))));await settle();
    expect(node.textContent).toContain("Сессия изменилась");
    expect(node.textContent).not.toContain("Учимся ждать");
    expect(client.getQueryData(["moments","profile","viewer","trainer"]))
      .toBeUndefined();
  });
  it("A11 no mutation/Stream/payment HTTP during route navigation",async()=>{
    await render();await click("@trainer");
    const fetcher=vi.mocked(fetch);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fetcher.mock.calls.every(([url,init])=>
      String(url).startsWith("/api/v1/feed/")&&init?.method==="GET")).toBe(true);
  });
});
