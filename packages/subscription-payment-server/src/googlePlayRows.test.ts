import {beforeEach, describe, expect, it, vi} from "vitest";
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  appSubscription: {findUnique:vi.fn(),findFirst:vi.fn(),upsert:vi.fn(),update:vi.fn(),updateMany:vi.fn()},
  user: {findUnique:vi.fn(),findUniqueOrThrow:vi.fn()},
}));
const state = vi.hoisted(() => ({inside:false,version:"100",superseded:false,exists:true}));
vi.mock("@gafus/prisma",()=>({prisma:{
  ...db,
  $transaction:async (fn:(tx:typeof db)=>Promise<unknown>)=>{
    state.inside=true;
    try{return await fn(db);}finally{state.inside=false;}
  },
}}));
import {persistGooglePlayPurchase,markGooglePlayReconciliationFailure,type GooglePlayPersistencePurchase,type GooglePlayPersistenceSnapshot} from "./googlePlayRows";

const purchase:GooglePlayPersistencePurchase={
  externalAccountIdentifiers:{obfuscatedExternalAccountId:"account"},
  subscriptionState:"SUBSCRIPTION_STATE_ACTIVE",
  startTime:"2026-11-01T00:00:00Z",
};
const snapshot:GooglePlayPersistenceSnapshot={
  entitled:true,pending:false,acknowledgeProduct:"premium",
  data:{status:"ACTIVE",planCode:"MONTHLY",currentPeriodStart:new Date("2026-11-01"),
    currentPeriodEnd:new Date("2026-12-01"),cancelAtPeriodEnd:false,googlePlayCheckedAt:new Date()},
};
const makeError=(code:string)=>new Error(code);
const classifyPurchase=vi.fn(()=>snapshot);
beforeEach(()=>{
  vi.resetAllMocks();
  Object.assign(state,{inside:false,version:"100",superseded:false,exists:true});
  db.$queryRaw.mockImplementation(async (strings:TemplateStringsArray)=>{
    if(strings.join("").includes("xmin")) return state.exists?[{
      userId:"owner",version:state.version,googlePlaySupersededAt:state.superseded?new Date():null,
    }]:[];
    return [];
  });
  db.user.findUnique.mockResolvedValue({id:"owner"});
  db.user.findUniqueOrThrow.mockResolvedValue({googlePlayAccountId:"account"});
  db.appSubscription.findUnique.mockResolvedValue(null);
  db.appSubscription.findFirst.mockResolvedValue(null);
});
describe("Google Play optimistic verified snapshot",()=>{
  it("performs the provider read outside SQL transactions, then binds identity under lock",async()=>{
    const readPurchase=vi.fn(async()=>{expect(state.inside).toBe(false);return purchase;});
    await expect(persistGooglePlayPurchase("token","owner",{readPurchase,classifyPurchase,makeError})).resolves.toMatchObject({entitled:true});
    expect(readPurchase).toHaveBeenCalledOnce();
    expect(db.appSubscription.upsert).toHaveBeenCalledOnce();
  });
  it("discards a provider response if another writer changed the row during the request",async()=>{
    const old={...purchase,subscriptionState:"SUBSCRIPTION_STATE_EXPIRED"};
    let calls=0;
    const readPurchase=vi.fn(async()=>{expect(state.inside).toBe(false);if(++calls===1){state.version="101";return old;}return purchase;});
    await expect(persistGooglePlayPurchase("token","owner",{readPurchase,classifyPurchase,makeError})).resolves.toMatchObject({entitled:true});
    expect(readPurchase).toHaveBeenCalledTimes(2);
    expect(classifyPurchase).toHaveBeenCalledExactlyOnceWith(purchase,expect.any(Date));
    expect(db.appSubscription.upsert).toHaveBeenCalledOnce();
  });
  it("never resurrects a superseded token even if the old provider request succeeds",async()=>{
    const readPurchase=vi.fn(async()=>{state.superseded=true;state.version="101";return purchase;});
    await expect(persistGooglePlayPurchase("token","owner",{readPurchase,classifyPurchase,makeError})).resolves.toMatchObject({entitled:false});
    expect(db.appSubscription.upsert).not.toHaveBeenCalled();
  });
  it("binds a new callback only to the verified account and rejects a foreign caller",async()=>{
    state.exists=false;
    const readPurchase=vi.fn(async()=>purchase);
    await expect(persistGooglePlayPurchase("token",undefined,{readPurchase,classifyPurchase,makeError})).resolves.toMatchObject({entitled:true});
    expect(db.appSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({userId:"owner"})}));
    db.user.findUniqueOrThrow.mockResolvedValue({googlePlayAccountId:"foreign"});
    await expect(persistGooglePlayPurchase("token","foreign",{readPurchase,classifyPurchase,makeError})).rejects.toThrow("OWNER_MISMATCH");
  });
  it("bounds retries when a competing writer changes every observed version",async()=>{
    const readPurchase=vi.fn(async()=>{state.version=String(Number(state.version)+1);return purchase;});
    await expect(persistGooglePlayPurchase("token","owner",{readPurchase,classifyPurchase,makeError})).rejects.toThrow("UNAVAILABLE");
    expect(readPurchase).toHaveBeenCalledTimes(3);
    expect(db.appSubscription.upsert).not.toHaveBeenCalled();
  });
  it("does not let a failed reconciliation rotate a later successful check",async()=>{
    const observed=new Date("2026-11-01");
    await markGooglePlayReconciliationFailure("token",observed);
    expect(db.appSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{googlePlayPurchaseToken:"token",googlePlayCheckedAt:observed,googlePlaySupersededAt:null},
    }));
  });
});
