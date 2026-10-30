// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {TrainerOptInRoute} from "./optInRoute";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
describe("Trainer opt-in Vite route",()=>{
 it("mounts real typed consumer, not mock shell",async()=>{const f=vi.fn(async()=>new Response(JSON.stringify({success:true,data:[]}),{status:200,headers:{"cache-control":"private, no-store"}}));await act(async()=>root.render(createElement(TrainerOptInRoute,{pathname:"/main-panel/consultations",actor:{role:"TRAINER",id:"a"},token:"test",fetchImpl:f})));expect(host.querySelector('[data-consumer="trainer-source-preview"]')).not.toBeNull();expect(host.querySelector("main h1")?.textContent).toBe("Консультации");expect(f).toHaveBeenCalledTimes(1);expect(host.textContent).not.toContain("Только макет");});
 it("unknown routes block all API requests",async()=>{const f=vi.fn();await act(async()=>root.render(createElement(TrainerOptInRoute,{pathname:"/main-panel/articles",actor:{role:"TRAINER",id:"a"},token:"test",fetchImpl:f})));expect(f).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')).not.toBeNull();});
});
