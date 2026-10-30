// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {ConsultationConsumerPreview} from "./ConsultationConsumerPreview";
vi.mock("./consultationHttpConsumer",()=>({callTrainerConsultationMethod:vi.fn()}));
import {callTrainerConsultationMethod} from "./consultationHttpConsumer";
let root:Root;let host:HTMLDivElement;
const actor={id:"trainer-a",role:"TRAINER" as const};
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);vi.mocked(callTrainerConsultationMethod).mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("logout, role, owner, epoch change fences post-await success even if async session changed without rerender",async()=>{
 for(const next of [null,{actor:{...actor,role:"USER" as const},token:"jwt",authEpoch:"a"},{actor:{...actor,id:"trainer-b"},token:"jwt",authEpoch:"a"},{actor,token:"jwt",authEpoch:"b"}]){
  let finish!:(v:unknown[])=>void;vi.mocked(callTrainerConsultationMethod).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  let live:{actor:typeof actor|{id:string;role:"USER"};token:string|null;authEpoch?:string}|null={actor,token:"jwt",authEpoch:"a"};
  await act(async()=>root.render(createElement(ConsultationConsumerPreview,{pathname:"/main-panel/consultations",actor,token:"jwt",authEpoch:"a",fetchImpl:fetch,getCurrentSession:()=>live})));
  live=next;
  await act(async()=>finish([]));
  expect(host.textContent).not.toContain("Данные получены");
  await act(async()=>root.unmount());root=createRoot(host);
 }
});
