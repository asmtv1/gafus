import {afterEach,describe,it,expect,vi} from "vitest";
import {projectWalletStatus,projectWalletHistory,getWalletStatus,
  getWalletHistory} from "./walletReadApi";
const status=(overrides:Record<string,unknown>={})=>({
  serverNow:"2026-10-18T12:00:00.000Z",wallet:{balance:8},
  activity:{earned:2,limit:3,windowSeconds:86400,remaining:1,
    nextCapacityAt:null},
  rules:{postReward:1,questionReward:1,answerReward:1,
    reactionThreshold:10,reactionReward:1,bestAnswerReward:1,
    courseStepCost:1,miniGuideCost:1,accessDurationSeconds:604800},
  enabled:{economy:true,earning:true,spending:true},settingsRevision:7,
  accessToken:"PRIVATE_BEARER",privateEmail:"SECRET_MAIL",...overrides,
});
const item=(id="tx1",more:Record<string,unknown>={})=>({
  id,kind:"EARN",delta:1,balanceAfter:8,
  createdAt:"2026-10-18T11:55:00.000Z",rewardKind:"POST_PUBLISHED",
  sourceEntityType:"USER",sourceEntityId:"PRIVATE_USER",
  targetKey:"SECRET_S3",...more,
});
const page=(items:unknown[]=[],nextCursor:string|null=null)=>({
  items,nextCursor,secretToken:"PRIVATE_PAGE",
});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-027 owner wallet typed Hono GET",()=>{
  it("W01 strict projection of wallet and source-only metadata",()=>{
    const projected=projectWalletStatus(status());
    expect(projected.wallet.balance).toBe(8);
    expect(projected.activity.remaining).toBe(1);
    expect(projected.rules.accessDurationSeconds).toBe(604800);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_|SECRET_/);
    const history=projectWalletHistory(page([item()]));
    expect(history.items[0]).toEqual({
      id:"tx1",kind:"EARN",delta:1,balanceAfter:8,
      createdAt:"2026-10-18T11:55:00.000Z",rewardKind:"POST_PUBLISHED",
    });
    expect(JSON.stringify(history)).not.toMatch(/sourceEntity|targetKey|PRIVATE_|SECRET_/);
  });
  it("W02 empty history and disabled economy supported",()=>{
    expect(projectWalletHistory(page()).items).toEqual([]);
    expect(projectWalletStatus(status({enabled:{
      economy:false,earning:false,spending:false,
    }})).enabled.economy).toBe(false);
  });
  it.each([
    ["negative balance",status({wallet:{balance:-1}})],
    ["float balance",status({wallet:{balance:3.5}})],
    ["bad server time",status({serverNow:"INVALID"})],
    ["missing activity",status({activity:null})],
    ["activity impossible",status({activity:{
      earned:1,limit:3,remaining:1,windowSeconds:86400,nextCapacityAt:null,
    }})],
    ["wrong enabled",status({enabled:{economy:"yes",earning:true,spending:true}})],
    ["negative cost",status({rules:{
      postReward:1,questionReward:1,answerReward:1,reactionThreshold:10,
      reactionReward:1,bestAnswerReward:1,courseStepCost:-1,
      miniGuideCost:1,accessDurationSeconds:604800,
    }})],
    ["unknown enabled flag",status({enabled:{
      economy:true,earning:true,spending:true,privateHidden:true,
    }})],
  ])("W03 bad status: %s -> fail closed",(_name,raw)=>{
    expect(()=>projectWalletStatus(raw)).toThrow();
  });
  it.each([
    ["invalid cursor",page([item()],"../bad")],
    ["duplicate id",page([item(),item()])],
    ["bad kind",page([item("tx1",{kind:"OWNER_SECRET"})])],
    ["bad reward",page([item("tx1",{rewardKind:"PRIVATE_REWARD"})])],
    ["bad amount",page([item("tx1",{delta:1.5})])],
    ["bad date",page([item("tx1",{createdAt:"yesterday"})])],
    ["bad transaction id",page([item("../path")])],
    ["missing history object",null],
  ])("W11 bad history: %s -> fail closed",(_name,raw)=>{
    expect(()=>projectWalletHistory(raw)).toThrow();
  });
  it("W19 exact GET endpoints, two cursors; never POST",async()=>{
    const fetcher=vi.fn(async(path:string,_opts:RequestInit)=>{
      const data=path.endsWith("status")?status():page([item()],
        path.includes("cursor=")?null:"next_1");
      return new Response(JSON.stringify({success:true,data}),{status:200});
    });
    vi.stubGlobal("fetch",fetcher);
    expect((await getWalletStatus()).wallet.balance).toBe(8);
    expect((await getWalletHistory()).nextCursor).toBe("next_1");
    expect((await getWalletHistory("next_1")).nextCursor).toBe(null);
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/gafus/status","/api/v1/gafus/history?limit=20",
      "/api/v1/gafus/history?limit=20&cursor=next_1",
    ]);
    expect(fetcher.mock.calls.every(([,opts])=>
      opts.method==="GET"&&opts.credentials==="include"&&
      (opts.headers as Record<string,string>)["X-Gafus-Auth-Transport"]==="cookie"))
      .toBe(true);
  });
  it("W19a forwards AbortSignal to wallet GET without changing auth mode",async()=>{
    const fetcher=vi.fn(async (_path:string,_options:RequestInit)=>
      new Response(JSON.stringify({success:true,data:status()}),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    const controller=new AbortController();
    await getWalletStatus(controller.signal);
    const [,options]=fetcher.mock.calls[0]!;
    expect(options.signal).toBe(controller.signal);
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");
  });
  it("W20 invalid cursor before network",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await expect(getWalletHistory("../no")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401,402,403,404,409,503])("W21 server HTTP %d propagated",async httpStatus=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
      success:false,error:"PRIVATE_SERVER_DETAILS",
    }),{status:httpStatus})));
    await expect(getWalletHistory()).rejects.toMatchObject({status:httpStatus});
  });
});
