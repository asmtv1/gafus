// @vitest-environment jsdom
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async(_file:File)=>({
    thumb:{file:new File([new Uint8Array(128)],"thumb.webp",{type:"image/webp"}),width:480,height:360},
    full:{file:new File([new Uint8Array(256)],"full.webp",{type:"image/webp"}),width:1920,height:1440},
  })),
}));
vi.mock("../../shared/media/browserPhotoUpload",()=>({
  uploadBrowserPhotoWebp:vi.fn(async()=>undefined),
}));
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {GalleryUploadQueue} from "./GalleryUploadQueue";
import type {AlbumPhoto} from "./galleryApi";

const ids=Array.from({length:10},(_,i)=>`${String(i+1).repeat(8)}-${String(i+1).repeat(4)}-4${String(i+1).repeat(3)}-8${String(i+1).repeat(3)}-${String(i+1).repeat(12)}`);
const photo=(name:string,valid=true)=>{
  const data=new Uint8Array(valid?[255,216,255,0,0,0]:[2,3,4,5,6,7]);
  const file=new File([data],name,{type:"image/jpeg"});
  Object.defineProperty(file,"slice",{value:()=>({arrayBuffer:async()=>data.buffer})});
  return file;
};
const reply=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
let host:HTMLDivElement,root:Root;
let fetcher:ReturnType<typeof vi.fn>;
let refreshed:ReturnType<typeof vi.fn<() => void>>;
let firstUploadLost=false,firstStatus="reserved",nextUuid=0;
let cancellationLost=false;
let cancelledIds:Set<string>;
let storageUrls:string[];
let holdStorage=false;
let completeStorage:(()=>void)|null=null;
let pendingStorage:(()=>void)[]=[];
let reserveAckLost=false;
let retryAckLost=false;
let retryAttempts:string[];
const retryChild="33333333-3333-4333-8333-333333333333";
const uploadUrl=(id:string)=>`https://nonprod-gallery.example.invalid/${id}`;
const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,60));});
const button=(name:string)=>[...host.querySelectorAll("button")].find(
  e=>e.textContent?.trim()===name) as HTMLButtonElement;
