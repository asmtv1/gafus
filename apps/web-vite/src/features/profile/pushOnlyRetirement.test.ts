import {describe,expect,it,vi} from "vitest";
import {retireLegacyPwa,type LegacyRegistration} from "../../shared/pwa-retirement/retireLegacyPwa";

describe("push-only SW and safe legacy retirement coexist",()=>{
  it("retires historical /sw.js but never unregisters new /push-sw.js",async()=>{
    const origin="https://refactor.example.test";
    const old:LegacyRegistration={scope:origin+"/",active:{scriptURL:origin+"/sw.js"},
      unregister:vi.fn(async()=>true)};
    const push:LegacyRegistration={scope:origin+"/",active:{scriptURL:origin+"/push-sw.js"},
      unregister:vi.fn(async()=>true)};
    const result=await retireLegacyPwa({origin,serviceWorker:{
      getRegistrations:async()=>[old,push],
    }});
    expect(result).toEqual({unregistered:1,cachesDeleted:[],failures:0});
    expect(old.unregister).toHaveBeenCalledOnce();
    expect(push.unregister).not.toHaveBeenCalled();
  });
});
