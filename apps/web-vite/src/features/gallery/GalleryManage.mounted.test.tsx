// @vitest-environment jsdom
import {act,StrictMode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {ApiError} from "../../shared/api/client";
import {GalleryAlbums} from "./GalleryAlbums";
import {AlbumDelete,AlbumEditor} from "./GalleryManage";
import type {AlbumSummary,AlbumPhoto,GalleryAlbumCommands,GalleryPage} from "./galleryApi";

const owner="owner_A",username="ownerA";
const album:AlbumSummary={id:"album_01",ownerId:owner,ownerUsername:username,
  name:"Первый",description:null,isVisible:true,canEdit:true,photoCount:0,
  coverThumbUrl:null,urlsExpireAt:null};
const page=<T,>(items:T[]):GalleryPage<T>=>({items,nextCursor:null,
  enabled:true,isOwner:true,usedSlots:0,limit:200});
const emptyPhoto=page<AlbumPhoto>([]);
let root:Root,host:HTMLDivElement,cache:QueryClient;
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,20));});};
function click(label:string){
 const node=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(b=>b.textContent?.trim()===label);
 expect(node,label).toBeDefined();
 return act(async()=>{node?.click();});
}
function input(name:string,value:string){
 const control=[...host.querySelectorAll<HTMLInputElement>("input")]
  .find(e=>e.closest("label")?.textContent?.includes(name));
 expect(control,name).toBeDefined();
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
 act(()=>{setter.call(control,value);control?.dispatchEvent(new Event("input",{bubbles:true}));});
}
const writes=():GalleryAlbumCommands=>({
 create:vi.fn(),update:vi.fn(),remove:vi.fn(),updateCaption:vi.fn(),
 removePhoto:vi.fn(),setCover:vi.fn(),movePhoto:vi.fn(),
});
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal("fetch",vi.fn(()=>{throw Error("LIVE_NETWORK_FORBIDDEN");}));
 host=document.createElement("div");document.body.append(host);
 root=createRoot(host);cache=new QueryClient({defaultOptions:{queries:{
  retry:false,refetchOnWindowFocus:false}}});
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 cache.clear();host.remove();vi.unstubAllGlobals();
});
async function mount(node:React.ReactNode){
 await act(async()=>root.render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>));
 await flush();
}
describe("GALLERY owner real list→create/update→server readback",()=>{
 it("disabled real owner gallery denies create UI and never sends write",async()=>{
  const commands=writes();
  await mount(<GalleryAlbums userId={owner} username={username} manage
    listAlbums={async()=>({...page<AlbumSummary>([]),enabled:false})}
    getAlbum={async()=>album} getPhotos={async()=>emptyPhoto} commands={commands}/>);
  expect(host.textContent).toContain("Галерея пока недоступна");
  expect(host.textContent).not.toContain("Создать альбом");
  expect(commands.create).not.toHaveBeenCalled();
 });
 it("real Vite StrictMode lifecycle preserves exactly one authenticated album create",async()=>{
  const commands=writes();
  const saved={...album,name:"Строгий"};
  vi.mocked(commands.create).mockResolvedValue(saved);
  const read=vi.fn(async()=>saved),onSaved=vi.fn();
  await mount(<StrictMode><AlbumEditor actorId={owner} username={username}
    commands={commands} getAlbum={read} onSaved={onSaved}
    onCancel={()=>undefined}/></StrictMode>);
  input("Название","Строгий");
  await click("Сохранить альбом"); await flush();
  expect(commands.create).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith("album_01");
 });
 it("creates one album after exactly one ACK/GET and refreshes the parent list",async()=>{
  const commands=writes(),created={...album,name:"Новый"};
  let list:AlbumSummary[]=[];
  let complete!:(value:AlbumSummary)=>void;
  vi.mocked(commands.create).mockImplementation(()=>new Promise(r=>{complete=r;}));
  const read=vi.fn().mockImplementation(async()=>created);
  const listAlbums=vi.fn(async()=>page(list));
  await mount(<GalleryAlbums userId={owner} username={username} manage
    listAlbums={listAlbums} getAlbum={read} getPhotos={async()=>emptyPhoto}
    commands={commands}/>);
  // The Next-matched primary action includes a visible leading plus.
  await click("＋ Создать альбом");
  input("Название","Новый");
  await click("Сохранить альбом");
  expect(commands.create).toHaveBeenCalledTimes(1);
  const sending=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(node=>node.textContent?.includes("Сохраняем"));
  expect(sending?.disabled).toBe(true);
  expect(commands.create).toHaveBeenCalledTimes(1);
  list=[created];
  await act(async()=>complete(created));
  await flush();
  expect(read).toHaveBeenCalledWith("album_01",owner,username);
  expect(host.textContent).toContain("Новый");
  expect(listAlbums.mock.calls.length).toBeGreaterThan(1);
 });
 it("rejects 400 without blind retry and allows one corrected manual submit",async()=>{
  const commands=writes(),saved={...album,name:"Исправлено"};
  vi.mocked(commands.create).mockRejectedValueOnce(new ApiError(400,"invalid","VALIDATION"))
    .mockResolvedValue(saved);
  const read=vi.fn(async()=>saved);
  await mount(<AlbumEditor actorId={owner} username={username}
    commands={commands} getAlbum={read} onCancel={()=>undefined}
    onSaved={()=>undefined}/>);
  input("Название","Не подходит");
  await click("Сохранить альбом");await flush();
  expect(commands.create).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Операция отклонена");
  input("Название","Исправлено");
  await click("Сохранить альбом");await flush();
  expect(commands.create).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenCalledTimes(1);
 });
 it("unknown album-create ACK locks POST and owner GET finds only a possible match",async()=>{
  const commands=writes();
  vi.mocked(commands.create).mockRejectedValue(new Error("NETWORK_LOST"));
  const onSaved=vi.fn(),candidate={...album,name:"Новый"};
  const listAlbums=vi.fn(async()=>page([candidate]));
  await mount(<AlbumEditor actorId={owner} username={username}
    commands={commands} listAlbums={listAlbums}
    onSaved={onSaved} onCancel={()=>undefined}/>);
  input("Название","Новый");
  await click("Сохранить альбом");await flush();
  expect(commands.create).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Результат неизвестен");
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  await click("Сохранить альбом");await flush();
  expect(commands.create).toHaveBeenCalledTimes(1);
  await click("Проверить мои альбомы без повторной записи");await flush();
  expect(listAlbums).toHaveBeenCalledWith(owner,username,null);
  expect(host.textContent).toContain("Найден похожий альбом");
  expect(host.textContent).toContain("Открыть найденный похожий альбом");
  expect(onSaved).not.toHaveBeenCalled(); // Similar contents are not proof of this POST.
  expect(commands.create).toHaveBeenCalledTimes(1);
 });
 it("unknown create with no owner match blocks re-post after a manual read",async()=>{
  const commands=writes();
  vi.mocked(commands.create).mockRejectedValue(new Error("ACK_LOST_AFTER_COMMIT"));
  const listAlbums=vi.fn(async()=>page([])),onSaved=vi.fn();
  await mount(<AlbumEditor actorId={owner} username={username}
    commands={commands} listAlbums={listAlbums}
    onSaved={onSaved} onCancel={()=>undefined}/>);
  input("Название","Неясно");
  await click("Сохранить альбом");await flush();
  await click("Проверить мои альбомы без повторной записи");await flush();
  expect(host.textContent).toContain("Совпадений пока нет");
  expect(host.textContent).toContain("Результат записи неизвестен");
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();
  expect(commands.create).toHaveBeenCalledTimes(1);
 });
 it("uncertain create paginates owner results and never accepts ambiguous duplicate matches",async()=>{
  const commands=writes();
  vi.mocked(commands.create).mockRejectedValue(new Error("NETWORK_LOST"));
  const listAlbums=vi.fn(async (_id:string,_name:string,cursor:string|null)=>
    cursor===null?{...page([{...album,id:"album_old",name:"Новый"}]),nextCursor:"cursor1"}:
      page([{...album,id:"album_new",name:"Новый"}]));
  const onSaved=vi.fn();
  await mount(<AlbumEditor actorId={owner} username={username}
    commands={commands} listAlbums={listAlbums}
    onSaved={onSaved} onCancel={()=>undefined}/>);
  input("Название","Новый");
  await click("Сохранить альбом");await flush();
  await click("Проверить мои альбомы без повторной записи");await flush();
  expect(listAlbums.mock.calls.map(call=>call[2])).toEqual([null,"cursor1"]);
  expect(host.textContent).toContain("Найдены несколько похожих альбомов");
  expect(host.textContent).not.toContain("Открыть найденный похожий альбом");
  expect(onSaved).not.toHaveBeenCalled();
  expect(commands.create).toHaveBeenCalledTimes(1);
 });
 it("two-stage delete verifies 404 before navigating, no blind second DELETE",async()=>{
  const commands=writes(),deleted=vi.fn();
  vi.mocked(commands.remove).mockResolvedValue({id:album.id});
  const getAlbum=vi.fn().mockRejectedValue(new ApiError(404,"missing","NOT_FOUND"));
  await mount(<AlbumDelete album={album} commands={commands}
    getAlbum={getAlbum} onDeleted={deleted}/>);
  await click("Удалить альбом");
  expect(commands.remove).not.toHaveBeenCalled();
  await click("Да, удалить альбом");
  expect(commands.remove).toHaveBeenCalledTimes(1);
  expect(getAlbum).toHaveBeenCalledWith(album.id,owner,username);
  expect(deleted).toHaveBeenCalledTimes(1);
 });
});
