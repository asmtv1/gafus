// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadonlyTrainingStepList } from "./TrainingDayViewer";
import { SafeCourseDescriptionMarkdown } from "./SafeCourseDescriptionMarkdown";
import type { TrainingStepPreview } from "./trainingDayApi";

let root:Root, host:HTMLDivElement;
const description=[
  "# Подготовка", "Тренируем **выдержку** и *внимание*, ~~без крика~~.",
  "## Упражнения", "- Первая часть\\n- Вторая часть".replace("\\n","\n"),
  "1. Наблюдаем\\n2. Поощряем".replace("\\n","\n"),
  "- [x] Знакомая команда\\n- [ ] Новая команда".replace("\\n","\n"),
  "> Выполняйте без стресса.",
  "`СИДЕТЬ`", "```txt\nКОМАНДА ШАГА\n```",
  "| Команда | Минуты |\n| --- | --- |\n| Место | 5 |",
  "[Полезный материал](https://example.org/article)",
  "![Разрешённая схема](/images/training/diagram.png)",
  "![Обложка CDN](https://fupiquafifeswu.begetcdn.cloud/images/step.png)",
  "![Слежение](https://evil.invalid/collect.png)",
  "[Опасная ссылка](javascript:alert(1))",
  "<iframe src=\"https://evil.invalid/embed\"></iframe>",
].join("\n\n");
const step:TrainingStepPreview={
  id:"step_1",title:"Спокойная тренировка",type:"PRACTICE",description,
  status:"NOT_STARTED",order:0,durationSec:0,locked:false,
  videoUrl:null,imageUrls:[],
};
async function mount(element:React.ReactNode){
  await act(async()=>root.render(element));
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("NO_NETWORK_FROM_MARKDOWN");}));
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});
describe("Next StepContent Markdown/GFM parity with safe origin rules",()=>{
  it("renders a step only after expanding, with full GFM and safe images",async()=>{
    await mount(<ReadonlyTrainingStepList steps={[step]} nextRoute/>);
    expect(host.querySelector(".training-description-markdown--step")).toBeNull();
    const trigger=host.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async()=>trigger?.click());
    const area=host.querySelector<HTMLElement>(".training-description-markdown--step");
    expect(area?.querySelector("h1")?.textContent).toBe("Подготовка");
    expect(area?.querySelector("h2")?.textContent).toBe("Упражнения");
    expect(area?.querySelector("strong")?.textContent).toBe("выдержку");
    expect(area?.querySelector("em")?.textContent).toBe("внимание");
    expect(area?.querySelector("del")?.textContent).toBe("без крика");
    expect(area?.querySelectorAll("ul > li").length).toBeGreaterThanOrEqual(4);
    expect(area?.querySelector("ol > li")?.textContent).toContain("Наблюдаем");
    expect(area?.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(area?.querySelector('input[type="checkbox"]')?.hasAttribute("disabled")).toBe(true);
    expect(area?.querySelectorAll("img")).toHaveLength(2);
    expect(area?.querySelector('img[src="/images/training/diagram.png"]')).not.toBeNull();
    expect(area?.querySelector('img[src^="https://fupiquafifeswu.begetcdn.cloud/"]')).not.toBeNull();
    expect(area?.querySelector('img[src*="evil.invalid"]')).toBeNull();
    expect(area?.querySelector("blockquote")?.textContent).toContain("без стресса");
    expect(area?.querySelector("pre code")?.textContent).toContain("КОМАНДА ШАГА");
    expect(area?.querySelector("table tbody td")?.textContent).toBe("Место");
    expect(area?.querySelector('a[href="https://example.org/article"]')).not.toBeNull();
    expect(area?.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(area?.querySelector("script,iframe,video")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("does not expose a locked step's private description",async()=>{
    await mount(<ReadonlyTrainingStepList steps={[{...step,locked:true}]} nextRoute/>);
    expect(host.querySelector(".training-description-markdown--step")).toBeNull();
    expect(host.textContent).not.toContain("КОМАНДА ШАГА");
  });
  it("course description stays text-only, not a remote image or task control",async()=>{
    await mount(<SafeCourseDescriptionMarkdown description={description}/>);
    expect(host.querySelector("h1")?.textContent).toBe("Подготовка");
    expect(host.querySelector("img,input")).toBeNull();
    expect(host.querySelector(".training-description-markdown--step")).toBeNull();
  });
});
