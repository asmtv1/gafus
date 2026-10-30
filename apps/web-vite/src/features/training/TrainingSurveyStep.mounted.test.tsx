// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { TrainingStepPreview } from "./trainingDayApi";
import type { TrainingDaySummary } from "./trainingDaysApi";
import { TrainingSurveyStep } from "./TrainingSurveyStep";

const stepId="c"+"x".repeat(24);
const userStepId="c"+"u".repeat(24);
const day={
  courseId:"course_01",dayOnCourseId:"day_01",trainingDayId:"physical_01",
  title:"День",type:"TRAINING",isLocked:false,userStatus:"IN_PROGRESS",
  estimatedDuration:2,theoryMinutes:0,equipment:"",
} as TrainingDaySummary;
const step={
  id:stepId,title:"Анкета",description:"",type:"SURVEY",order:0,
  locked:false,status:"NOT_STARTED",durationSec:0,videoUrl:null,imageUrls:[],
  surveySlug:"separation-anxiety-screening",
} as TrainingStepPreview;
const template={
  slug:step.surveySlug,familySlug:"separation-anxiety",phase:"INITIAL",
  version:1,title:"Анкета тревожности",description:"Расскажите о питомце",
  sections:[{id:"section1",title:"Поведение"}],
  questions:[
    {id:"petname",sectionId:"section1",type:"text",title:"Кличка",required:true},
    {id:"frequency",sectionId:"section1",type:"singleChoice",
      title:"Как часто?",required:true,options:[
        {label:"Редко",value:"rare"},{label:"Часто",value:"often"}]},
  ],
};
const response=(answers:Record<string,unknown>)=>({
  id:"response1",userId:"owner_A",courseId:day.courseId,stepId:step.id,
  surveySlug:step.surveySlug,surveyFamilySlug:"separation-anxiety",
  petId:null,phase:"INITIAL",surveyVersion:1,answers,
  submittedAt:new Date().toISOString(),
  editableUntil:new Date(Date.now()+3600_000).toISOString(),canEdit:true,
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
let host:HTMLDivElement,root:Root,cache:QueryClient;
async function tick() {
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,45));});
}
async function mount(theStep=step) {
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <TrainingSurveyStep userId="owner_A" courseType="COURSE" day={day} step={theStep}/>
  </QueryClientProvider>));
  await tick();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"owner_A",role:"USER",username:"A"});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();cache.clear();
  sessionStorage.clear();vi.unstubAllGlobals();});
