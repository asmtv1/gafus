// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,describe,expect,it,vi} from "vitest";
import {MomentLocalMediaPreview} from "./MomentLocalMediaPreview";

afterEach(()=>vi.unstubAllGlobals());
describe("Moments photo client failure UI",()=>{
  it("overlays an accessible circular retry only on the failed thumbnail",async()=>{
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    let n=0;
    const NativeURL=URL;
    class PreviewUrl extends NativeURL {
      static createObjectURL=vi.fn(()=>`blob:moment-photo-${++n}`);
      static revokeObjectURL=vi.fn();
    }
    vi.stubGlobal("URL",PreviewUrl);
    const files=[new File(["ok"],"good.jpg",{type:"image/jpeg"}),
      new File(["failed"],"bad.jpg",{type:"image/jpeg"})];
    const retry=vi.fn();const remove=vi.fn();
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);
    try{
      await act(async()=>root.render(createElement(MomentLocalMediaPreview,{
        files,disabled:false,failures:[undefined,"Не удалось обработать на устройстве"],
        onRetry:retry,onRemove:remove,
      })));
      expect(host.querySelectorAll("img")).toHaveLength(2);
      const actions=host.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Повторить обработку фото"]');
      expect(actions).toHaveLength(1);
      expect(actions[0]?.getAttribute("aria-label")).toContain("bad.jpg");
      expect(actions[0]?.closest("li")?.querySelector("img")?.getAttribute("src"))
        .toBe("blob:moment-photo-2");
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("устройстве");
      await act(async()=>actions[0]?.click());
      expect(retry).toHaveBeenCalledExactlyOnceWith(1);
      expect(remove).not.toHaveBeenCalled();
    }finally{await act(async()=>root.unmount());host.remove();}
    expect(PreviewUrl.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
