// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {GalleryUpload} from "./GalleryManage";

const path="/api/v1/gallery/albums/album_A/uploads";
const uploadPath="https://isolated-synthetic.example.invalid/photo";
const id="upload_A";
const reservation={uploadId:id,albumId:"album_A",status:"reserved",
  postUrl:uploadPath,postFields:{policy:"synthetic"},
  reservationExpiresAt:new Date(Date.now()+3600000).toISOString()};
const reply=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
let root:Root,host:HTMLDivElement,fetcher:ReturnType<typeof vi.fn>;
let refresh:ReturnType<typeof vi.fn<() => void>>;
let reserveFails=false,storageFails=false,processing=false;
const tick=async()=>{await act(async()=>new Promise(r=>setTimeout(r,25)));};
async function choosePhoto(){
  const bytes=new Uint8Array([255,216,255,0,0,0,0,0]);
  const file=new File([bytes],"photo.jpg",{type:"image/jpeg"});
  Object.defineProperty(file,"slice",{value:()=>({arrayBuffer:async()=>bytes.buffer})});
  const field=host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(field,"files",{configurable:true,value:[file]});
  await act(async()=>field.dispatchEvent(new Event("change",{bubbles:true})));
}
async function click(label:string){
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")].find(x=>x.textContent?.trim()===label);
  expect(button,label).toBeDefined();
  await act(async()=>button?.click());await tick();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  reserveFails=false;storageFails=false;processing=false;
  refresh=vi.fn<() => void>();
  fetcher=vi.fn(async(url:string)=>{
    if(url===path){if(reserveFails)throw Error("RESERVE_ACK_LOST");return reply(reservation);}
    if(url===uploadPath){if(storageFails)throw Error("STORAGE_ACK_LOST");return new Response(null,{status:204});}
    if(url===`/api/v1/gallery/uploads/${id}`)return reply({
      ...reservation,status:processing?"processing":"reserved",
    });
    if(url===`/api/v1/gallery/uploads/${id}/complete`)return reply({...reservation,status:"processing"});
    throw Error("UNEXPECTED_HTTP:"+url);
  });
  vi.stubGlobal("fetch",fetcher);
  vi.stubGlobal("crypto",{randomUUID:()=>"09d8a97b-8567-4876-8e4b-c48031ea3387"});
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});
async function mount(){await act(async()=>root.render(
  <GalleryUpload albumId="album_A" onRefresh={refresh}/>));}
describe("connected gallery upload avoids duplicate non-idempotent external POST",()=>{
  it("lost S3 ACK locks second reserve/upload and manual owner status GET can confirm processing",async()=>{
    storageFails=true;processing=true;
    await mount();await choosePhoto();await click("Загрузить фото");
    expect(host.textContent).toContain("Статус отправки файла неизвестен");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(fetcher.mock.calls.filter(([url])=>url===path)).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url])=>url===uploadPath)).toHaveLength(1);
    await click("Загрузить фото");
    expect(fetcher.mock.calls.filter(([url])=>url===path)).toHaveLength(1);
    await click("Проверить состояние загрузки");
    expect(fetcher.mock.calls.filter(([url])=>url===`/api/v1/gallery/uploads/${id}`))
      .toHaveLength(1);
    expect(host.textContent).not.toContain("Статус отправки файла неизвестен");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(([url])=>url===uploadPath)).toHaveLength(1);
  });
  it("lost reservation ACK with no uploadId never starts S3 or second reserve",async()=>{
    reserveFails=true;
    await mount();await choosePhoto();await click("Загрузить фото");
    expect(host.textContent).toContain("Идентификатор загрузки не получен");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await click("Загрузить фото");
    expect(fetcher.mock.calls.filter(([url])=>url===path)).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url])=>url===uploadPath)).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("confirmed upload+owner status GET allows a fresh file without leaking S3 credentials",async()=>{
    processing=true;
    await mount();await choosePhoto();await click("Загрузить фото");
    expect(host.textContent).toContain("Загрузка подтверждена");
    expect(host.textContent).not.toContain("Статус отправки файла неизвестен");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(([url])=>url===path)).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url])=>url===uploadPath)).toHaveLength(1);
    expect(host.innerHTML).not.toContain("synthetic");
  });
});
