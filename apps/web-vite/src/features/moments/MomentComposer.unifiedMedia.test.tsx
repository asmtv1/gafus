// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentComposer } from "./MomentComposer";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const transferPhoto = vi.hoisted(() => vi.fn(async (_input:{postId:string;existingCount:number;clientRequestId?:string}) => "photo-1"));
const transferVideo = vi.hoisted(() => vi.fn(async (_input:{postId:string;existingCount:number}) => "video-1"));
vi.mock("./feedMediaTransfer", async importActual => {
  const original = await importActual<typeof import("./feedMediaTransfer")>();
  return { ...original, uploadMomentPhoto: transferPhoto, uploadMomentVideo: transferVideo };
});
const editor = { id:"post-1",status:"draft",version:0,text:"",canEdit:true,
  attachments:[],pendingRevision:null };
const revision = (version:number, ids:string[], text="") => ({
  ...editor,version,text,attachments:ids.map(id=>({id})),
  pendingRevision:{ status:"draft",text,attachmentIds:ids },
});
const response = (data:unknown,status=200) => new Response(JSON.stringify({
  success:status===200,data,error:"Service unavailable",
}),{status});
async function mount(fetcher:ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?:boolean }).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",fetcher);
  vi.stubGlobal("crypto",{randomUUID:()=>UUID});
  window.history.replaceState(null,"","/moments/new");
  const host=document.createElement("div");document.body.append(host);
  const root=createRoot(host);
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},
    createElement(MomentComposer,{userId:"viewer"}))));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  const choose=async(files:File[])=>{
    const input=host.querySelector<HTMLInputElement>('.web4-compose-file-selection input[type="file"]');
    expect(input).not.toBeNull();
    Object.defineProperty(input!,"files",{configurable:true,value:files});
    await act(async()=>input!.dispatchEvent(new Event("change",{bubbles:true})));
  };
  const fill=async(text:string)=>{
    const textarea=host.querySelector<HTMLTextAreaElement>("textarea")!;
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!;
    await act(async()=>{setter.call(textarea,text);
      textarea.dispatchEvent(new Event("input",{bubbles:true}));});
  };
  const publish=async()=>{
    const btn=[...host.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === 'Опубликовать');
    expect(btn).not.toBeNull();expect(btn?.disabled).toBe(false);
    await act(async()=>btn?.click());
    for(let attempt=0;attempt<22 && !fetcher.mock.calls.some(([url])=>String(url).endsWith('/publish'));attempt++)
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  };
  return {host,choose,fill,publish,cleanup:async()=>{
    await act(async()=>root.unmount());cache.clear();host.remove();
    window.history.replaceState(null,"","/moments/new");
  }};
}
afterEach(() => {
  vi.unstubAllGlobals();
  // Concurrent upload tests install deferred implementations. They must not
  // leak into following one-click publication tests in the same test file.
  transferPhoto.mockReset().mockResolvedValue("photo-1");
  transferVideo.mockReset().mockResolvedValue("video-1");
});

