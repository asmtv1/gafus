// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {galleryAlbumPath,routeForPath} from "../../shared/router/location";
import type {AlbumSummary,AlbumPhoto,GalleryPage} from "./galleryApi";
const future="2099-10-17T16:00:00.000Z";
const album=(id="album_01"):AlbumSummary=>({
 id,ownerId:"A",ownerUsername:"ownerA",name:"Альбом "+id,
 description:"Описание альбома",isVisible:false,canEdit:true,photoCount:1,
 coverThumbUrl:null,urlsExpireAt:null,
});
const photo=(id="photo_01"):AlbumPhoto=>({
 id,albumId:"album_01",caption:"Фото "+id,status:"ready",
 width:640,height:480,urlsExpireAt:future,
 thumbUrl:"https://cdn.example.test/thumb.jpg?sig=PRIVATE_URL",
 fullUrl:"https://cdn.example.test/full.jpg?sig=PRIVATE_URL",
});
const page=<T,>(items:T[],nextCursor:string|null=null):GalleryPage<T>=>({
 items,nextCursor,isOwner:true,enabled:true,usedSlots:2,limit:200,
});
const wait=<T,>()=>{let resolve!:(data:T)=>void;
 const promise=new Promise<T>(finish=>{resolve=finish;});
 return {promise,resolve};
};
let node:HTMLDivElement,root:Root,cache:QueryClient;
let fetcher:ReturnType<typeof vi.fn>;
let list:ReturnType<typeof vi.fn<
 (id:string,user:string,cursor:string|null)=>Promise<GalleryPage<AlbumSummary>>>>;
let detail:ReturnType<typeof vi.fn<
 (id:string,owner:string,user:string)=>Promise<AlbumSummary>>>;
