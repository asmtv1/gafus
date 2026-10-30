// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {projectPublicAlbums,projectPublicPhotos} from "./galleryApi";

const future="2099-10-25T14:00:00.000Z";
const foreignAlbum=(x:Record<string,unknown>={})=>({
  id:"album_F",ownerId:"B",ownerUsername:"foreign",name:"Открытые прогулки",
  description:"Публичный альбом",isVisible:true,canEdit:false,
  photoCount:1,coverThumbUrl:"https://cdn.example.test/cover.jpg?sig=SECRET",
  urlsExpireAt:future,privateS3Key:"SECRET_INTERNAL_S3",...x,
});
const foreignPhoto=(x:Record<string,unknown>={})=>({
  id:"photo_F",albumId:"album_F",caption:"На прогулке",status:"ready",
  thumbUrl:"https://cdn.example.test/thumb.jpg?sig=SECRET",
  fullUrl:"https://cdn.example.test/full.jpg?sig=SECRET",
  urlsExpireAt:future,width:400,height:600,storageSecret:"PRIVATE_S3_KEY",...x,
});
const page=(items:unknown[],x:Record<string,unknown>={})=>({
  items,nextCursor:null,isOwner:false,enabled:true,usedSlots:0,limit:200,...x,
});
const ok=(data:unknown,code=200)=>new Response(JSON.stringify({
  success:code===200,data,
}),{status:code});
let root:Root,host:HTMLDivElement,cache:QueryClient;
let fetcher:ReturnType<typeof vi.fn>;
let incomingAlbum:Record<string,unknown>,incomingPhoto:Record<string,unknown>;
let albumList:unknown[],photoList:unknown[];
let deepStatus:number;
const tick=async()=>act(async()=>{await new Promise(done=>setTimeout(done,30));});
async function waitForLoadedText(value:string){
  for(let index=0;index<30&&!host.textContent?.includes(value);index++)await tick();
  expect(host.textContent).toContain(value);
}
async function mount(path:string){
  window.history.replaceState(null,"",path);
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <App showGalleryOptIn/>
  </QueryClientProvider>));await tick();
}
const paths=()=>fetcher.mock.calls.map(call=>String(call[0]));
const writes=()=>fetcher.mock.calls.filter(([,init])=>init?.method!=="GET");
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
  incomingAlbum=foreignAlbum();incomingPhoto=foreignPhoto();
  albumList=[incomingAlbum];photoList=[incomingPhoto];deepStatus=200;
  fetcher=vi.fn(async(url:string,opts:RequestInit)=>{
    if(opts?.method!=="GET")throw Error("PUBLIC_VIEW_WRITES_FORBIDDEN");
    if(url==="/api/v1/user/profile")return ok({id:"A",username:"ownerA",profile:{
      fullName:"Owner",city:"Самара",about:"Собаки"}});
    if(url==="/api/v1/gallery/profiles/foreign/albums?pageSize=20")return ok(page(albumList));
    if(url==="/api/v1/gallery/albums/album_F")return ok(incomingAlbum,deepStatus);
    if(url==="/api/v1/gallery/albums/album_F/photos?pageSize=20")return ok(page(photoList));
    throw Error("UNEXPECTED_PUBLIC_ROUTE");
  });
  vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("Next public foreign gallery original Hono ACL projection",()=>{
  it("projects public visible foreign album list and excludes secret/owner controls",async()=>{
    const value=projectPublicAlbums(page([foreignAlbum()]),"A","foreign");
    expect(value.isOwner).toBe(false);
    expect(value.items[0]).toMatchObject({ownerId:"B",isVisible:true,canEdit:false});
    expect(JSON.stringify(value)).not.toMatch(/SECRET_INTERNAL_S3|privateS3Key/);
    await mount("/profile/albums?username=foreign");
    await waitForLoadedText("Открытые прогулки");
    expect(host.textContent).not.toContain("SECRET_INTERNAL_S3");
    expect(host.textContent).not.toContain("Создать альбом");
    expect(host.querySelector("[data-next-gallery]")).toBeNull();
    expect(paths()).toContain("/api/v1/gallery/profiles/foreign/albums?pageSize=20");
    expect(writes()).toHaveLength(0);
  });
  it("opens foreign album only after public GET; server-published ready photos and modal",async()=>{
    await mount("/profile/albums/album_F?username=foreign");
    await waitForLoadedText("На прогулке");
    expect(paths()).toContain("/api/v1/gallery/albums/album_F");
    expect(paths()).toContain("/api/v1/gallery/albums/album_F/photos?pageSize=20");
    expect(host.querySelectorAll(".gallery-public-albums h1")).toHaveLength(1);
    expect(host.querySelector(".gallery-public-albums h1")?.textContent)
      .toBe("Открытые прогулки");
    expect(host.textContent).toContain("Публичный альбом");
    expect(host.textContent).toContain("Все альбомы");
    expect(host.textContent).toContain("Все снимки этого альбома");
    expect(host.textContent).toContain("1 фото");
    expect(host.textContent).not.toContain("PRIVATE_S3_KEY");
    const open=host.querySelector<HTMLButtonElement>('button[aria-label="Открыть фотографию На прогулке"]');
    expect(open).not.toBeNull();
    await act(async()=>open?.click());
    expect(host.querySelector("[role='dialog']")).not.toBeNull();
    const close=[...host.querySelectorAll("button")]
      .find(button=>button.textContent==="Закрыть фотографию");
    await act(async()=>close?.click());
    expect(host.querySelector("[role='dialog']")).toBeNull();
    expect(host.textContent).not.toContain("Удалить фотографию");
    expect(writes()).toHaveLength(0);
  });
  it("PUBLIC-R38 backdrop closes the viewer and restores its trigger",async()=>{
    await mount("/profile/albums/album_F?username=foreign");
    await waitForLoadedText("На прогулке");
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию На прогулке"]');
    await act(async()=>trigger?.click());
    const dialog=host.querySelector<HTMLElement>('[role="dialog"]');
    await act(async()=>dialog?.querySelector("img")?.dispatchEvent(
      new MouseEvent("click",{bubbles:true})));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async()=>dialog?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(writes()).toHaveLength(0);
  });

  it("PUBLIC-R37 horizontal mobile swipe navigates only published ready photos",async()=>{
    photoList=[foreignPhoto(),foreignPhoto({id:"photo_G",caption:"В парке",
      fullUrl:"https://cdn.example.test/park.jpg?sig=OK"})];
    await mount("/profile/albums/album_F?username=foreign");
    await waitForLoadedText("В парке");
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию На прогулке"]');
    await act(async()=>trigger?.click());
    const inner=host.querySelector<HTMLElement>(".gallery-image-viewer-inner")!;
    const touch=(kind:string,x:number,y:number)=>{
      const event=new Event(kind,{bubbles:true,cancelable:true});
      const points=[{clientX:x,clientY:y}];
      Object.defineProperty(event,"touches",{value:kind==="touchstart"?points:[]});
      Object.defineProperty(event,"changedTouches",{value:points});
      inner.dispatchEvent(event);
    };
    await act(async()=>{touch("touchstart",340,200);touch("touchend",45,205);});
    expect(inner.querySelector("img")?.getAttribute("src")).toContain("park.jpg");
    await act(async()=>{touch("touchstart",40,200);touch("touchend",320,200);});
    expect(inner.querySelector("img")?.getAttribute("src")).toContain("full.jpg");
    expect(writes()).toHaveLength(0);
  });

  it("PUBLIC-R36 broken thumbnail does one bounded published photo GET",async()=>{
    await mount("/profile/albums/album_F?username=foreign");
    await waitForLoadedText("На прогулке");
    const target="/api/v1/gallery/albums/album_F/photos?pageSize=20";
    const before=paths().filter(p=>p===target).length;
    const thumb=host.querySelector(".gallery-photo-grid img");
    expect(thumb).not.toBeNull();
    await act(async()=>thumb?.dispatchEvent(new Event("error",{bubbles:true})));
    await tick();
    expect(paths().filter(p=>p===target)).toHaveLength(before+1);
    expect(writes()).toHaveLength(0);
  });

  it("PUBLIC-R34 recovers a broken visible photo only after authenticated Hono GET",async()=>{
    await mount("/profile/albums/album_F?username=foreign");
    await waitForLoadedText("На прогулке");
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию На прогулке"]');
    await act(async()=>trigger?.click());
    const original=fetcher.getMockImplementation() as
      ((url:string,opts:RequestInit)=>Promise<Response>)|undefined;
    expect(original).toBeDefined();
    const refreshed=foreignPhoto({fullUrl:"https://cdn.example.test/refreshed.jpg?sig=OK"});
    fetcher.mockImplementation(async(url:string,opts:RequestInit)=>
      url==="/api/v1/gallery/photos/photo_F"?ok(refreshed):original!(url,opts));
    await act(async()=>host.querySelector('[role="dialog"] img')?.dispatchEvent(
      new Event("error",{bubbles:true})));
    await tick();
    expect(paths()).toContain("/api/v1/gallery/photos/photo_F");
    expect(host.querySelector('[role="dialog"] img')?.getAttribute("src"))
      .toBe(refreshed.fullUrl);
    expect(writes()).toHaveLength(0);
  });
  it("PUBLIC-R34 revocation during recovery hides private image and does not retry POST",async()=>{
    await mount("/profile/albums/album_F?username=foreign");
    await waitForLoadedText("На прогулке");
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию На прогулке"]');
    await act(async()=>trigger?.click());
    const original=fetcher.getMockImplementation() as
      ((url:string,opts:RequestInit)=>Promise<Response>)|undefined;
    fetcher.mockImplementation(async(url:string,opts:RequestInit)=>
      url==="/api/v1/gallery/photos/photo_F"?ok({},404):original!(url,opts));
    await act(async()=>host.querySelector('[role="dialog"] img')?.dispatchEvent(
      new Event("error",{bubbles:true})));
    await tick();
    expect(paths()).toContain("/api/v1/gallery/photos/photo_F");
    expect(host.querySelector('[role="dialog"] img')).toBeNull();
    expect(host.querySelector('[role="dialog"]')?.textContent)
      .toContain("Фото недоступно");
    expect(writes()).toHaveLength(0);
  });
  it("Next public photo viewer traps keyboard focus and restores the original trigger",async()=>{
    await mount("/profile/albums/album_F?username=foreign");
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию На прогулке"]');
    expect(trigger).not.toBeNull();
    await act(async()=>trigger?.click());
    expect(document.activeElement?.textContent).toContain("Закрыть фотографию");
    await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Tab",bubbles:true,cancelable:true,
    })));
    expect(document.activeElement?.textContent).toContain("Закрыть фотографию");
    await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Escape",bubbles:true,cancelable:true,
    })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(writes()).toHaveLength(0);
  });
  it("forged owner canEdit/hidden or mismatched owner is fail-closed",async()=>{
    for(const candidate of [foreignAlbum({canEdit:true}),
      foreignAlbum({isVisible:false}),foreignAlbum({ownerId:"A"})]){
      expect(()=>projectPublicAlbums(page([candidate]),"A","foreign")).toThrow();
    }
    incomingAlbum=foreignAlbum({isVisible:false});
    await mount("/profile/albums/album_F?username=foreign");
    expect(host.textContent).not.toContain("Публичный альбом");
    expect(paths()).not.toContain("/api/v1/gallery/albums/album_F/photos?pageSize=20");
    expect(writes()).toHaveLength(0);
  });
  it("foreign photo projection forbids pending, foreign album ID and owner spoof",()=>{
    const p=projectPublicPhotos(page([foreignPhoto()]),"album_F");
    expect(p.items).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain("PRIVATE_S3_KEY");
    for(const candidate of [foreignPhoto({status:"processing"}),
      foreignPhoto({albumId:"album_OTHER"}),foreignPhoto({status:"failed"})]){
      expect(()=>projectPublicPhotos(page([candidate]),"album_F")).toThrow();
    }
    expect(()=>projectPublicPhotos(page([foreignPhoto()],{isOwner:true}),"album_F"))
      .toThrow();
  });
  it("missing foreign album 404 cannot trigger dependent photo GET",async()=>{
    deepStatus=404;
    await mount("/profile/albums/album_F?username=foreign");
    expect(host.textContent).toContain("Открытые альбомы этого пользователя недоступны");
    expect(host.querySelector(".gallery-public-albums h1")?.textContent)
      .toBe("Альбом недоступен");
    expect(host.textContent).toContain("В профиль");
    expect(host.textContent).not.toContain("Публичный альбом");
    expect(paths()).not.toContain("/api/v1/gallery/albums/album_F/photos?pageSize=20");
    const retry=[...host.querySelectorAll("button")].find(button=>
      button.textContent?.trim()==="Повторить");
    expect(retry).toBeDefined();
    await act(async()=>retry?.click());await tick();
    expect(paths().filter(x=>x==="/api/v1/gallery/albums/album_F")).toHaveLength(2);
    expect(paths()).not.toContain("/api/v1/gallery/albums/album_F/photos?pageSize=20");
    expect(writes()).toHaveLength(0);
  });
  it("owner actor A→B→A fence never materializes old foreign gallery payload",async()=>{
    let finish!:(v:Response)=>void;
    const held=new Promise<Response>(resolve=>{finish=resolve;});
    const old=fetcher.getMockImplementation() as
      ((url:string,opts:RequestInit)=>Promise<Response>)|undefined;
    expect(old).toBeDefined();
    fetcher.mockImplementation(async(url:string,opts:RequestInit)=>{
      if(url==="/api/v1/gallery/profiles/foreign/albums?pageSize=20")return held;
      return old!(url,opts);
    });
    await mount("/profile/albums?username=foreign");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"foreign",role:"USER"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"ownerA",role:"USER"}));
    await act(async()=>finish(ok(page([foreignAlbum({name:"PRIVATE_STALE_FOREIGN"})]))));
    await tick();
    expect(host.textContent).not.toContain("PRIVATE_STALE_FOREIGN");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(writes()).toHaveLength(0);
  });
});
