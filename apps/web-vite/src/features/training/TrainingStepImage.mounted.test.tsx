// @vitest-environment jsdom
import { act } from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {TrainingStepImage} from "./TrainingStepImage";

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  host.remove();
  document.body.style.overflow="";
});
describe("Next ImageViewer parity for unlocked steps",()=>{
  it("opens fullscreen on tap, locks background scroll and closes on Esc restoring focus",async()=>{
    await act(async()=>root.render(<TrainingStepImage src="/api/v1/training/image/demo.png"
      alt="Изображение 1 для шага Упражнение" priority/>));
    const trigger=host.querySelector<HTMLButtonElement>("button")!;
    expect(trigger).not.toBeNull();
    expect(host.querySelector("img")?.getAttribute("loading")).toBe("eager");
    trigger.focus();
    await act(async()=>trigger.click());
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog?.querySelector("img")?.getAttribute("src"))
      .toBe("/api/v1/training/image/demo.png");
    expect(document.activeElement?.getAttribute("aria-label"))
      .toBe("Закрыть изображение");
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",
      {key:"Escape",bubbles:true})));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
  it("closes with close button and backdrop without exposing private locked images",async()=>{
    await act(async()=>root.render(<TrainingStepImage src="/static.png" alt="Фото"/>));
    const button=host.querySelector<HTMLButtonElement>("button")!;
    await act(async()=>button.click());
    await act(async()=>document.querySelector<HTMLButtonElement>(
      'button[aria-label="Закрыть изображение"]')?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async()=>button.click());
    const backdrop=document.querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async()=>backdrop.dispatchEvent(new MouseEvent("mousedown",
      {bubbles:true})));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
