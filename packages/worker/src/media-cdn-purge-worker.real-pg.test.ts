/** Real lease-fenced PostgreSQL only; CDN responses are local in-process fakes. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createMediaCdnPurgeDependencies,
  processOneMediaCdnPurge,
} from "./media-cdn-purge-worker.js";
const enabled = process.env.GAFUS_MEDIA_PURGE_SQL_ISOLATED_TEST === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.pathname !== "/gafus_refactor_media_purge" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1")
    throw Error("DENIED: media purge lease tests require private disposable PostgreSQL");
}
const suite = enabled ? describe : describe.skip;
suite("Beget edge purge SQL: lease/retry/ACK on disposable PostgreSQL", () => {
  let id = "";
  const path = "/gallery/owner/media/photo/v2/thumb.webp";
  beforeEach(async()=>{
    id = "gallery:"+randomUUID();
    await prisma.mediaCdnPurge.create({
      data:{id,scope:"gallery",paths:[path],purgeOperations:[],
        status:"pending",availableAt:new Date(Date.now()-1000)},
    });
  });
  afterAll(async()=>{
    await prisma.mediaCdnPurge.deleteMany({
      where:{id:{startsWith:"gallery:"}},
    });
    await prisma.$disconnect();
  });
  it("two competing physical SQL claims cannot both lease the same job",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const [a,b]=await Promise.all([repo.claim(randomUUID()),repo.claim(randomUUID())]);
    const claimed=[a,b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.attempts).toBe(1);
    expect(claimed[0]!.attemptToken).toMatch(/^[a-f0-9-]{36}$/);
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}})).status)
      .toBe("processing");
  });
  it("durable Beget operation ID checkpoints before terminal ACK and clears paths",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const job=(await repo.claim(randomUUID()))!;
    const operations=["beget:synthetic-operation-1"];
    await repo.checkpoint(job,operations);
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}})).purgeOperations)
      .toEqual(operations);
    await repo.complete(job);
    const done=await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}});
    expect(done).toMatchObject({status:"done",paths:[],purgeOperations:[],
      attemptToken:null,leaseUntil:null,errorCode:null});
  });
  it("expired lease can be re-claimed; stale token cannot checkpoint or ACK",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const stale=(await repo.claim(randomUUID()))!;
    await prisma.mediaCdnPurge.update({where:{id},
      data:{leaseUntil:new Date(Date.now()-1000)}});
    const winner=(await repo.claim(randomUUID()))!;
    expect(winner.attemptToken).not.toBe(stale.attemptToken);
    await expect(repo.checkpoint(stale,["beget:stale"])).rejects
      .toThrow("MEDIA_PURGE_LEASE_LOST");
    await expect(repo.complete(stale)).rejects.toThrow("MEDIA_PURGE_LEASE_LOST");
    await expect(repo.retry(stale,"MEDIA_PURGE_RETRY",60_000)).rejects.toThrow("MEDIA_PURGE_LEASE_LOST");
    await repo.complete(winner);
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}})).status)
      .toBe("done");
  });
  it("provider uncertainty backs off and later reclaims without losing job",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const first=(await repo.claim(randomUUID()))!;
    await repo.retry(first,"MEDIA_PURGE_PENDING",60_000);
    const retry=await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}});
    expect(retry).toMatchObject({status:"pending",attemptToken:null,
      errorCode:"MEDIA_PURGE_PENDING"});
    expect(retry.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(await repo.claim(randomUUID())).toBeUndefined();
    await prisma.mediaCdnPurge.update({where:{id},data:{availableAt:new Date(Date.now()-1000)}});
    expect((await repo.claim(randomUUID()))?.attempts).toBe(2);
  });
  it("real SQL checkpoint is durable before fake Beget ACK; zero external calls",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const submitted=vi.fn(async(_scope:string,_paths:string[],
      _previous:string[],checkpoint:(operations:string[])=>Promise<void>)=>{
      await checkpoint(["beget:synthetic-operation-1"]);
      const persisted=await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}});
      expect(persisted.purgeOperations).toEqual(["beget:synthetic-operation-1"]);
      return ["beget:synthetic-operation-1"];
    });
    const verified=vi.fn(async()=>true);
    const outcome=await processOneMediaCdnPurge({
      ...repo,begin:submitted as never,done:verified as never,
    });
    expect(outcome).toBe("done");
    expect(submitted).toHaveBeenCalledOnce();
    expect(verified).toHaveBeenCalledOnce();
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}})).status)
      .toBe("done");
  });
  it("worker provider failure keeps durable job pending without acknowledgement or leaking details",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    let submitCalls=0;
    const providerBegin=vi.fn(async(_scope:string,_paths:string[],_prior:string[],checkpoint:(operations:string[])=>Promise<void>)=>{
      submitCalls++;
      if(submitCalls===1)throw Error('QA_SECRET_PROVIDER_FAILURE_DO_NOT_PERSIST');
      await checkpoint(['beget:qa-purge-retry']);
      return ['beget:qa-purge-retry'];
    });
    const providerDone=vi.fn(async()=>true);
    const deps={...repo,begin:providerBegin as never,done:providerDone as never};
    expect(await processOneMediaCdnPurge(deps)).toBe('pending');
    const first=await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}});
    expect(first).toMatchObject({status:'pending',attempts:1,errorCode:'MEDIA_PURGE_RETRY'});
    expect(JSON.stringify(first)).not.toContain('QA_SECRET_PROVIDER_FAILURE_DO_NOT_PERSIST');
    expect(providerDone).not.toHaveBeenCalled();
    expect(await processOneMediaCdnPurge(deps)).toBe('empty');
    expect(submitCalls).toBe(1);
    await prisma.mediaCdnPurge.update({where:{id},data:{availableAt:new Date(Date.now()-1000)}});
    expect(await processOneMediaCdnPurge(deps)).toBe('done');
    expect(submitCalls).toBe(2);
    expect(providerDone).toHaveBeenCalledOnce();
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}}))).toMatchObject({status:'done',attempts:2,paths:[]});
  });

  it("worker crash after SQL checkpoint reclaims lease without submitting a duplicate provider operation",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const stale=(await repo.claim(randomUUID()))!;
    expect(stale.id).toBe(id);
    await repo.checkpoint(stale,['beget:qa-already-submitted']);
    const stored=await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}});
    expect(stored.purgeOperations).toEqual(['beget:qa-already-submitted']);
    // Simulate a process death between durable checkpoint and ACK: no complete()/retry().
    await prisma.mediaCdnPurge.update({where:{id},data:{leaseUntil:new Date(Date.now()-1000)}});
    let createdNewOperation=0;
    const begin=vi.fn(async(_scope:string,_paths:string[],previous:string[])=>{
      expect(previous).toEqual(['beget:qa-already-submitted']);
      if(previous.length===0){createdNewOperation++;throw Error('QA_DUPLICATE_PUBLISH_ATTEMPT');}
      return previous;
    });
    const done=vi.fn(async()=>true);
    expect(await processOneMediaCdnPurge({...repo,begin:begin as never,done:done as never})).toBe('done');
    expect(createdNewOperation).toBe(0);
    expect(begin).toHaveBeenCalledOnce();expect(done).toHaveBeenCalledOnce();
    await expect(repo.complete(stale)).rejects.toThrow('MEDIA_PURGE_LEASE_LOST');
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}}))).toMatchObject({status:'done',paths:[],purgeOperations:[],attempts:2});
  });

  it("two concurrent worker passes have one SQL lease and one irreversible provider submission",async()=>{
    const repo=createMediaCdnPurgeDependencies();
    const begin=vi.fn(async(_scope:string,_paths:string[],_previous:string[],checkpoint:(ops:string[])=>Promise<void>)=>{
      await checkpoint(['beget:qa-concurrent']);
      return ['beget:qa-concurrent'];
    });
    const done=vi.fn(async()=>true);
    const deps={...repo,begin:begin as never,done:done as never};
    const outcomes=await Promise.all([processOneMediaCdnPurge(deps),processOneMediaCdnPurge(deps)]);
    expect(outcomes.sort()).toEqual(['done','empty']);
    expect(begin).toHaveBeenCalledOnce();expect(done).toHaveBeenCalledOnce();
    expect((await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}}))).toMatchObject({status:'done',attempts:1,paths:[]});
    expect(await processOneMediaCdnPurge(deps)).toBe('empty');
    expect(begin).toHaveBeenCalledOnce();
  });
});