describe("WEB4 Next single-action photo/video composition via the existing Core contract",()=>{
  it("places real local media and poll controls inside one source-order composition form",async()=>{
    const fake=vi.fn((path:string,_init?:RequestInit)=>Promise.resolve(path.endsWith('/status')
      ? response({enabled:true}):response(null,503)));
    const ui=await mount(fake);
    try{
      const form=ui.host.querySelector<HTMLFormElement>('form[aria-label="Сохранение текстового черновика"]');
      expect(form).not.toBeNull();
      const textarea=form!.querySelector('textarea');
      const files=form!.querySelector<HTMLInputElement>('.web4-compose-file-selection input[type="file"]');
      const mediaPicker=form!.querySelector('.web4-compose-file-selection.question-photo-picker-next');
      const tile=mediaPicker?.querySelector<HTMLButtonElement>('.question-photo-add.web4-compose-media-add');
      expect(mediaPicker).not.toBeNull();
      expect(tile?.textContent).toContain('Добавить фото или видео');
      expect(tile?.querySelector('svg')).not.toBeNull();
      expect(tile?.getAttribute('aria-controls')).toBe(files?.id);
      expect(files?.hidden).toBe(true);
      expect(mediaPicker?.textContent).toContain('0 из 10 вложений');
      expect(mediaPicker?.textContent).toContain('не более 3 видео');
      const addPoll=[...form!.querySelectorAll<HTMLButtonElement>('button')]
        .find(button=>button.textContent?.includes('Добавить опрос'));
      const actions=form!.querySelector('.web4-compose-actions');
      expect(textarea).not.toBeNull();
      expect(files).not.toBeNull();
      expect(addPoll).toBeDefined();
      expect(actions).not.toBeNull();
      const controls=[textarea!,files!,addPoll!,actions!];
      for(let i=0;i<controls.length-1;i++)
        expect(controls[i].compareDocumentPosition(controls[i+1]) & Node.DOCUMENT_POSITION_FOLLOWING)
          .toBeTruthy();
      await ui.choose([new File(['photo'],'dog.webp',{type:'image/webp'})]);
      await act(async()=>addPoll?.click());
      expect(form!.querySelector('section.web4-inline-poll')).not.toBeNull();
      expect(fake.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
    }finally{await ui.cleanup();}
  });
  it("keeps previously chosen photo when video is added in a later picker visit",async()=>{
    const fake=vi.fn((path:string,_init?:RequestInit)=>Promise.resolve(path.endsWith("/status")
      ? response({enabled:true}):response(null,503)));
    const ui=await mount(fake);
    try{
      await ui.choose([new File(["photo"],"portrait.webp",{type:"image/webp"})]);
      await ui.choose([new File(["video"],"walk.mp4",{type:"video/mp4"})]);
      expect(ui.host.querySelectorAll(".web4-compose-media-preview li")).toHaveLength(2);
      expect(ui.host.querySelectorAll(".web4-compose-media-preview .web4-compose-media-frame")).toHaveLength(2);
      expect(ui.host.querySelector('video[aria-label="Предпросмотр видео walk.mp4"]')).not.toBeNull();
      expect(ui.host.querySelector('button[aria-label="Убрать файл walk.mp4"] svg')).not.toBeNull();
      expect(ui.host.querySelector('.web4-compose-file-selection')?.textContent).toContain('2 из 10 вложений');
      expect(ui.host.textContent).toContain("portrait.webp");
      expect(ui.host.textContent).toContain("walk.mp4");
      expect(fake.mock.calls.every(([,init])=>!init?.method||init.method==="GET"))
        .toBe(true);
    }finally{await ui.cleanup();}
  });
  it("keeps previously selected media when an extra file is rejected",async()=>{
    const fake=vi.fn((path:string,_init?:RequestInit)=>Promise.resolve(path.endsWith("/status")
      ? response({enabled:true}):response(null,503)));
    const ui=await mount(fake);
    try {
      await ui.choose([new File(["photo"],"dog.webp",{type:"image/webp"})]);
      expect(ui.host.querySelectorAll(".web4-compose-media-preview li")).toHaveLength(1);
      await ui.choose([new File(["bad"],"attack.exe",{type:"application/octet-stream"})]);
      expect(ui.host.querySelectorAll(".web4-compose-media-preview li")).toHaveLength(1);
      expect(ui.host.textContent).toContain("dog.webp");
      expect(ui.host.textContent).toContain("Поддерживаются только");
      const remove=ui.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Убрать файл dog.webp"]');
      await act(async()=>remove?.click());
      expect(ui.host.querySelectorAll(".web4-compose-media-preview li")).toHaveLength(0);
      expect(ui.host.textContent).not.toContain("Поддерживаются только");
      expect(fake.mock.calls.every(([,init])=>!init?.method||init.method==="GET")).toBe(true);
    }finally {await ui.cleanup();}
  });
  it("validates a local file BEFORE draft POST; failed MIME and excess videos create nothing",async()=>{
    const fake=vi.fn((path:string,_init?:RequestInit)=>Promise.resolve(path.endsWith('/status')
      ? response({enabled:true}):response(null,503)));
    const ui=await mount(fake);
    try{
      await ui.choose([new File(['bad'],'attack.exe',{type:'application/octet-stream'})]);
      expect(ui.host.textContent).toContain('Поддерживаются только');
      expect([...ui.host.querySelectorAll<HTMLButtonElement>('button')]
        .find(button => button.textContent?.trim() === 'Опубликовать')?.disabled).toBe(true);
      await ui.choose(Array.from({length:4},(_,i)=>new File(['1'],`v${i}.mp4`,{type:'video/mp4'})));
      expect(ui.host.textContent).toContain('Слишком много');
      expect(fake.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
    }finally{await ui.cleanup();}
  });
  it("real server pending-media ACK returns to /moments without claiming the post is already visible",async()=>{
    const body="Публикация с фото ждёт обработки";
    let revisionNumber=0;
    const fake=vi.fn((path:string)=>{
      if(path.endsWith('/status'))return Promise.resolve(response({enabled:true}));
      if(path==='/api/v1/feed/posts')return Promise.resolve(response(editor));
      if(path.endsWith('/revisions')){
        revisionNumber++;
        return Promise.resolve(response(revision(revisionNumber,['photo-1'],
          revisionNumber===1?'':body)));
      }
      if(path.endsWith('/publish'))return Promise.resolve(response({
        ...revision(2,['photo-1'],body),status:'pending',canEdit:false,
        pendingRevision:null,
      }));
      return Promise.resolve(response(null,503));
    });
    const ui=await mount(fake);
    try{
      await ui.fill(body);
      await ui.choose([new File(['photo'],'dog.webp',{type:'image/webp'})]);
      await ui.publish();
      for(let attempt=0;attempt<15 && window.location.pathname!=='/moments';attempt++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
      expect(revisionNumber).toBe(2);
      expect(fake.mock.calls.filter(([path])=>path.endsWith('/publish'))).toHaveLength(1);
      expect(window.location.pathname).toBe('/moments');
      expect(window.location.pathname).not.toBe('/moments/post-1');
      expect(fake.mock.calls.filter(([path])=>path==='/api/v1/feed/posts')).toHaveLength(1);
    }finally{await ui.cleanup();}
  });
  it("preserves the actual owner draft after failed S3 transfer and exposes a resume route", async () => {
    transferPhoto.mockRejectedValueOnce(new Error("S3 connection lost"));
    const fake = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/status") ? response({ enabled: true })
        : path === "/api/v1/feed/posts" ? response(editor) : response(null, 503)));
    const ui = await mount(fake);
    try {
      await ui.fill("Публикация с ошибкой сети");
      await ui.choose([new File(["file"], "dog.webp", { type: "image/webp" })]);
      const publish = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Опубликовать");
      await act(async () => publish?.click());
      await vi.waitFor(() => expect(ui.host.textContent)
        .toContain("Не удалось загрузить фото или видео"));
      const resume = ui.host.querySelector<HTMLAnchorElement>(
        'a[href="/moments/drafts/post-1"]');
      expect(resume?.textContent).toContain("Открыть сохранённый черновик");
      expect(fake.mock.calls.filter(([path]) => path === "/api/v1/feed/posts"))
        .toHaveLength(1);
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/revisions")))
        .toHaveLength(0);
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/publish")))
        .toHaveLength(0);
    } finally { await ui.cleanup(); }
  });

  it("retries a failed S3 upload on the SAME untouched draft after storage recovers", async () => {
    transferPhoto.mockRejectedValueOnce(new Error("S3 connection lost"));
    let version = 0;
    const body = "Пост с фотографией";
    const requests = vi.fn((path: string, init?: RequestInit) => {
      if (path.endsWith("/status")) return Promise.resolve(response({ enabled: true }));
      if (path === "/api/v1/feed/posts") return Promise.resolve(response(editor));
      if (path.endsWith("/revisions")) {
        const parsed = JSON.parse(String(init?.body)) as { text: string };
        return Promise.resolve(response(revision(++version, ["photo-1"], parsed.text)));
      }
      if (path.endsWith("/publish")) return Promise.resolve(response({
        ...revision(version, ["photo-1"], body), status: "published", pendingRevision: null,
      }));
      return Promise.resolve(response(null, 503));
    });
    const ui = await mount(requests);
    try {
      await ui.fill(body);
      await ui.choose([new File(["photo"], "dog.webp", { type: "image/webp" })]);
      const action = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Опубликовать");
      await act(async () => action?.click());
      await vi.waitFor(() => expect(ui.host.textContent)
        .toContain("Не удалось загрузить фото или видео"));
      expect(requests.mock.calls.filter(([url]) => url === "/api/v1/feed/posts")).toHaveLength(1);
      const retry = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.includes("Повторить отправку с фото"));
      expect(retry?.disabled).toBe(false);
      const firstKey = transferPhoto.mock.calls[0]?.[0]?.clientRequestId;
      await act(async () => retry?.click());
      await vi.waitFor(() => expect(requests.mock.calls.filter(([url]) =>
        url.endsWith("/publish"))).toHaveLength(1));
      expect(transferPhoto).toHaveBeenCalledTimes(2);
      expect(transferPhoto.mock.calls[1]?.[0]?.clientRequestId).toBe(firstKey);
      expect(requests.mock.calls.filter(([url]) => url === "/api/v1/feed/posts")).toHaveLength(1);
      expect(requests.mock.calls.filter(([url]) => url.endsWith("/revisions"))).toHaveLength(2);
      expect(window.location.pathname).toBe("/moments");
    } finally { await ui.cleanup(); }
  });

  it("one publish click starts five signed uploads before sequential ordered Core CAS writes", async () => {
    const finished = new Map<number, (mediaId: string) => void>();
    let inflight = 0, peak = 0;
    transferPhoto.mockImplementation(({ existingCount }: { existingCount: number }) => {
      inflight++;
      peak = Math.max(peak, inflight);
      return new Promise<string>(resolve => {
        finished.set(existingCount, mediaId => { inflight--; resolve(mediaId); });
      });
    });
    let version = 0;
    const linked: string[] = [];
    const fake = vi.fn((path: string, init?: RequestInit) => {
      if (path.endsWith("/status")) return Promise.resolve(response({ enabled: true }));
      if (path === "/api/v1/feed/posts") return Promise.resolve(response(editor));
      if (path.endsWith("/revisions")) {
        const body = JSON.parse(String(init?.body)) as { attachmentIds: string[]; text: string };
        linked.splice(0, linked.length, ...body.attachmentIds);
        return Promise.resolve(response(revision(++version, linked.slice(), body.text)));
      }
      if (path.endsWith("/publish")) return Promise.resolve(response({
        ...revision(version, linked, "Пять файлов"), status: "published", pendingRevision: null,
      }));
      return Promise.resolve(response(null, 503));
    });
    const ui = await mount(fake);
    try {
      await ui.fill("Пять файлов");
      await ui.choose(Array.from({ length: 5 }, (_, n) =>
        new File([`photo-${n}`], `photo-${n}.webp`, { type: "image/webp" })));
      const publish = [...ui.host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Опубликовать");
      expect(publish?.disabled).toBe(false);
      await act(async () => publish?.click());
      await vi.waitFor(() => expect(transferPhoto).toHaveBeenCalledTimes(5));
      expect(peak).toBe(5);
      expect(fake.mock.calls.filter(([path]) => path.endsWith("/revisions"))).toHaveLength(0);
      // The upload ACKs arrive in an arbitrary order.
      await act(async () => {
        for (const index of [4, 1, 3, 0, 2]) finished.get(index)!(`media-${index}`);
      });
      await vi.waitFor(() => expect(fake.mock.calls.filter(([path]) =>
        path.endsWith("/publish"))).toHaveLength(1));
      const revisions = fake.mock.calls.filter(([path]) => path.endsWith("/revisions"));
      expect(revisions).toHaveLength(6);
      expect(revisions.slice(0, 5).map(([, req]) => JSON.parse(String(req?.body)).attachmentIds))
        .toEqual(Array.from({ length: 5 }, (_, n) =>
          Array.from({ length: n + 1 }, (_, j) => `media-${j}`)));
      expect(linked).toEqual(Array.from({ length: 5 }, (_, n) => `media-${n}`));
      expect(inflight).toBe(0);
    } finally { await ui.cleanup(); }
  });

  it("one action creates one owner draft, uploads photo+video, CAS links in order, saves text and publishes",async()=>{
    let seq=0;
    const fake=vi.fn((path:string,_init?:RequestInit)=>{
      if(path.endsWith('/status'))return Promise.resolve(response({enabled:true}));
      if(path==='/api/v1/feed/posts')return Promise.resolve(response(editor));
      if(path.endsWith('/revisions')){
        const revisionData=[revision(1,['photo-1']),revision(2,['photo-1','video-1']),
          revision(3,['photo-1','video-1'],'Учимся с собакой')][seq++];
        return Promise.resolve(response(revisionData));
      }
      if(path.endsWith('/publish'))return Promise.resolve(response({
        ...revision(3,['photo-1','video-1'],'Учимся с собакой'),
        status:'published',pendingRevision:null,
      }));
      return Promise.resolve(response(null,503));
    });
    const ui=await mount(fake);
    try{
      await ui.fill('Учимся с собакой');
      await ui.choose([new File(['picture'],'dog.webp',{type:'image/webp'}),
        new File(['movie'],'dog.mp4',{type:'video/mp4'})]);
      await ui.publish();
      expect(transferPhoto).toHaveBeenCalledTimes(1);
      expect(transferVideo).toHaveBeenCalledTimes(1);
      expect(transferVideo.mock.calls[0]?.[0]).toMatchObject({
        postId:'post-1',existingCount:1,
      });
      const writes=fake.mock.calls.filter(([,init])=>init?.method && init?.method!=='GET');
      expect(writes.map(([path])=>path)).toEqual([
        '/api/v1/feed/posts',
        '/api/v1/feed/posts/post-1/revisions',
        '/api/v1/feed/posts/post-1/revisions',
        '/api/v1/feed/posts/post-1/revisions',
        '/api/v1/feed/posts/post-1/publish',
      ]);
      expect(writes.slice(1,4).map(([,init])=>JSON.parse(String(init?.body)))).toEqual([
        {text:'',attachmentIds:['photo-1'],expectedVersion:0,clientRequestId:UUID},
        {text:'',attachmentIds:['photo-1','video-1'],expectedVersion:1,clientRequestId:UUID},
        {text:'Учимся с собакой',attachmentIds:['photo-1','video-1'],expectedVersion:2,clientRequestId:UUID},
      ]);
      expect(window.location.pathname).toBe('/moments');
    }finally{await ui.cleanup();}
  });
});
