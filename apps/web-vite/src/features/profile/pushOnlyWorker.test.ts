import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source=readFileSync("public/push-sw.js","utf8");
function installWorker(){
  const handlers=new Map<string,(event:unknown)=>void>();
  const showNotification=vi.fn(async(_title:string,_options:{data:{url:string}})=>undefined);
  const openWindow=vi.fn(async()=>undefined);
  const focus=vi.fn(async()=>undefined);
  const navigate=vi.fn(async()=>undefined);
  const clients={claim:vi.fn(async()=>undefined),
    matchAll:vi.fn(async()=>[] as object[]),openWindow};
  const self={location:{origin:"https://refactor.example.test"},clients,
    registration:{showNotification},skipWaiting:vi.fn(async()=>undefined),
    addEventListener:(type:string,handler:(event:unknown)=>void)=>handlers.set(type,handler)};
  runInNewContext(source,{self,URL});
  return {handlers,self,showNotification,openWindow,focus,navigate,clients};
}
describe("push-only SW static resource",()=>{
  it("has push and click only; never intercepts fetch or installs a PWA",()=>{
    const {handlers}=installWorker();
    expect([...handlers.keys()].sort()).toEqual([
      "activate","install","notificationclick","push",
    ]);
    expect(source).not.toMatch(/caches\.open|addEventListener\(["']fetch|importScripts/);
  });
  it("accepts training payload and protects external notification target",async()=>{
    const {handlers,showNotification}=installWorker();
    let done:Promise<unknown>|undefined;
    handlers.get("push")!({data:{json:()=>({
      title:"Напоминание о тренировке",body:"Гаф",
      data:{url:"https://attacker.example/courses"},
    })},waitUntil:(p:Promise<unknown>)=>{done=p;}});
    await done;
    expect(showNotification).toHaveBeenCalledOnce();
    expect(showNotification.mock.calls[0]?.[0]).toBe("Напоминание о тренировке");
    const options=showNotification.mock.calls[0]?.[1] as {data:{url:string}};
    expect(options.data.url).toBe("https://refactor.example.test/courses");
  });
  it("tap opens same-origin course, never foreign URL",async()=>{
    const {handlers,openWindow}=installWorker();
    let done:Promise<unknown>|undefined;
    handlers.get("notificationclick")!({
      notification:{data:{url:"//malicious.example/test"},close:vi.fn()},
      waitUntil:(p:Promise<unknown>)=>{done=p;},
    });
    await done;
    expect(openWindow).toHaveBeenCalledWith("https://refactor.example.test/courses");
  });
});