async function choose(...files:File[]){
  const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input,"files",{configurable:true,value:files});
  await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
}
async function click(name:string){
  expect(button(name),`Expected button ${name}`).toBeDefined();
  await act(async()=>button(name).click());await flush();
}
beforeEach(async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  firstUploadLost=false;firstStatus="processing";nextUuid=0;
  cancellationLost=false;cancelledIds=new Set();
  storageUrls=[];holdStorage=false;completeStorage=null;pendingStorage=[];
  reserveAckLost=false;retryAckLost=false;retryAttempts=[];
  refreshed=vi.fn<() => void>();
  fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
    const reserve=/^\/api\/v1\/gallery\/uploads\/client-reserve$/;
    if(reserve.test(url)){
      const attempt=fetcher.mock.calls.filter(([key])=>reserve.test(key)).length;
      if(reserveAckLost&&attempt===1)throw Error("RESERVE_ACK_LOST");
      const id=reserveAckLost?ids[0]:ids[attempt-1];
      return reply({uploadId:id,albumId:"album_A",status:"reserved",
        postUrl:uploadUrl(id),postFields:{policy:"nonprod"},
        thumbUpload:{method:"POST",url:uploadUrl(id),fields:{policy:"thumb"}},
        reservationExpiresAt:new Date(Date.now()+3600000).toISOString()});
    }
    if(url===`/api/v1/gallery/uploads/${ids[0]}/retry`){
      const body=JSON.parse(String(options?.body)) as {clientRequestId:string};
      retryAttempts.push(body.clientRequestId);
      if(retryAckLost&&retryAttempts.length===1)throw Error("RETRY_ACK_LOST");
      return reply({uploadId:retryChild,albumId:"album_A",status:"reserved",
        postUrl:uploadUrl(retryChild),postFields:{policy:"nonprod"},
        thumbUpload:{method:"POST",url:uploadUrl(retryChild),fields:{policy:"thumb"}},
        reservationExpiresAt:new Date(Date.now()+3600000).toISOString()});
    }
    if(url.endsWith("/client-thumb"))return reply({method:"POST",url:uploadUrl(retryChild),fields:{policy:"thumb"}});
    const match=url.match(/^\/api\/v1\/gallery\/uploads\/([^/]+)(\/client-complete)?$/);
    if(match){
      const id=match[1];
      if(options?.method==="DELETE"){
        cancelledIds.add(id);
        if(cancellationLost)throw Error("DELETE_ACK_LOST");
      }
      return reply({uploadId:id,albumId:"album_A",
        status:cancelledIds.has(id)?"cancelled":
          match[2]?"processing":id===ids[0]?firstStatus:"processing"});
    }
    throw Error("UNEXPECTED_URL:"+url);
  });
  class FakeStorageXHR{
    status=204;timeout=0;withCredentials=false;
    upload={onprogress:null as ((event:ProgressEvent)=>void)|null};
    onload:(()=>void)|null=null;
    onerror:(()=>void)|null=null;
    ontimeout:(()=>void)|null=null;
    onabort:(()=>void)|null=null;
    private target="";
    open(method:string,url:string){expect(method).toBe("POST");this.target=url;}
    send(body:FormData){
      expect(body).toBeInstanceOf(FormData);
      storageUrls.push(this.target);
      const complete=()=>{
        if(firstUploadLost&&this.target===uploadUrl(ids[0]))this.onerror?.();
        else this.onload?.();
      };
      this.upload.onprogress?.({lengthComputable:true,loaded:6,total:10} as ProgressEvent);
      if(holdStorage){completeStorage=complete;pendingStorage.push(complete);}
      else queueMicrotask(complete);
    }
    abort(){this.onabort?.();}
  }
  vi.stubGlobal("XMLHttpRequest",FakeStorageXHR);
  vi.stubGlobal("fetch",fetcher);
  vi.stubGlobal("crypto",{randomUUID:()=>ids[nextUuid++]});
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<GalleryUploadQueue albumId="album_A" usedSlots={0} onRefresh={refreshed}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
describe("owner gallery multiple-photo queue",()=>{
  it("uploads two selected files with separate reservations and persisted-status GET",async()=>{
    await choose(photo("first.jpg"),photo("second.jpg"));
    expect(host.textContent).toContain("first.jpg");
    expect(host.textContent).toContain("second.jpg");
    await click("Загрузить фотографии");
    const urls=fetcher.mock.calls.map(([url])=>url);
    expect(urls.filter(url=>url==="/api/v1/gallery/uploads/client-reserve")).toHaveLength(2);
    expect(storageUrls).toEqual([uploadUrl(ids[0]),uploadUrl(ids[1])]);
    expect(urls.filter(url=>url.endsWith("/client-complete"))).toHaveLength(2);
    expect(urls.filter(url=>/^\/api\/v1\/gallery\/uploads\/[^/]+$/.test(url)&&!url.endsWith("client-reserve"))).toHaveLength(2);
    expect(refreshed).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Ожидает обработки");
  });
  it("lost storage ACK blocks the rest, status GET reconciles without replay",async()=>{
    firstUploadLost=true;firstStatus="processing";
    await choose(photo("first.jpg"),photo("second.jpg"));
    await click("Загрузить фотографии");
    expect(host.textContent).toContain("Статус отправки неизвестен");
    expect(button("Загрузить фотографии").disabled).toBe(true);
    // Both were already admitted into the five-slot pool before the first ACK failed.
    // A failure stops UNSTARTED uploads, not transfers already accepted by S3.
    expect(fetcher.mock.calls.filter(([url])=>url==="/api/v1/gallery/uploads/client-reserve")).toHaveLength(2);
    await click("Проверить состояние загрузки");
    expect(host.textContent).not.toContain("Статус отправки неизвестен");
    expect(storageUrls.filter(url=>url===uploadUrl(ids[0]))).toHaveLength(1);
    expect(storageUrls.filter(url=>url===uploadUrl(ids[1]))).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(2);
  });
  it("holds at five concurrent external S3 transfers and fills freed slots",async()=>{
    holdStorage=true;
    await choose(...Array.from({length:7},(_,i)=>photo(`parallel-${i}.jpg`)));
    await act(async()=>button("Загрузить фотографии").click());await flush();
    expect(storageUrls).toEqual(ids.slice(0,5).map(uploadUrl));
    expect(pendingStorage).toHaveLength(5);
    expect(host.textContent).toContain("parallel-6.jpg — В очереди");
    await act(async()=>pendingStorage[0]());await flush();
    expect(storageUrls).toEqual(ids.slice(0,6).map(uploadUrl));
    await act(async()=>pendingStorage[1]());await flush();
    expect(storageUrls).toEqual(ids.slice(0,7).map(uploadUrl));
    expect(new Set(storageUrls).size).toBe(7);
    await act(async()=>pendingStorage.slice(2).forEach(finish=>finish()));await flush();
    expect(host.textContent).toContain("Ожидает обработки");
    expect(refreshed).toHaveBeenCalledTimes(7);
  });
  it("lost S3 ACK freezes new slots but does not kill four already running files",async()=>{
    holdStorage=true;firstUploadLost=true;
    await choose(...Array.from({length:7},(_,i)=>photo(`safe-${i}.jpg`)));
    await act(async()=>button("Загрузить фотографии").click());await flush();
    expect(storageUrls).toHaveLength(5);
    await act(async()=>pendingStorage[0]());await flush();
    expect(host.textContent).toContain("Статус отправки неизвестен");
    expect(storageUrls).toHaveLength(5);
    await act(async()=>pendingStorage.slice(1,5).forEach(finish=>finish()));await flush();
    expect(storageUrls).toHaveLength(5);
    expect(refreshed).toHaveBeenCalledTimes(4);
    await click("Проверить состояние загрузки");
    expect(host.textContent).not.toContain("Статус отправки неизвестен");
    expect(storageUrls).toHaveLength(5);
    await act(async()=>button("Загрузить фотографии").click());await flush();
    expect(storageUrls).toHaveLength(7);
    expect(new Set(storageUrls).size).toBe(7);
  });
  it("interrupts only the chosen transfer and preserves other in-flight uploads",async()=>{
    holdStorage=true;
    await choose(photo("first.jpg"),photo("second.jpg"));
    await act(async()=>button("Загрузить фотографии").click());await flush();
    expect(storageUrls).toHaveLength(2);
    const stop=host.querySelectorAll<HTMLButtonElement>("button");
    const abortFirst=[...stop].filter(b=>b.textContent?.trim()==="Прервать передачу");
    expect(abortFirst).toHaveLength(2);
    await act(async()=>abortFirst[0].click());await flush();
    expect(host.textContent).toContain("Статус неизвестен");
    expect(host.textContent).toContain("second.jpg — Загружается");
    await act(async()=>pendingStorage[1]());await flush();
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(storageUrls).toHaveLength(2);
  });
  it("expires uncertain reservations via owner GET without repeating storage POST",async()=>{
    let tick:(()=>void)|undefined;
    const originalInterval=window.setInterval.bind(window);
    const interval=vi.spyOn(window,"setInterval").mockImplementation((handler,delay)=>{
      if(delay===5000){tick=handler as ()=>void;return 9999 as never;}
      return originalInterval(handler,delay) as never;
    });
    try{
      firstUploadLost=true;
      await choose(photo("first.jpg"));
      await click("Загрузить фотографии");
      expect(host.textContent).toContain("Статус неизвестен");
      expect(tick).toBeTypeOf("function");
      firstStatus="expired";
      await act(async()=>tick?.());
      expect(host.textContent).toContain("Не отправлено");
      expect(host.textContent).not.toContain("Остальная очередь заблокирована");
      expect(storageUrls).toHaveLength(1);
      expect(fetcher.mock.calls.filter(([url])=>url===`/api/v1/gallery/uploads/${ids[0]}`))
        .toHaveLength(1);
    }finally{interval.mockRestore();}
  });
  it("lost initial reservation ACK recovers exact idempotent request without S3 replay",async()=>{
    reserveAckLost=true;
    await choose(photo("first.jpg"));
    await click("Загрузить фотографии");
    expect(host.textContent).toContain("Идентификатор загрузки не получен");
    expect(storageUrls).toHaveLength(0);
    expect(button("Загрузить фотографии").disabled).toBe(true);
    await click("Восстановить резервирование");
    expect(host.textContent).toContain("Резервирование подтверждено");
    expect(storageUrls).toHaveLength(0);
    await click("Загрузить фотографии");
    expect(storageUrls).toEqual([uploadUrl(ids[0])]);
    const reservations=fetcher.mock.calls.filter(([url])=>
      url==="/api/v1/gallery/uploads/client-reserve");
    expect(reservations).toHaveLength(3);
    const keys=reservations.map(([,request])=>
      (JSON.parse(String(request?.body)) as {clientRequestId:string}).clientRequestId);
    expect(new Set(keys).size).toBe(1);
    expect(host.textContent).toContain("Ожидает обработки");
  });
  it("reports actual upload byte progress without claiming worker READY",async()=>{
    holdStorage=true;
    await choose(photo("first.jpg"));
    await act(async()=>button("Загрузить фотографии").click());
    await flush();
    const progress=host.querySelector<HTMLProgressElement>("progress");
    expect(progress?.value).toBe(80);
    expect(progress?.getAttribute("aria-label")).toContain("80%");
    expect(host.textContent).toContain("Загружается");
    expect(completeStorage).not.toBeNull();
    await act(async()=>completeStorage?.());
    await flush();
    expect(host.textContent).toContain("Ожидает обработки");
    const processingProgress=host.querySelector<HTMLProgressElement>("progress");
    expect(processingProgress?.getAttribute("value")).toBeNull();
    expect(processingProgress?.getAttribute("aria-label")).toContain("обрабатывается");
  });
  it("stops an active XHR without replaying POST or pretending it was cancelled",async()=>{
    holdStorage=true;
    await choose(photo("first.jpg"));
    await act(async()=>button("Загрузить фотографии").click());
    await flush();
    await click("Прервать передачу");
    expect(host.textContent).toContain("Статус неизвестен");
    expect(storageUrls).toEqual([uploadUrl(ids[0])]);
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith("/client-complete"))).toHaveLength(0);
    expect(button("Загрузить фотографии").disabled).toBe(true);
    await click("Отменить загрузку");
    expect(host.textContent).toContain("Отменено");
    expect(fetcher.mock.calls.filter(([url,options])=>
      url===`/api/v1/gallery/uploads/${ids[0]}`&&options?.method==="DELETE"))
      .toHaveLength(1);
    expect(storageUrls).toEqual([uploadUrl(ids[0])]);
  });
  it("owner DELETE of an uploaded reservation requires confirmed tombstone GET",async()=>{
    await choose(photo("first.jpg"));
    await click("Загрузить фотографии");
    await click("Отменить загрузку");
    expect(host.textContent).toContain("Отменено");
    expect(cancelledIds.has(ids[0])).toBe(true);
    expect(fetcher.mock.calls.filter(([url,options])=>
      url===`/api/v1/gallery/uploads/${ids[0]}`&&options?.method==="DELETE"))
      .toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url])=>
      url===`/api/v1/gallery/uploads/${ids[0]}`)).toHaveLength(4);
  });
  it("lost DELETE acknowledgement never repeats DELETE; GET can resolve cancellation",async()=>{
    cancellationLost=true;
    await choose(photo("first.jpg"),photo("second.jpg"));
    await click("Загрузить фотографии");
    await click("Отменить загрузку");
    expect(host.textContent).toContain("Отмена не подтверждена");
    expect(button("Загрузить фотографии").disabled).toBe(true);
    await click("Проверить состояние загрузки");
    expect(host.textContent).toContain("Отменено");
    expect(button("Загрузить фотографии").disabled).toBe(true);
    expect(fetcher.mock.calls.filter(([url,options])=>
      url===`/api/v1/gallery/uploads/${ids[0]}`&&options?.method==="DELETE"))
      .toHaveLength(1);
  });
  it("retries only an owner-confirmed failed upload and verifies new child",async()=>{
    firstStatus="failed";
    await choose(photo("first.jpg"));
    await click("Загрузить фотографии");
    expect(host.textContent).toContain("Статус неизвестен");
    await click("Проверить состояние загрузки");
    expect(host.textContent).toContain("Не отправлено");
    await act(async()=>{
      const retry=host.querySelector<HTMLButtonElement>('button[aria-label^="Повторить обработку фото"]');
      expect(retry).not.toBeNull();
      retry?.click();
    }); await flush();
    expect(retryAttempts).toHaveLength(1);
    expect(storageUrls).toEqual([uploadUrl(ids[0]),uploadUrl(retryChild)]);
    expect(host.textContent).toContain("Ожидает обработки");
  });
  it("recovers lost retry ACK using the same idempotency key",async()=>{
    firstStatus="failed";retryAckLost=true;
    await choose(photo("first.jpg"));
    await click("Загрузить фотографии");
    await click("Проверить состояние загрузки");
    await act(async()=>{
      const retry=host.querySelector<HTMLButtonElement>('button[aria-label^="Повторить обработку фото"]');
      expect(retry).not.toBeNull();
      retry?.click();
    }); await flush();
    expect(host.textContent).toContain("Статус неизвестен");
    expect(retryAttempts).toHaveLength(1);
    expect(storageUrls).toEqual([uploadUrl(ids[0])]);
    await click("Проверить состояние загрузки");
    expect(host.textContent).toContain("Восстановите запрос с тем же ключом");
    await click("Восстановить запрос повтора");
    expect(retryAttempts).toHaveLength(2);
    expect(new Set(retryAttempts).size).toBe(1);
    expect(storageUrls).toEqual([uploadUrl(ids[0]),uploadUrl(retryChild)]);
    expect(host.textContent).toContain("Ожидает обработки");
  });
  it("original Next one-step album selection starts idempotent upload automatically",async()=>{
    await act(async()=>root.render(<GalleryUploadQueue albumId="album_A" usedSlots={0}
      onRefresh={refreshed} autoUpload/>));
    expect(button("Добавить фотографии")).toBeDefined();
    expect(button("Загрузить фотографии")).toBeUndefined();
    await choose(photo("auto.jpg"));
    await flush();
    expect(fetcher.mock.calls.filter(([url])=>url==="/api/v1/gallery/uploads/client-reserve"))
      .toHaveLength(1);
    expect(storageUrls).toEqual([uploadUrl(ids[0])]);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });
  it("retries server-persisted failed photo after page reload via original upload ID, not new reserve",async()=>{
    firstStatus="failed";
    const failed:AlbumPhoto={id:"photo_failed",albumId:"album_A",status:"failed",caption:null,
      thumbUrl:null,fullUrl:null,urlsExpireAt:null,width:null,height:null,
      uploadId:ids[0],errorMessage:"Обработка фотографии не удалась."};
    await act(async()=>root.render(<GalleryUploadQueue albumId="album_A" usedSlots={1}
      onRefresh={refreshed} failedPhotos={[failed]}/>));
    expect(host.textContent).toContain("Выбрать файл и повторить");
    const input=host.querySelector<HTMLInputElement>(
      `input[data-gallery-retry-upload-id="${ids[0]}"]`);
    expect(input).not.toBeNull();
    Object.defineProperty(input!,"files",{configurable:true,value:[photo("recovered.jpg")]});
    await act(async()=>input?.dispatchEvent(new Event("change",{bubbles:true})));
    await flush();
    expect(retryAttempts).toHaveLength(1);
    expect(storageUrls).toEqual([uploadUrl(retryChild)]);
    expect(fetcher.mock.calls.filter(([url])=>url==="/api/v1/gallery/uploads/client-reserve"))
      .toHaveLength(0);
    expect(host.textContent).not.toContain("Выбрать файл и повторить");
    expect(host.textContent).toContain("Ожидает обработки");
  });
  it("failed-photo recovery rejects invalid bytes and retains reselect control",async()=>{
    firstStatus="failed";
    const failed:AlbumPhoto={id:"photo_failed",albumId:"album_A",status:"failed",caption:null,
      thumbUrl:null,fullUrl:null,urlsExpireAt:null,width:null,height:null,uploadId:ids[0]};
    await act(async()=>root.render(<GalleryUploadQueue albumId="album_A" usedSlots={1}
      onRefresh={refreshed} failedPhotos={[failed]}/>));
    const input=host.querySelector<HTMLInputElement>(
      `input[data-gallery-retry-upload-id="${ids[0]}"]`)!;
    Object.defineProperty(input,"files",{configurable:true,value:[photo("fake.jpg",false)]});
    await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
    await flush();
    expect(host.textContent).toContain("Нужен настоящий JPG");
    expect(host.textContent).toContain("Выбрать файл и повторить");
    expect(fetcher).not.toHaveBeenCalled();
    expect(storageUrls).toHaveLength(0);
  });
  it("persisted photo is never retried before owner status GET confirms failure",async()=>{
    firstStatus="processing";
    const failed:AlbumPhoto={id:"photo_failed",albumId:"album_A",status:"failed",caption:null,
      thumbUrl:null,fullUrl:null,urlsExpireAt:null,width:null,height:null,uploadId:ids[0]};
    await act(async()=>root.render(<GalleryUploadQueue albumId="album_A" usedSlots={1}
      onRefresh={refreshed} failedPhotos={[failed]}/>));
    const input=host.querySelector<HTMLInputElement>(
      `input[data-gallery-retry-upload-id="${ids[0]}"]`)!;
    Object.defineProperty(input,"files",{configurable:true,value:[photo("valid.jpg")]});
    await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
    await flush();
    expect(fetcher.mock.calls.some(([url])=>url===`/api/v1/gallery/uploads/${ids[0]}`)).toBe(true);
    expect(retryAttempts).toHaveLength(0);
    expect(storageUrls).toHaveLength(0);
  });
  it("rejects fake JPEG bytes before S3 and never makes a reservation",async()=>{
    await choose(photo("fake.jpg",false));
    await click("Загрузить фотографии");
    expect(host.textContent).toContain("Нужен настоящий JPG");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

/** Next only shows a slow-processing warning after one minute, not during S3 transfer. */
describe("gallery processing delay parity",()=>{
  it("requires a full minute of processing and ignores unknown timestamps",async()=>{
    const {galleryProcessingIsSlow}=await import("./GalleryUploadQueue");
    expect(galleryProcessingIsSlow(undefined,60_000)).toBe(false);
    expect(galleryProcessingIsSlow(Number.NaN,100_000)).toBe(false);
    expect(galleryProcessingIsSlow(1_000,60_999)).toBe(false);
    expect(galleryProcessingIsSlow(1_000,61_000)).toBe(true);
  });
});
