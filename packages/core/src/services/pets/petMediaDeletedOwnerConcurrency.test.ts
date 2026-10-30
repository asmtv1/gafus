/** In-process SQL serialization double. NO PostgreSQL and no storage provider.
 * Two independently created worker ports share one owner namespace transaction
 * fence, representing PostgreSQL advisory_xact_lock + cleanup row FOR UPDATE.
 */
import { describe, expect, it, vi } from "vitest";
import { createPetMediaDeletionSqlPort } from "./petMediaDeletionSql";
import { runClaimedPetMediaDeletion, petMediaDedupeKey,
  type PetMediaIntent } from "./petMediaDeletionOutbox";
const owner="owner_A";
const locator="cloudru:documents:documents/uploads/users/owner_A/pets/pet_A/documents/a.pdf";
function claimed(token:string):PetMediaIntent{
  return {id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",ownerId:owner,petId:"pet_A",
    locator,dedupeKey:petMediaDedupeKey(owner,locator),provider:"cloudru-documents",
    reason:"pet-delete",status:"processing",attemptToken:token,
    leaseUntil:new Date(Date.now()+45_000),attempts:1};
}
function fakeDeletedOwnerDatabase(documentReferenced=false){
  let currentToken="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const events:string[]=[];
  let tail=Promise.resolve();
  const query=async(strings:string[],...params:unknown[])=>{
    const sql=strings.join("?");
    if(sql.includes("pg_advisory_xact_lock")){events.push("namespace-fence");return [{lock:1}];}
    if(sql.includes('FROM "User"')){events.push("user-absent");return [];}
    if(sql.includes('FROM "AccountStorageCleanup"')){
      events.push("owner-tombstone-locked");return [{
        id:"account-public-owner_A",scope:"public",status:"pending",leaseUntil:null,
      }];
    }
    if(sql.includes("FROM pg_trigger")){
      events.push("owner-reuse-guard-present");return [{ready:true}];
    }
    if(sql.includes('FROM "PetMediaDeletionIntent"')){
      const token=params.find(x=>typeof x==="string"&&x!==claimed(currentToken).id);
      return token===currentToken?[{id:claimed(currentToken).id}]:[];
    }
    throw Error("UNEXPECTED_SQL_READ");
  };
  const execute=async(strings:string[],...params:unknown[])=>{
    const sql=strings.join("?");
    const token=params.find(x=>typeof x==="string"&&x!==claimed(currentToken).id);
    if(token!==currentToken)return 0;
    if(sql.includes('"leaseUntil"=timezone(\'UTC\',clock_timestamp()) + interval \'120 seconds\'')){
      events.push("intent-row-lock-and-renewal");return 1;
    }
    if(sql.includes('"status"=\'done\'')){
      currentToken="";events.push("sql-completed");return 1;
    }
    if(sql.includes('"status"=\'pending\'')){
      currentToken="";events.push("sql-released");return 1;
    }
    throw Error("UNEXPECTED_SQL_WRITE");
  };
  const tx={
    $queryRaw:vi.fn(query),$executeRaw:vi.fn(execute),
    pet:{count:vi.fn(async()=>0)},
    petDocument:{count:vi.fn(async()=>documentReferenced?1:0)},
  };
  const db={
    $queryRaw:vi.fn(query),$executeRaw:vi.fn(execute),
    $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>{
      let unlock!:()=>void;
      const next=new Promise<void>(resolve=>{unlock=resolve;});
      const previous=tail;tail=next;
      await previous;
      try{return await fn(tx);}finally{unlock();}
    }),
  };
  return {db,tx,events,token:()=>currentToken,setToken:(s:string)=>{currentToken=s;}};
}
describe("WEB2 deleted-owner pending intent handoff, concurrent workers and ACK loss",()=>{
  it("two contenders with same lease cannot double DELETE after owner was removed",async()=>{
    const state=fakeDeletedOwnerDatabase();
    let entered!:()=>void,completeProvider!:()=>void;
    const enteredProvider=new Promise<void>(resolve=>{entered=resolve;});
    const providerRelease=new Promise<void>(resolve=>{completeProvider=resolve;});
    const provider=vi.fn(async()=>{entered();await providerRelease;state.events.push("head-verified");});
    const p1=createPetMediaDeletionSqlPort(state.db as never,provider);
    const p2=createPetMediaDeletionSqlPort(state.db as never,provider);
    const token="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const first=runClaimedPetMediaDeletion(claimed(token),p1);
    await enteredProvider;
    const second=runClaimedPetMediaDeletion(claimed(token),p2);
    // Two distinct processors have read the same pre-commit lease, but the
    // owner namespace lock serializes their provider side effects.
    await Promise.resolve();
    expect(provider).toHaveBeenCalledTimes(1);
    completeProvider();
    expect(await first).toBe("done");
    expect(await second).toBe("stale");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(state.events).toContain("owner-tombstone-locked");
    expect(state.events).toContain("intent-row-lock-and-renewal");
    expect(state.events.indexOf("intent-row-lock-and-renewal"))
      .toBeLessThan(state.events.indexOf("head-verified"));
    expect(state.events).toContain("sql-completed");
  });
  it("deleted User with foreign active document reference returns protected and zero provider I/O",async()=>{
    const state=fakeDeletedOwnerDatabase(true);
    const provider=vi.fn();
    const p=createPetMediaDeletionSqlPort(state.db as never,provider);
    expect(await runClaimedPetMediaDeletion(
      claimed("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),p)).toBe("protected");
    expect(provider).not.toHaveBeenCalled();
    expect(state.events).toContain("owner-tombstone-locked");
    expect(state.events).toContain("sql-released");
  });
  it("provider delete ACK loss leaves token claim retryable, a newer claim confirms absence",async()=>{
    const state=fakeDeletedOwnerDatabase();
    const provider=vi.fn().mockRejectedValueOnce(Error("S3_ACK_LOST"))
      .mockResolvedValueOnce(undefined);
    const p=createPetMediaDeletionSqlPort(state.db as never,provider);
    const first=claimed("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(await runClaimedPetMediaDeletion(first,p)).toBe("retry");
    expect(state.events).toContain("sql-released");
    state.setToken("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(await runClaimedPetMediaDeletion(claimed(state.token()),
      createPetMediaDeletionSqlPort(state.db as never,provider))).toBe("done");
    expect(provider).toHaveBeenCalledTimes(2);
  });
});
