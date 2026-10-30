import {describe,it,expect,vi,afterEach} from "vitest";
import {enqueuePetMediaDeletionIntent,consumePetMediaUploadReservation,
  createPetMediaDeletionSqlPort,claimOnePetMediaDeletion,petMediaOutboxEnabled,
} from "./petMediaDeletionSql";
const owner="owner_A",pet="pet_A";
const locator="cloudru:documents:documents/uploads/users/owner_A/pets/pet_A/documents/a.pdf";
const mock=(value=1)=>({$executeRaw:vi.fn(async()=>value)});
afterEach(()=>vi.unstubAllEnvs());
describe("WEB2 SQL outbox adapter (no PostgreSQL connection)",()=>{
  it("is default-off until the additive schema is deliberately activated",()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","false");
    expect(petMediaOutboxEnabled()).toBe(false);
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    expect(petMediaOutboxEnabled()).toBe(true);
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","truu");
    expect(()=>petMediaOutboxEnabled()).toThrow("PET_MEDIA_OUTBOX_CONFIGURATION_INVALID");
  });
  it("enqueues candidate inside caller transaction with explicit provider and dedupe",async()=>{
    const tx=mock();const at=new Date("2030-01-01T00:00:00.000Z");
    const key=await enqueuePetMediaDeletionIntent(tx as never,owner,pet,locator,"candidate",at);
    expect(key).toHaveLength(64);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    const [strings,...params]=tx.$executeRaw.mock.calls[0]! as unknown as [string[],...unknown[]];
    expect(strings.join("?")).toContain('INSERT INTO "PetMediaDeletionIntent"');
    expect(strings.join("?")).toContain('ON CONFLICT ("ownerId","dedupeKey") DO NOTHING');
    expect(params).toContain("cloudru-documents");
    expect(params).toContain(locator);
    expect(params).toContain("candidate");
    expect(params).toContain(at);
  });
  it("invalid foreign object aborts before any transactional SQL",async()=>{
    const tx=mock();
    await expect(enqueuePetMediaDeletionIntent(tx as never,owner,pet,
      locator.replace("owner_A","owner_B"),"document-delete")).rejects.toThrow();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("consumes only still pending not-yet-due reservation in same commit",async()=>{
    const tx=mock(1);
    await consumePetMediaUploadReservation(tx as never,owner,locator);
    const [sql]=tx.$executeRaw.mock.calls[0]! as unknown as [string[]];
    expect(sql.join("?")).toContain("'pending'");
    expect(sql.join("?")).toContain("'candidate'");
    expect(sql.join("?")).toContain('"availableAt" > timezone');
    const raced=mock(0);
    await expect(consumePetMediaUploadReservation(raced as never,owner,locator))
      .rejects.toThrow("PET_MEDIA_CANDIDATE_RESERVATION_UNSAFE");
  });
  it("uses owner-lock + active Pet/PetDocument check before provider invocation",async()=>{
    const statements:string[]=[];
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?"); statements.push(sql);
        return sql.includes('FROM "AccountStorageCleanup"')?[]:[{id:owner}];
      }),
      $executeRaw:vi.fn(async()=>1),
      pet:{count:vi.fn(async()=>0)},
      petDocument:{count:vi.fn(async()=>1)},
    };
    const db={$queryRaw:vi.fn(async()=>[{id:owner}]),
      $executeRaw:vi.fn(async()=>1),
      $transaction:vi.fn(async(callback:(tx:typeof tx)=>Promise<unknown>)=>callback(tx))};
    const deleted=vi.fn();
    const port=createPetMediaDeletionSqlPort(db as never,deleted);
    const protectedKey=await port.withOwnerFence(owner,()=>port.hasActiveReference(locator));
    expect(protectedKey).toBe(true);
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements[1]).toContain('FROM "User" WHERE "id"=? FOR UPDATE');
    expect(statements[2]).toContain('FROM "AccountStorageCleanup"');
    expect(tx.pet.count).toHaveBeenCalledWith({where:{photoUrl:locator}});
    expect(tx.petDocument.count).toHaveBeenCalledWith({where:{url:locator}});
    expect(deleted).not.toHaveBeenCalled();
    await expect(port.hasActiveReference(locator)).rejects.toThrow("PET_MEDIA_OWNER_FENCE_REQUIRED");
  });
  it("deleted User with durable public cleanup witness can complete using namespace fence",async()=>{
    const statements:string[]=[];
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?"); statements.push(sql);
        if(sql.includes('FROM "User"'))return [];
        if(sql.includes("FROM pg_trigger"))return [{ready:true}];
        return [{id:"account-storage-public-owner_A",scope:"public",status:"pending",leaseUntil:null}];
      }),
      $executeRaw:vi.fn(async()=>1),
      pet:{count:vi.fn(async()=>0)},petDocument:{count:vi.fn(async()=>0)},
    };
    const db={$queryRaw:vi.fn(async()=>[]),$executeRaw:vi.fn(async()=>1),
      $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
    const provider=vi.fn(async()=>undefined);
    const port=createPetMediaDeletionSqlPort(db as never,provider);
    const result=await port.withOwnerFence(owner,async()=>{
      expect(await port.hasActiveReference(locator)).toBe(false);
      await port.deleteAndVerify("cloudru-documents",locator);
      return port.complete("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    });
    expect(result).toBe(true);
    expect(provider).toHaveBeenCalledOnce();
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements[1]).toContain('FROM "User" WHERE "id"=? FOR UPDATE');
    expect(statements[2]).toContain("\"scope\" IN ('public','documents')");
    expect(statements[2]).toContain('ORDER BY "scope" FOR UPDATE');
    expect(tx.pet.count).toHaveBeenCalledWith({where:{photoUrl:locator}});
    expect(tx.petDocument.count).toHaveBeenCalledWith({where:{url:locator}});
  });
  it.each([
    {state:"missing both User and tombstone",user:false,tombstone:false},
    {state:"reused User id with old account tombstone",user:true,tombstone:true},
  ])("fails closed for $state and performs zero provider deletes",async input=>{
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?");
        if(sql.includes('FROM "User"'))return input.user?[{id:owner}]:[];
        if(sql.includes('FROM "AccountStorageCleanup"'))
          return input.tombstone?[{id:"account-public",scope:"public",status:"pending",leaseUntil:null}]:[];
        return [{lock:true}];
      }),
    };
    const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),
      $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
    const provider=vi.fn();
    const port=createPetMediaDeletionSqlPort(db as never,provider);
    await expect(port.withOwnerFence(owner,async()=>{
      await port.deleteAndVerify("cloudru-documents",locator);
    })).rejects.toThrow("PET_MEDIA_OWNER_NAMESPACE_UNVERIFIED");
    expect(provider).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
  it("deleted-owner tombstone handoff still rejects a live reference globally",async()=>{
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?");
        if(sql.includes('FROM "User"'))return [];
        if(sql.includes("FROM pg_trigger"))return [{ready:true}];
        return [{id:"account-public",scope:"public",status:"pending",leaseUntil:null}];
      }),
      $executeRaw:vi.fn(async()=>1),
      pet:{count:vi.fn(async()=>0)},petDocument:{count:vi.fn(async()=>1)},
    };
    const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),
      $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
    const provider=vi.fn();
    const port=createPetMediaDeletionSqlPort(db as never,provider);
    expect(await port.withOwnerFence(owner,()=>port.hasActiveReference(locator))).toBe(true);
    expect(provider).not.toHaveBeenCalled();
    expect(tx.petDocument.count).toHaveBeenCalledWith({where:{url:locator}});
  });
  it("holds public/documents tombstones and defers an active AccountCleanup sweep",async()=>{
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?");
        if(sql.includes('FROM "User"'))return [];
        if(sql.includes('FROM "AccountStorageCleanup"'))return [
          {id:"public",scope:"public",status:"pending",leaseUntil:null},
          {id:"documents",scope:"documents",status:"processing",
            leaseUntil:new Date(Date.now()+60_000)},
        ];
        return [{lock:true}];
      }),
    };
    const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),
      $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
    const provider=vi.fn();
    await expect(createPetMediaDeletionSqlPort(db as never,provider)
      .withOwnerFence(owner,async()=>provider())).rejects.toThrow(
        "PET_MEDIA_ACCOUNT_CLEANUP_IN_FLIGHT");
    expect(provider).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.map(([strings])=>(strings as string[]).join("?")))
      .toEqual(expect.arrayContaining([expect.stringContaining(
        'ORDER BY "scope" FOR UPDATE')]));
  });
  it("deleted-owner provider call stays blocked until reviewed User ID-reuse guard exists",async()=>{
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?");
        if(sql.includes('FROM "User"'))return [];
        if(sql.includes("FROM pg_trigger"))return [{ready:false}];
        return [{id:"public",scope:"public",status:"done",leaseUntil:null}];
      }),
    };
    const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),
      $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
    const provider=vi.fn();
    await expect(createPetMediaDeletionSqlPort(db as never,provider)
      .withOwnerFence(owner,async()=>provider())).rejects.toThrow(
        "PET_MEDIA_OWNER_REUSE_GUARD_NOT_INSTALLED");
    expect(provider).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.map(([strings])=>(strings as string[]).join("?")))
      .toEqual(expect.arrayContaining([expect.stringContaining(
        "t.tgname = 'pet_media_owner_namespace_guard'")]));
    expect(tx.$queryRaw.mock.calls.map(([strings])=>(strings as string[]).join("?")))
      .toEqual(expect.arrayContaining([expect.stringContaining(
        "to_regprocedure('\"pet_media_owner_namespace_guard_fn\"()')")]));
  });
  it("pins claimed row and renews inside provider transaction, never from initial read",async()=>{
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>{
        const sql=strings.join("?");
        if(sql.includes('FROM "AccountStorageCleanup"'))return [];
        return [{id:owner}];
      }),
      $executeRaw:vi.fn(async()=>1),
      pet:{count:vi.fn(async()=>0)},petDocument:{count:vi.fn(async()=>0)},
    };
    const db={
      $queryRaw:vi.fn(async()=>[{id:"claimed"}]),
      $executeRaw:vi.fn(),
      $transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx)),
    };
    const port=createPetMediaDeletionSqlPort(db as never,vi.fn());
    const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const token="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(await port.isLeaseCurrent(id,token)).toBe(true);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const same=await port.withOwnerFence(owner,()=>port.isLeaseCurrent(id,token));
    expect(same).toBe(true);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    const [template,...params]=tx.$executeRaw.mock.calls[0]! as unknown as [string[],...unknown[]];
    const sql=template.join("?");
    expect(sql).toContain('UPDATE "PetMediaDeletionIntent" SET');
    expect(sql).toContain("\"leaseUntil\"=timezone('UTC',clock_timestamp()) + interval '120 seconds'");
    expect(sql).toContain('"attemptToken"=?::uuid');
    expect(sql).toContain("\"leaseUntil\">timezone('UTC',clock_timestamp())");
    expect(params).toContain(id);
    expect(params).toContain(token);
  });
  it("expired claim cannot acquire provider I/O row lock even inside owner fence",async()=>{
    const tx={
      $queryRaw:vi.fn(async(strings:string[])=>strings.join("?").includes('FROM "AccountStorageCleanup"')
        ? []:[{id:owner}]),
      $executeRaw:vi.fn(async()=>0),
    };
    const db={$queryRaw:vi.fn(async()=>[{id:"claimed"}]),
      $executeRaw:vi.fn(),$transaction:vi.fn(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx))};
    const port=createPetMediaDeletionSqlPort(db as never,vi.fn());
    expect(await port.withOwnerFence(owner,()=>port.isLeaseCurrent(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"))).toBe(false);
  });
  it("an expired lease cannot rewrite or reschedule the next attempt",async()=>{
    const db={$queryRaw:vi.fn(async()=>[]),$executeRaw:vi.fn(async()=>0),
      $transaction:vi.fn()};
    const port=createPetMediaDeletionSqlPort(db as never,vi.fn());
    await port.release("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",5000);
    const [template]=db.$executeRaw.mock.calls[0]! as unknown as [string[]];
    expect(template.join("?")).toContain("\"leaseUntil\">timezone('UTC',clock_timestamp())");
    expect(template.join("?")).toContain('"attemptToken"=?::uuid');
  });
  it("claims one pending job by SKIP LOCKED with bounded 90-second lease",async()=>{
    const db={$queryRaw:vi.fn(async()=>[])};
    expect(await claimOnePetMediaDeletion(db as never)).toBeNull();
    const [sql]=db.$queryRaw.mock.calls[0]! as unknown as [string[]];
    expect(sql.join("?")).toContain("FOR UPDATE SKIP LOCKED LIMIT 1");
    expect(sql.join("?")).toContain("interval '90 seconds'");
    expect(sql.join("?")).toContain('"attempts"="attempts"+1');
  });
});
