/** Existing public Questions bucket; input source is outside public GetObject prefix. */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { questionsV2Storage } from "@gafus/cdn-upload";
import {
  QUESTIONS_V2_MAX_BYTES, questionsV2ValidateJob, questionsV2FinalKeys,
  type QuestionsV2Job,
} from "@gafus/feed-cloud";
import type { QuestionsV2Objects } from "./questions-v2-processor.js";

export function createQuestionsV2S3Objects(job:QuestionsV2Job): QuestionsV2Objects & {close:()=>void} {
  questionsV2ValidateJob(job);
  const {client,bucket}=questionsV2Storage();
  const keys=questionsV2FinalKeys(job.ownerId,job.mediaId);
  const permitted=new Set(Object.values(keys));
  return {
    close(){client.destroy();},
    async downloadSource(claim, signal) {
      if (claim.mediaId!==job.mediaId || claim.ownerId!==job.ownerId ||
          claim.sourceKey!==job.sourceKey || claim.sourceBytes!==job.sourceBytes)
        throw Error("QUESTIONS_V2_DOWNLOAD_CLAIM_MISMATCH");
      const res=await client.send(new GetObjectCommand({Bucket:bucket,Key:job.sourceKey}),
        {abortSignal:signal});
      if(res.ContentLength!==job.sourceBytes || res.ContentType!==job.sourceMime ||
          job.sourceBytes>QUESTIONS_V2_MAX_BYTES) {
        if (res.Body && "destroy" in res.Body) (res.Body as Readable).destroy();
        throw Error("QUESTIONS_V2_GET_INVALID_HEADERS");
      }
      if (!res.Body || !(res.Body instanceof Readable))
        throw Error("QUESTIONS_V2_GET_NOT_STREAM");
      let total=0;
      const chunks:Buffer[]=[];
      for await(const chunk of res.Body){
        signal.throwIfAborted();
        const bytes=Buffer.from(chunk);
        total+=bytes.byteLength;
        if (total>job.sourceBytes || total>QUESTIONS_V2_MAX_BYTES) {
          res.Body.destroy();
          throw Error("QUESTIONS_V2_GET_OVER_LIMIT");
        }
        chunks.push(bytes);
      }
      if(total!==job.sourceBytes)throw Error("QUESTIONS_V2_GET_TRUNCATED");
      return Buffer.concat(chunks,total);
    },
    async createWebp(key, bytes, signal) {
      if(!permitted.has(key)||bytes.length<12||bytes.length>1_750_000)
        throw Error("QUESTIONS_V2_PUT_NOT_ALLOWED");
      const md5=createHash("md5").update(bytes).digest();
      const digest=md5.toString("hex");
      try{
        const written=await client.send(new PutObjectCommand({
          Bucket:bucket,Key:key,Body:bytes,ContentLength:bytes.byteLength,
          ContentMD5:md5.toString("base64"),ContentType:"image/webp",
          IfNoneMatch:"*",CacheControl:"public, max-age=86400, immutable",
        }),{abortSignal:signal});
        if(written.ETag?.replace(/"/g,"").toLowerCase()===digest)return;
      }catch(error){
        const status=(error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
        if(status!==409&&status!==412)throw error;
      }
      // Only a non-MD5 ETag or an immutable retry needs an extra HEAD.
      const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),
        {abortSignal:signal});
      if(head.ContentLength!==bytes.byteLength || head.ContentType!=="image/webp" ||
          head.ETag?.replace(/"/g,"").toLowerCase()!==digest)
        throw Error("QUESTIONS_V2_PUT_CONFLICT");
    },
  };
}
