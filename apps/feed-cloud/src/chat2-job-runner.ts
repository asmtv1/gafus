/**
 * Chat2 V2 job lifecycle. The API/DB, not Cloud Jobs or the public S3 bucket,
 * owns READY state and attempts; this process owns one leased claim at a time.
 */
import { mkdtemp, realpath, rm, lstat } from "node:fs/promises";
import { join, sep } from "node:path";
import {
  validateChat2V2Job, validateChat2V2Manifest,
  type Chat2V2Job, type Chat2V2Manifest, type FeedImageEngine,
} from "@gafus/feed-cloud";
import { processChat2V2Asset, type Chat2V2Objects } from "./chat2-v2-processor.js";
import type { Chat2JobKind } from "@gafus/feed-cloud";

export interface Chat2V2Claim extends Chat2V2Job {
  attemptToken: string;
  leaseUntil: string;
}
export interface Chat2V2Core {
  claimOne(kind:Chat2JobKind): Promise<Chat2V2Claim | null>;
  renew(mediaId: string, attemptToken: string): Promise<{ accepted: boolean }>;
  complete(job: Chat2V2Claim, manifest: Chat2V2Manifest): Promise<{ accepted: boolean }>;
  fail(job: Chat2V2Claim, errorCode: string): Promise<void>;
}
export function createChat2JobRunner(args: {
  core: Chat2V2Core;
  kind: Chat2JobKind;
  objectsFor(job: Chat2V2Claim): Chat2V2Objects;
  engine: FeedImageEngine;
  workRoot: string;
  now?: () => number;
  process?: typeof processChat2V2Asset;
}) {
  const now = args.now ?? Date.now;
  return async function runOnce(): Promise<number> {
    if(args.kind!=="image"&&args.kind!=="video")throw Error("CHAT2_JOB_KIND_REQUIRED");
    const job = await args.core.claimOne(args.kind);
    if (!job) return 0;
    if(validateChat2V2Job(job).kind!==args.kind)throw Error("CHAT2_JOB_WRONG_KIND");
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(job.attemptToken) ||
        !Number.isFinite(Date.parse(job.leaseUntil)) || Date.parse(job.leaseUntil) <= now())
      throw new Error("CHAT2_JOB_INVALID_LEASE");
    const base=await realpath(args.workRoot);
    const stat=await lstat(base);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("CHAT2_JOB_INVALID_WORK_ROOT");
    if (process.env.GAFUS_LOCAL_ISOLATED_API === "1" || process.env.VITEST === "true") {
      const localRoot="/Users/asmtv1/Desktop/gafus-refactor";
      if (base!==localRoot && !base.startsWith(localRoot+sep))
        throw new Error("CHAT2_JOB_OUTSIDE_PROJECT");
    }
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(), 580_000);
    let renewing=false;
    let submitting=false;
    let directory:string|undefined;
    const heartbeat=setInterval(()=>{
      if(renewing || controller.signal.aborted) return;
      renewing=true;
      void args.core.renew(job.mediaId,job.attemptToken)
        .then(answer=>{if(!answer.accepted)controller.abort();})
        .catch(()=>controller.abort())
        .finally(()=>{renewing=false;});
    },30_000);
    try{
      directory=await mkdtemp(join(base,".chat2-job-"));
      const manifest=await (args.process??processChat2V2Asset)(job,directory,
        {objects:args.objectsFor(job),engine:args.engine},controller.signal);
      controller.signal.throwIfAborted();
      validateChat2V2Manifest(job,manifest);
      submitting=true;
      const completed=await args.core.complete(job,manifest);
      if(!completed.accepted)throw new Error("CHAT2_JOB_COMPLETION_REJECTED");
      return 1;
    }catch(error){
      // A timeout/lost completion acknowledgement is ambiguous. Never roll
      // back bytes while another claimant may have committed READY.
      if(!submitting)await args.core.fail(job,"CHAT2_MEDIA_PROCESSING_FAILED").catch(()=>undefined);
      throw error;
    }finally{
      clearTimeout(timeout);clearInterval(heartbeat);controller.abort();
      if(directory)await rm(directory,{recursive:true,force:true});
    }
  };
}