let photos:ReturnType<typeof vi.fn<
 (id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>>>;
beforeAll(async()=>{await import("../../brand/PublicLanding");});
const tick=async()=>act(async()=>{await new Promise(done=>setTimeout(done,23));});
async function waitForText(value:string){
 for(let attempt=0;attempt<80&&!node.textContent?.includes(value);attempt++)await tick();
 expect(node.textContent).toContain(value);
}
const path=()=>window.location.pathname+window.location.search;
async function mount(start="/profile",enable=true){
 window.history.replaceState(null,"",start);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showGalleryOptIn={enable}
    galleryAlbumLoader={list} galleryDetailLoader={detail}
    galleryPhotoLoader={photos}/>
 </QueryClientProvider>));await tick();
}
async function link(label:string){
 const a=[...node.querySelectorAll<HTMLAnchorElement>("a")]
  .find(x=>x.textContent?.trim()===label);
 expect(a,label).toBeDefined();
 await act(async()=>a?.dispatchEvent(new MouseEvent("click",{
  bubbles:true,cancelable:true,button:0,
 })));await tick();
}
async function linkHref(href:string){
 const a=node.querySelector<HTMLAnchorElement>('a[href="'+href+'"]');
 expect(a,href).not.toBeNull();
 await act(async()=>a?.dispatchEvent(new MouseEvent("click",{
  bubbles:true,cancelable:true,button:0,
 })));await tick();
}
async function button(label:string){
 const b=[...node.querySelectorAll<HTMLButtonElement>("button")]
  .find(x=>x.textContent?.trim()===label);
 expect(b,label).toBeDefined();
 await act(async()=>b?.click());await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{
  retry:false,refetchOnWindowFocus:false,
 }}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
 list=vi.fn(async()=>page([album()]));
 detail=vi.fn(async()=>album());
 photos=vi.fn(async()=>page([photo()]));
 fetcher=vi.fn(async(url:string,options:RequestInit)=>{
  if(options?.method!=="GET")throw Error("WRITES_FORBIDDEN");
  if(url==="/api/v1/user/profile")return new Response(JSON.stringify({
   success:true,data:{id:"A",username:"ownerA",profile:{
    fullName:"Владелец A",city:"Самара",about:"Питомцы и альбомы",
   },token:"SECRET_PROFILE",email:"SECRET_EMAIL"},
  }),{status:200});
  if(url==="/api/v1/pets")return new Response(JSON.stringify({
   success:true,data:[{id:"pet_01",name:"Рекс",type:"DOG",
    breed:"Лабрадор",showInProfile:false,notes:"SECRET_VET_MEDICAL"}],
  }),{status:200});
  if(url==="/api/v1/pets/pet_01")return new Response(JSON.stringify({
   success:true,data:{id:"pet_01",name:"Рекс",type:"DOG",
    breed:"Лабрадор",showInProfile:false,
    birthDate:null,weightKg:null,heightCm:null,
    notes:"Личная заметка ветеринара"},
  }),{status:200});
  throw Error("UNAPPROVED_FETCH "+url);
 });
 vi.stubGlobal("fetch",fetcher);
 node=document.createElement("div");document.body.append(node);root=createRoot(node);
 window.history.replaceState(null,"","/profile");
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();node.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});
describe("AG2 WEB-URL-030/032/033 actual App profile -> pets -> gallery",()=>{
 it("F01 existing protected gallery owner GET routes work without old opt-in flag",async()=>{
  await mount("/profile/albums",false);
  expect(node.textContent).toContain("Фотоальбомы");
  await waitForText("Альбом album_01");
  expect(list).toHaveBeenCalledWith("A", "ownerA", null);
  await mount("/profile/albums/album_01",false);
  expect(node.textContent).toContain("Описание альбома");
  expect(detail).toHaveBeenCalledWith("album_01", "A", "ownerA");
 });
 it("F02 source-finished flow profile -> pets -> gallery list -> album -> back",async()=>{
  await mount();
  expect(node.querySelector('[aria-label="Мой профиль"]')).not.toBeNull();
  await link("Питомцы");await tick();
  expect(path()).toBe("/pets");
  await waitForText("Рекс");
  await link("Фотоальбомы");
  expect(path()).toBe("/profile/albums");
  expect(list).toHaveBeenCalledWith("A","ownerA",null);
  await linkHref("/profile/albums/album_01");
  expect(path()).toBe("/profile/albums/album_01");
  expect(detail).toHaveBeenCalledExactlyOnceWith("album_01","A","ownerA");
  expect(photos).toHaveBeenCalledExactlyOnceWith("album_01",null);
  expect(node.textContent).toContain("Описание альбома");
  await button("Все альбомы");
  expect(path()).toBe("/profile/albums");
  expect(node.textContent).toContain("Альбом album_01");
  expect(node.querySelector('a[href="/profile"]')?.textContent).not.toBe("Мой профиль");
  await link("Профиль");
  expect(path()).toBe("/profile");
  expect(node.querySelector('[aria-label="Мой профиль"]')).not.toBeNull();
 });
 it("F03 direct album deep link loads detail without an initial list GET",async()=>{
  await mount("/profile/albums/album_01");
  await waitForText("Описание альбома");
  expect(list).not.toHaveBeenCalled();
  expect(detail).toHaveBeenCalledWith("album_01","A","ownerA");
  expect(photos).toHaveBeenCalledWith("album_01",null);
 });
 it("F04 back/forward browser history controls route, not component-only selected",async()=>{
  await mount("/profile");
  await link("Фотоальбомы");
  await linkHref("/profile/albums/album_01");
  expect(path()).toBe("/profile/albums/album_01");
  await act(async()=>{
   window.history.back();
   await new Promise(done=>setTimeout(done,50));
  });await tick();
  expect(path()).toBe("/profile/albums");
  expect(node.querySelector(".gallery-album-grid")).not.toBeNull();
  await act(async()=>{
   window.history.forward();
   await new Promise(done=>setTimeout(done,50));
  });await tick();
  expect(path()).toBe("/profile/albums/album_01");
  expect(node.textContent).toContain("Описание альбома");
 });
 it("F05 /pets detail -> gallery back remains owner-only",async()=>{
  await mount("/pets");await tick();
  await waitForText("Рекс");
  await linkHref("/pets/pet_01");
  expect(path()).toBe("/pets/pet_01");
  await waitForText("Личная заметка ветеринара");
  await link("Фотоальбомы");
  expect(path()).toBe("/profile/albums");
  expect(node.textContent).not.toContain("Личная заметка ветеринара");
 });
 it("F06 legacy ?username=ownerA accepted, never forwarded to loader",async()=>{
  await mount("/profile/albums?username=ownerA&cursor=SECRET_URL_CURSOR");
  await waitForText("Альбом album_01");
  expect(list).toHaveBeenCalledExactlyOnceWith("A","ownerA",null);
  expect(node.innerHTML).not.toContain("SECRET_URL_CURSOR");
 });
 it("F07 foreign public username uses only original Hono public GET; duplicate username fails closed",async()=>{
  await mount("/profile/albums?username=foreign");
  expect(node.textContent).toContain("Фотоальбомы @foreign");
  expect(list).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.map(call=>String(call[0])))
    .toContain("/api/v1/gallery/profiles/foreign/albums?pageSize=20");
  const foreignGets=()=>fetcher.mock.calls.filter(call=>
    call[0]==="/api/v1/gallery/profiles/foreign/albums?pageSize=20");
  expect(foreignGets()).toHaveLength(1);
  await mount("/profile/albums?username=ownerA&username=foreign");
  expect(node.textContent).toContain("Некорректный адрес фотоальбомов");
  expect(foreignGets()).toHaveLength(1);
  expect(list).not.toHaveBeenCalled();
 });
 it("F08 invalid direct album ID route is not found",async()=>{
  expect(routeForPath("/profile/albums/../../x")).toBeNull();
  expect(routeForPath("/profile/albums/%2F")).toBeNull();
  expect(routeForPath("/profile/albums/album_01/more")).toBeNull();
  expect(galleryAlbumPath("album_01")).toBe("/profile/albums/album_01");
  expect(()=>galleryAlbumPath("../other")).toThrow();
  await mount("/profile/albums/%2F");
  expect(node.textContent).toContain("Страница не найдена");
  expect(detail).not.toHaveBeenCalled();
 });
 it("F09 missing/deleted album does not fetch photos",async()=>{
  detail.mockRejectedValueOnce({status:404});
  await mount("/profile/albums/album_01");
  expect(node.textContent).toContain("Не удалось загрузить фотоальбомы");
  expect(photos).not.toHaveBeenCalled();
 });
 it("F10 A->B->A while album detail pending has no ghost photo or data",async()=>{
  const held=wait<AlbumSummary>();detail.mockReturnValueOnce(held.promise);
  await mount("/profile/albums/album_01");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"B",username:"ownerB",role:"USER",
  }));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"A",username:"ownerA",role:"USER",
  }));
  await act(async()=>held.resolve(album()));await tick();
  expect(node.textContent).not.toContain("Описание альбома");
  expect(photos).not.toHaveBeenCalled();
 });
 it("F11 A->B->A while pets pending hides list and private medical fields",async()=>{
  let release!:(value:Response)=>void;
  const pending=new Promise<Response>(done=>{release=done;});
  fetcher.mockImplementationOnce(async(url:string,options:RequestInit)=>{
   if(url==="/api/v1/pets"&&options?.method==="GET")return pending;
   throw Error("WRONG_ORDER");
  });
  await mount("/pets");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"B",username:"ownerB",role:"USER",
  }));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"A",username:"ownerA",role:"USER",
  }));
  await act(async()=>release(new Response(JSON.stringify({success:true,data:[
   {id:"pet_01",name:"Рекс",type:"DOG",showInProfile:false},
  ]}),{status:200})));await tick();
  expect(node.textContent).not.toContain("Рекс");
  expect(node.textContent).toContain("Сессия изменилась");
 });
 it("F12 no private gallery DTO in shared QueryClient cache",async()=>{
  await mount("/profile/albums/album_01");
  expect(JSON.stringify(cache.getQueryData(["gallery","album","A","ownerA","album_01"])))
   .toBeUndefined();
  expect(JSON.stringify(cache.getQueryData(["gallery","photos","A","ownerA","album_01"])))
   .toBeUndefined();
  expect(node.innerHTML).not.toContain("SECRET_PROFILE");
  expect(node.innerHTML).not.toContain("SECRET_VET_MEDICAL");
  expect(fetcher.mock.calls.every(([,o])=>o.method==="GET")).toBe(true);
 });
 it("F13 direct album and link not permitted to guests",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
  await mount("/profile/albums/album_01");
  // Unauthenticated deep links resolve to the public landing; do not
  // show the private gallery or a false session-change warning to a guest.
  expect(window.location.pathname).toBe("/");
  expect(node.querySelector('[data-ui-parity="legacy-landing"]')).not.toBeNull();
  expect(node.textContent).not.toContain("Описание альбома");
  expect(detail).not.toHaveBeenCalled();
 });
 it("F14 missing injected gallery loader denies private data with bounded GET error",async()=>{
  window.history.replaceState(null,"","/profile/albums");
  await act(async()=>root.render(<QueryClientProvider client={cache}>
   <App showGalleryOptIn/>
  </QueryClientProvider>));await tick();
  expect(node.textContent).toContain("Не удалось загрузить фотоальбомы");
  expect(node.textContent).not.toContain("Альбом album_01");
  expect(node.innerHTML).not.toContain("SECRET_PROFILE");
  expect(list).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(([, request])=>request?.method!=="POST")).toBe(true);
 });
});
