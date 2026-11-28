import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Runtime uses a dedicated read-only key; CI publishing credentials must never
 * be installed in the worker. Fixed private bucket and origin, no redirects. */
export type MobilePrivateSymbolReader = (key: string, maxBytes: number) => Promise<Buffer>;
const KEY = /^symbols\/(preview|production)\/gafus\/\d{1,4}\.\d{1,4}\.\d{1,4}\/(ios|android)\/(?:embedded\/\d{1,20}\/)?[a-f0-9-]{36}\/(?:private-symbol-manifest\.json|[a-f0-9]{64}\.map)$/i;
export function createMobilePrivateSymbolReader(env: NodeJS.ProcessEnv=process.env): MobilePrivateSymbolReader | undefined {
  const accessKeyId=env.GAFUS_MOBILE_SYMBOLS_READ_ACCESS_KEY;
  const secretAccessKey=env.GAFUS_MOBILE_SYMBOLS_READ_SECRET_KEY;
  if(env.GAFUS_MOBILE_SYMBOLS_READ_ENABLED!=="true" || !accessKeyId || !secretAccessKey)return undefined;
  const client=new S3Client({
    endpoint:"https://s3.cloud.ru",region:"ru-central-1",forcePathStyle:true,maxAttempts:1,
    credentials:{accessKeyId,secretAccessKey},
  });
  return async(key,maxBytes)=>{
    if(!KEY.test(key)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>50*1024*1024)
      throw new Error("MOBILE_SYMBOL_READ_SCOPE");
    const signal=AbortSignal.timeout(3500);
    const result=await client.send(new GetObjectCommand({Bucket:"gafus-symbols-private",Key:key}),{abortSignal:signal});
    if(!result.Body || !Number.isSafeInteger(result.ContentLength) || result.ContentLength!<1 ||
       result.ContentLength!>maxBytes || !(Symbol.asyncIterator in result.Body)) {
      (result.Body as {destroy?:()=>void}|undefined)?.destroy?.();
      throw new Error("MOBILE_SYMBOL_READ_SIZE");
    }
    const chunks:Buffer[]=[];
    let length=0;
    const stream=result.Body as AsyncIterable<Uint8Array>;
    const destroy=()=> (result.Body as {destroy?:()=>void}).destroy?.();
    signal.addEventListener("abort",destroy,{once:true});
    try {
      for await(const chunk of stream) {
        length+=chunk.length;
        if(length>maxBytes||signal.aborted)throw new Error("MOBILE_SYMBOL_READ_SIZE");
        chunks.push(Buffer.from(chunk));
      }
    } finally { signal.removeEventListener("abort",destroy); destroy(); }
    if(length!==result.ContentLength)throw new Error("MOBILE_SYMBOL_READ_INCOMPLETE");
    return Buffer.concat(chunks,length);
  };
}
