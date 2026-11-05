// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentComposer } from "./MomentComposer";

const UUID="550e8400-e29b-41d4-a716-446655440000";
const editor={id:"post-1",status:"draft",version:0,text:"",canEdit:true,
  attachments:[],pendingRevision:null};
const draftRevision={...editor,version:1,pendingRevision:{status:"draft",text:"",attachmentIds:[]}};
const savedPoll={id:"poll-1",postId:"post-1",question:"Как лучше заниматься?",
  isQuiz:false,allowMultiple:false,isAnonymous:false,closed:false,
  canClose:true,totalVotes:0,myOptionIds:[],explanation:null,
  options:[{id:"a-1",text:"Короткими подходами",votes:0},{id:"a-2",text:"Долго",votes:0}]};
const response=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status===200,data,error:status===404?"Not found":"Service unavailable",
}),{status});
async function mount(fetcher:ReturnType<typeof vi.fn>) {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",fetcher);vi.stubGlobal("crypto",{randomUUID:()=>UUID});
  window.history.replaceState(null,"","/moments/new");
  const host=document.createElement("div");document.body.append(host);
  const root=createRoot(host);
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},
    createElement(MomentComposer,{userId:"viewer"}))));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  const click=async(label:string)=>{
    const btn=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b=>b.textContent?.trim().includes(label));
    expect(btn).toBeDefined();
    await act(async()=>btn?.click());
  };
  const fill=async(selector:string,text:string)=>{
    const input=host.querySelector<HTMLInputElement>(selector)!;
    expect(input).not.toBeNull();
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
    await act(async()=>{set.call(input,text);input.dispatchEvent(new Event("input",{bubbles:true}));});
  };
  return {host,click,fill,cleanup:async()=>{
    await act(async()=>root.unmount());cache.clear();host.remove();
    window.history.replaceState(null,"","/moments/new");
  }};
}
afterEach(()=>vi.unstubAllGlobals());

describe("WEB4 single action source poll without duplicating Core ledger",()=>{
  it("blocks invalid 2-option polls before any draft POST",async()=>{
    const fake=vi.fn((_path:string,_init?:RequestInit)=>Promise.resolve(response({enabled:true})));
    const ui=await mount(fake);
    try {
      await ui.click("+ Добавить опрос");
      expect(Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button")).find(
        button => button.textContent?.trim() === "Опубликовать")?.hasAttribute("disabled")).toBe(true);
      expect(fake.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(0);
    }finally{await ui.cleanup();}
  });
  it("publishes poll-only via create → GET absent → PUT validated → GET confirmed → pollOnly CAS → publish",async()=>{
    let exists=false;
    const fake=vi.fn((path:string,init?:RequestInit)=>{
      if(path.endsWith("/status"))return Promise.resolve(response({enabled:true}));
      if(path==="/api/v1/feed/posts")return Promise.resolve(response(editor));
      if(path.endsWith("/draft-poll"))
        return Promise.resolve(response(exists ? savedPoll : null));
      if(path.endsWith("/poll")){
        if(init?.method==="PUT"){ exists=true; return Promise.resolve(response(savedPoll)); }
        return Promise.resolve(exists?response(savedPoll):response(null,404));
      }
      if(path.endsWith("/revisions"))return Promise.resolve(response(draftRevision));
      if(path.endsWith("/publish"))return Promise.resolve(response({
        ...draftRevision,status:"published",pendingRevision:null,
      }));
      return Promise.resolve(response(null,503));
    });
    const ui=await mount(fake);
    try {
      await ui.click("+ Добавить опрос");
      await ui.fill('section.web4-inline-poll input[placeholder="Что вы думаете?"]',savedPoll.question);
      await ui.fill('input[aria-label="Вариант ответа 1"]',savedPoll.options[0]!.text);
      await ui.fill('input[aria-label="Вариант ответа 2"]',savedPoll.options[1]!.text);
      const quick=Array.from(ui.host.querySelectorAll<HTMLButtonElement>("button")).find(
        button => button.textContent?.trim() === "Опубликовать")!;
      expect(quick?.disabled).toBe(false);
      await act(async()=>quick.click());
      for(let i=0;i<23&&!fake.mock.calls.some(([path])=>path.endsWith("/publish"));i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
      const writes=fake.mock.calls.filter(([,init])=>init?.method && init.method!=="GET");
      expect(writes.map(([path])=>path)).toEqual([
        "/api/v1/feed/posts", "/api/v1/feed/posts/post-1/poll",
        "/api/v1/feed/posts/post-1/revisions", "/api/v1/feed/posts/post-1/publish",
      ]);
      expect(JSON.parse(String(writes[1]?.[1]?.body))).toMatchObject({
        question:savedPoll.question,expectedVersion:0,options:[
          {text:savedPoll.options[0]!.text},{text:savedPoll.options[1]!.text},
        ],
      });
      expect(JSON.parse(String(writes[2]?.[1]?.body))).toMatchObject({
        text:"",attachmentIds:[],pollOnly:true,expectedVersion:0,
      });
      for(let i=0;i<10&&window.location.pathname!=="/moments";i++)
        await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
      expect(window.location.pathname).toBe("/moments");
    }finally{await ui.cleanup();}
  });
});
