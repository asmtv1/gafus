/**
 * Anonymous telemetry must never read an unbounded transfer-encoded HTTP body.
 * Read at most 4096 bytes regardless of untrusted Content-Length metadata.
 */
export class OtaBodyTooLargeError extends Error {
  constructor() {super("OTA_TELEMETRY_TOO_LARGE");}
}
export async function readBoundedOtaJson(request: Request, maxBytes=4096):Promise<unknown> {
  const declared=request.headers.get("content-length");
  if(declared!==null){
    if(!/^\d+$/.test(declared))throw new SyntaxError("INVALID_CONTENT_LENGTH");
    if(Number(declared)>maxBytes)throw new OtaBodyTooLargeError();
  }
  if(!request.body)return null;
  const reader=request.body.getReader();
  let bytes=0;
  const chunks:Uint8Array[]=[];
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>maxBytes)throw new OtaBodyTooLargeError();
      chunks.push(value);
    }
  } catch(error){
    // Do not wait for a hostile infinite stream to close.
    void reader.cancel().catch(()=>undefined);
    throw error;
  }finally{
    reader.releaseLock();
  }
  const joined=new Uint8Array(bytes);
  let position=0;
  for(const chunk of chunks){joined.set(chunk,position);position+=chunk.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(joined));
}