describe("SURVEY Next-equivalent authenticated step flow",()=>{
  it("read-only open, required validation, authenticated submit, server re-read",async()=>{
    let saved:Record<string,unknown>|null=null;
    const fetcher=vi.fn(async(path:string,options:RequestInit)=>{
      if(path.startsWith("/api/v1/surveys/separation-anxiety-screening?"))
        return ok({template,response:saved?response(saved):null});
      if(path.startsWith("/api/v1/training/day?"))
        return ok({courseId:day.courseId,dayOnCourseId:day.dayOnCourseId,
          steps:[{id:step.id,order:step.order,type:"SURVEY",locked:false,
            surveySlug:step.surveySlug,userStepId}]});
      if(path==="/api/v1/surveys/separation-anxiety-screening/response"){
        saved=(JSON.parse(String(options.body)) as {answers:Record<string,unknown>}).answers;
        return new Response(JSON.stringify({success:true,response:response(saved)}),{status:200});
      }
      throw Error("UNEXPECTED_SURVEY_PATH");
    });
    vi.stubGlobal("fetch",fetcher);
    await mount();
    expect(host.textContent).toContain("Анкета тревожности");
    expect(fetcher.mock.calls.every(([_,req])=>req.method==="GET")).toBe(true);
    const submit=host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    const inputs=host.querySelectorAll<HTMLInputElement>("input");
    await act(async()=>{const setter=Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,"value")!.set!;
      setter.call(inputs[0],"Рекс");inputs[0].dispatchEvent(new Event("input",{bubbles:true}));
      inputs[2].click();});
    await tick();
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    await act(async()=>host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    await tick();
    expect(saved).toEqual({petname:"Рекс",frequency:"often"});
    expect(host.textContent).toContain("подтверждена сервером");
    expect(fetcher.mock.calls.filter(([path])=>path.endsWith("/response")))
      .toHaveLength(1);
  });
  it("unknown POST ACK blocks retries without clearing the draft",async()=>{
    let postCount=0;
    vi.stubGlobal("fetch",vi.fn(async(path:string)=>{
      if(path.startsWith("/api/v1/surveys/separation-anxiety-screening?"))
        return ok({template,response:null});
      if(path.startsWith("/api/v1/training/day?"))
        return ok({courseId:day.courseId,dayOnCourseId:day.dayOnCourseId,
          steps:[{id:step.id,order:step.order,type:"SURVEY",locked:false,
            surveySlug:step.surveySlug,userStepId}]});
      if(path.endsWith("/response")){postCount++;throw Error("ACK_LOST");}
      throw Error("UNEXPECTED");
    }));
    await mount();
    const inputs=host.querySelectorAll<HTMLInputElement>("input");
    await act(async()=>{const setter=Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,"value")!.set!;
      setter.call(inputs[0],"Рекс");inputs[0].dispatchEvent(new Event("input",{bubbles:true}));
      inputs[1].click();});
    await tick();
    await act(async()=>host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    await tick();
    expect(postCount).toBe(1);
    expect(host.textContent).toContain("Повторная отправка заблокирована");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
  it("FINAL comparison refreshes after confirmed POST rather than waiting for a reload",async()=>{
    let saved:Record<string,unknown>|null=null;
    let compared=0;
    const final={...template,phase:"FINAL"};
    const fetcher=vi.fn(async(path:string,options:RequestInit)=>{
      if(path.startsWith("/api/v1/surveys/separation-anxiety-screening?"))
        return ok({template:final,response:saved?response(saved):null});
      if(path.startsWith("/api/v1/surveys/comparison?")){
        compared++;
        return ok(saved?{familySlug:template.familySlug,
          initialSubmittedAt:new Date().toISOString(),
          finalSubmittedAt:new Date().toISOString(),
          items:[{questionId:"petname",label:"Кличка",before:"Бим",
            after:"Рекс",changed:true}]}:null);
      }
      if(path.startsWith("/api/v1/training/day?"))
        return ok({courseId:day.courseId,dayOnCourseId:day.dayOnCourseId,
          steps:[{id:step.id,order:step.order,type:"SURVEY",locked:false,
            surveySlug:step.surveySlug,userStepId}]});
      if(path.endsWith("/response")){
        saved=(JSON.parse(String(options.body)) as {answers:Record<string,unknown>}).answers;
        return new Response(JSON.stringify({success:true,response:response(saved)}),{status:200});
      }
      throw Error("UNEXPECTED_FINAL_SURVEY_PATH");
    });
    vi.stubGlobal("fetch",fetcher);
    await mount();
    const inputs=host.querySelectorAll<HTMLInputElement>("input");
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
      setter.call(inputs[0],"Рекс");inputs[0].dispatchEvent(new Event("input",{bubbles:true}));
      inputs[1].click();
    });
    await tick();
    await act(async()=>host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    await tick();
    expect(host.textContent).toContain("подтверждена сервером");
    expect(host.textContent).toContain("Динамика до и после");
    expect(host.textContent).toContain("Бим");
    expect(host.textContent).toContain("Рекс");
    expect(compared).toBeGreaterThanOrEqual(2);
    expect(fetcher.mock.calls.filter(([path])=>path.endsWith("/response"))).toHaveLength(1);
  });
  it("authoritative 423 expired edit is shown without falsely claiming lost ACK",async()=>{
    const sent=response({petname:"Рекс",frequency:"rare"});
    const fetcher=vi.fn(async(path:string)=>{
      if(path.startsWith("/api/v1/surveys/separation-anxiety-screening?"))
        return ok({template,response:sent});
      if(path.startsWith("/api/v1/training/day?"))
        return ok({courseId:day.courseId,dayOnCourseId:day.dayOnCourseId,
          steps:[{id:step.id,order:step.order,type:"SURVEY",locked:false,
            surveySlug:step.surveySlug,userStepId}]});
      if(path.endsWith("/response"))return new Response(JSON.stringify({
        success:false,error:"Редактирование закрыто",code:"SURVEY_EDIT_WINDOW_EXPIRED",
      }),{status:423});
      throw Error("UNEXPECTED_423_PATH");
    });
    vi.stubGlobal("fetch",fetcher);
    await mount();
    await act(async()=>host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    await tick();
    expect(host.textContent).toContain("Срок редактирования анкеты истёк");
    expect(host.textContent).not.toContain("Результат отправки неизвестен");
    expect(fetcher.mock.calls.filter(([path])=>path.endsWith("/response"))).toHaveLength(1);
  });
  it("locked SURVEY never loads template or creates UserStep",async()=>{
    const fetcher=vi.fn();
    vi.stubGlobal("fetch",fetcher);
    await mount({...step,locked:true});
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.querySelector("input")).toBeNull();
  });
});
