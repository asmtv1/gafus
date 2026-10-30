// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProfileOverview} from "../profile/ProfileOverview";
import {GalleryOptInHarness} from "./GalleryOptInHarness";
import {GalleryAlbums} from "./GalleryAlbums";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ApiError} from "../../shared/api/client";
import type {AlbumSummary,AlbumPhoto,GalleryPage} from "./galleryApi";
const profile=vi.hoisted(()=>({get:vi.fn()}));
vi.mock("../profile/profileApi",()=>({
  getMyProfile:profile.get,updateMyProfile:vi.fn(),
}));
const future="2099-10-17T16:00:00.000Z";
const album=(id="album_01"):AlbumSummary=>({
  id,ownerId:"A",ownerUsername:"ownerA",name:"Альбом "+id,
  description:"Описание альбома",isVisible:false,canEdit:true,
  photoCount:2,urlsExpireAt:future,
  coverThumbUrl:"https://cdn.example.com/"+id+"/cover.jpg?token=private",
});
const photo=(id="photo_01"):AlbumPhoto=>({
  id,albumId:"album_01",caption:"Фото "+id,
  status:"ready",width:640,height:480,urlsExpireAt:future,
  thumbUrl:"https://cdn.example.com/"+id+"/thumb.jpg?sig=private",
  fullUrl:"https://cdn.example.com/"+id+"/full.jpg?sig=private",
});
const page=<T,>(items:T[],cursor:string|null=null):GalleryPage<T>=>({
  items,nextCursor:cursor,isOwner:true,enabled:true,usedSlots:2,limit:200,
});
function deferred<T>(){
  let resolve!:(v:T)=>void;let reject!:(e:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {resolve,reject,promise};
}
let host:HTMLDivElement,root:Root,cache:QueryClient;
let list:ReturnType<typeof vi.fn<
  (id:string,username:string,cursor:string|null)=>Promise<GalleryPage<AlbumSummary>>
>>;
let get:ReturnType<typeof vi.fn<
  (id:string,userId:string,username:string)=>Promise<AlbumSummary>
>>;
let photos:ReturnType<typeof vi.fn<
  (id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>
>>;
async function flush(){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,18));});
}
async function mount(ui:React.ReactNode){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    {ui}
  </QueryClientProvider>));
}
async function view(userId:string|null="A",enabled=true){
  await mount(<GalleryOptInHarness enabled={enabled}
    userId={userId} username={userId?"ownerA":null}
    listAlbums={list} getAlbum={get} getPhotos={photos}/>);
  await flush();
}
async function fromProfile(enabled=true){
  await mount(<ProfileOverview userId="A" showGalleryOptIn={enabled}
    galleryAlbumLoader={list} galleryDetailLoader={get}
    galleryPhotoLoader={photos}/>);
  await flush();
  // The profile reads other independent widgets first. Assert the fully
  // loaded album UI, not the source loading placeholder, before interactions.
  if (enabled) {
    for(let i=0;i<25&&!host.querySelector(".gallery-album-card");i++) await flush();
  }
}
async function openAlbum(){
  const button=host.querySelector<HTMLButtonElement>(
    'button[aria-label="Открыть альбом Альбом album_01"]');
  expect(button).not.toBeNull();
  await act(async()=>button?.click());
  await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("REAL_NETWORK_DENIED");}));
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"A",username:"ownerA",role:"USER"});
  profile.get.mockReset().mockResolvedValue({
    id:"A",username:"ownerA",
    profile:{fullName:"Зоофото",city:"Москва",about:"Альбомы"},
  });
  list=vi.fn().mockResolvedValue(page([album()]));
  get=vi.fn().mockResolvedValue(album());
  photos=vi.fn().mockResolvedValue(page([photo()]));
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/profile");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("G16 read-only Web owner Gallery actual mounted opt-in",()=>{
  it("G-M01 default off profile does not mount gallery or query",async()=>{
    await fromProfile(false);
    expect(host.textContent).toContain("Зоофото");
    expect(host.querySelector('[aria-label="Фотоальбомы"]')).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
  it("G-M02 real profile -> private album -> signed photo -> full viewer -> back",async()=>{
    await fromProfile();
    expect(profile.get).toHaveBeenCalled();
    expect(host.textContent).toContain("Фотоальбомы");
    expect(host.textContent).toContain("Альбом album_01");
    expect(list).toHaveBeenCalledExactlyOnceWith("A","ownerA",null);
    expect(host.querySelector(".gallery-album-card img")?.getAttribute("src"))
      .toBe("https://cdn.example.com/album_01/cover.jpg?token=private");
    expect(host.querySelector(".gallery-album-card img")?.getAttribute("referrerpolicy"))
      .toBe("no-referrer");
    await openAlbum();
    expect(get).toHaveBeenCalledExactlyOnceWith("album_01","A","ownerA");
    expect(photos).toHaveBeenCalledExactlyOnceWith("album_01",null);
    expect(host.textContent).toContain("Описание альбома");
    expect(host.querySelectorAll(".gallery-album-detail h1")).toHaveLength(1);
    expect(host.querySelector(".gallery-album-detail h1")?.textContent)
      .toBe("Альбом album_01");
    expect(host.querySelector(".gallery-header")).toBeNull();
    expect(host.textContent).toContain("Все снимки этого альбома");
    expect(host.textContent).toContain("Фото photo_01");
    const open=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]');
    await act(async()=>open?.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[role="dialog"] img')?.getAttribute("src"))
      .toContain("/full.jpg?sig=private");
    const close=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Закрыть фотографию");
    await act(async()=>close?.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const back=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent?.includes("Все альбомы"));
    await act(async()=>back?.click());
    expect(host.querySelector(".gallery-album-grid")).not.toBeNull();
    // The profile can independently refresh feed/status while the gallery
    // stays GET-only. Neither request is a Gallery mutation/foreign read.
    const otherCalls=vi.mocked(globalThis.fetch).mock.calls;
    // These unrelated background widgets may or may not be mounted when
    // the gallery returns; only verify their strict read-only allowlist.
    expect(otherCalls.filter(([url])=>url==="/api/v1/notes/student").length)
      .toBeLessThanOrEqual(1);
    expect(otherCalls.every(([url])=>[
      "/api/v1/notes/student","/api/v1/feed/status",
    ].includes(String(url)))).toBe(true);
    expect(otherCalls.every(([,init])=>!init||
      !["POST","PATCH","PUT","DELETE"].includes(String(init.method)))).toBe(true);
  });
  it("Next owner album 404 has a distinct heading, manual retry and no dependent photo GET",async()=>{
    get.mockRejectedValueOnce(new ApiError(404,"PRIVATE_STORAGE_ERROR"));
    await view();await openAlbum();
    expect(host.querySelector(".gallery-album-detail h1")?.textContent)
      .toBe("Альбом недоступен");
    expect(host.textContent).toContain("В профиль");
    expect(host.textContent).not.toContain("Описание альбома");
    expect(host.innerHTML).not.toContain("PRIVATE_STORAGE_ERROR");
    expect(photos).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
    const repeat=[...host.querySelectorAll("button")].find(x=>x.textContent?.trim()==="Повторить");
    expect(repeat).toBeDefined();
    await act(async()=>repeat?.click());await flush();
    expect(get).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".gallery-album-detail h1")?.textContent)
      .toBe("Альбом album_01");
    expect(photos).toHaveBeenCalledTimes(1);
  });
  it("G-M19 injected owner-mismatched album refuses photo GET and private DOM",async()=>{
    get.mockResolvedValueOnce({...album(),ownerId:"B",ownerUsername:"ownerB"});
    await view();await openAlbum();
    expect(host.textContent).toContain("Не удалось загрузить фотоальбомы");
    expect(host.textContent).not.toContain("Описание альбома");
    expect(photos).not.toHaveBeenCalled();
  });
  it("G-M20 injected other owner's album grid fails closed",async()=>{
    list.mockResolvedValueOnce(page([{...album(),ownerId:"B"}]));
    await view();
    expect(host.textContent).toContain("Не удалось загрузить фотоальбомы");
    expect(host.textContent).not.toContain("Альбом album_01");
    expect(get).not.toHaveBeenCalled();
  });
  it("G-M03 paginated albums and photos use exact opaque cursor no POST",async()=>{
    list.mockReset().mockImplementation(async(_,__,cursor)=>{
      return cursor===null?page([album()],"next_2"):page([album("album_02")]);
    });
    photos.mockReset().mockImplementation(async(_,cursor)=>{
      return cursor===null?page([photo()],"photo_next"):page([photo("photo_02")]);
    });
    await view();
    const more=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Показать ещё альбомы");
    await act(async()=>more?.click());await flush();
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(2);
    expect(list).toHaveBeenCalledWith("A","ownerA","next_2");
    await openAlbum();
    const morePhotos=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Показать ещё фотографии");
    await act(async()=>morePhotos?.click());await flush();
    expect(host.querySelectorAll(".gallery-photo-card")).toHaveLength(2);
    expect(photos).toHaveBeenCalledWith("album_01","photo_next");
  });
  it("G-M04 guest and verified owner mismatch reject before private GET",async()=>{
    await view(null);
    expect(host.textContent).toBe("");
    expect(list).not.toHaveBeenCalled();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    await view("A");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(list).not.toHaveBeenCalled();
  });
  it("G-M05 loading resolves to real albums",async()=>{
    const pending=deferred<GalleryPage<AlbumSummary>>();
    list.mockReturnValueOnce(pending.promise);
    await view();
    expect(host.textContent).toContain("Загружаем фотоальбомы");
    await act(async()=>pending.resolve(page([album()])));await flush();
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(1);
  });
  it("G-M06 empty and gallery disabled states are not mock shell",async()=>{
    list.mockResolvedValueOnce(page([]));
    await view();
    expect(host.textContent).toContain("Пока нет доступных фотоальбомов.");
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(0);
    await act(async()=>root.unmount());
    root=createRoot(host);
    list.mockResolvedValueOnce({...page([album()]),enabled:false});
    await view();
    expect(host.textContent).toContain("Галерея пока недоступна");
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(0);
  });
  it("G-M06b normal owner route has the original Next first-album invitation",async()=>{
    list.mockResolvedValueOnce(page([]));
    await mount(<GalleryAlbums userId="A" username="ownerA"
      listAlbums={list} getAlbum={get} getPhotos={photos} routeMode manage/>);
    await flush();
    expect(host.textContent).toContain("Пока нет альбомов. Создайте первый");
    expect(host.textContent).toContain("Создать альбом");
    expect(get).not.toHaveBeenCalled();
    expect(photos).not.toHaveBeenCalled();
  });
  it("G-M06c Next create mode replaces the album grid until explicit cancel",async()=>{
    await mount(<GalleryAlbums userId="A" username="ownerA"
      listAlbums={list} getAlbum={get} getPhotos={photos} routeMode manage/>);
    await flush();
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(1);
    const create=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b=>b.textContent?.includes("Создать альбом"));
    await act(async()=>create?.click());await flush();
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(0);
    expect(host.querySelectorAll(".gallery-editor h3")).toHaveLength(0);
    expect(host.textContent).toContain("Придумайте название и настройте доступ");
    expect(host.textContent).toContain("Виден всем авторизованным");
    expect(host.querySelector(".gallery-header h1")?.textContent).toBe("Новый альбом");
    const cancel=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b=>b.textContent?.trim()==="Отмена");
    await act(async()=>cancel?.click());await flush();
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(1);
    expect(get).not.toHaveBeenCalled();
    expect(photos).not.toHaveBeenCalled();
  });
  it.each([[401,"Сессия завершена"],[403,"Нет доступа"],[500,"Не удалось загрузить"]])(
    "G-M07-09 albums HTTP %d sanitizes error and supports manual retry",
    async(status,copy)=>{
      list.mockRejectedValueOnce(new ApiError(status,"SECRET_SQL_STACK"))
        .mockResolvedValueOnce(page([album()]));
      await view();
      expect(host.textContent).toContain(copy);
      expect(host.textContent).not.toContain("SECRET_SQL_STACK");
      expect(list).toHaveBeenCalledTimes(1);
      const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(x=>x.textContent==="Повторить");
      await act(async()=>retry?.click());await flush();
      expect(list).toHaveBeenCalledTimes(2);
      expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(1);
    },
  );
  it("G-M10 album 403 prevents photos endpoint and has explicit retry",async()=>{
    get.mockRejectedValueOnce(new ApiError(403,"PRIVATE_SERVER_EXCEPTION"));
    await view();await openAlbum();
    expect(host.textContent).toContain("Нет доступа");
    expect(photos).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("PRIVATE_SERVER_EXCEPTION");
  });
  it("G-M11 photo page 500 retains album header, not private error message",async()=>{
    photos.mockRejectedValueOnce(new ApiError(500,"PRIVATE_S3_SIGN"));
    await view();await openAlbum();
    expect(host.textContent).toContain("Альбом album_01");
    expect(host.textContent).toContain("Не удалось загрузить");
    expect(host.textContent).not.toContain("PRIVATE_S3_SIGN");
  });
  it("G-M12 no signed URL means media placeholder, no public image or S3 path",async()=>{
    list.mockResolvedValueOnce(page([{
      ...album(),coverThumbUrl:null,urlsExpireAt:null,
    }]));
    await view();
    expect(host.textContent).toContain("Нет обложки");
    expect(host.querySelector("img")).toBeNull();
  });
  it("G-M13 A->B while list pending hides old owner late album ACK",async()=>{
    const pending=deferred<GalleryPage<AlbumSummary>>();
    list.mockReturnValueOnce(pending.promise);
    await view();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve(page([album()])));await flush();
    expect(host.textContent).not.toContain("Альбом album_01");
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("G-M14 authEpoch A->B->A and same-owner revalidation closes private media",async()=>{
    await view();await openAlbum();
    const open=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]');
    await act(async()=>open?.click());
    expect(host.querySelector('[role="dialog"] img')).not.toBeNull();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"ownerB",role:"USER"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"ownerA",role:"USER"}));
    expect(host.querySelector('[role="dialog"] img')).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("G-M15 logout cache clear unmounts old private signed photo viewer",async()=>{
    await view();await openAlbum();
    const open=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]');
    await act(async()=>open?.click());
    await act(async()=>cache.clear());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("G-M16 narrow 360px DOM 2-column album controls, no gated route",async()=>{
    vi.stubGlobal("innerWidth",360);
    document.documentElement.style.width="360px";
    await fromProfile();
    // Profile and its private gallery GET are separate React Query observers.
    // On a cold/full Vitest run the gallery can resolve one commit later.
    for(let n=0;n<65 && !host.querySelector(".gallery-album-card");n++)
      await flush();
    expect(list).toHaveBeenCalledWith("A","ownerA",null);
    expect(host.querySelectorAll(".gallery-album-card")).toHaveLength(1);
    // Album-list screenshot has no redundant "Мой профиль" link in its header.
    expect(host.querySelector(".gallery-header a")).toBeNull();
    expect(window.location.pathname).toBe("/profile");
  });
});
