import {describe,expect,it,vi} from "vitest";
import {createChat2Draft} from "./draft";
describe("room-local draft subscription",()=>{
  it("notifies only subscribers of that room and only when text changes",()=>{
    const first=createChat2Draft("a"),second=createChat2Draft("b");
    const a=vi.fn(),b=vi.fn();
    const stop=first.subscribe(a);second.subscribe(b);
    first.set("a");first.set("new");first.set("new");
    expect(a).toHaveBeenCalledOnce();expect(b).not.toHaveBeenCalled();
    expect(first.getSnapshot()).toBe("new");expect(second.getSnapshot()).toBe("b");
    stop();first.set("");expect(a).toHaveBeenCalledOnce();
  });
});
