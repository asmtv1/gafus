/** Range-verified immutable client H.264: API reads only MP4 metadata, not video frames.
 * A missing/truncated moov, HEVC, 60fps or unrecognized source fails closed.
 */
import {S3Client,HeadObjectCommand,GetObjectCommand,CopyObjectCommand} from "@aws-sdk/client-s3";
import {inspectMp4Upload,canReuseMobile720} from "./clientVideoMp4Probe.js";

const MAX = 200 * 1024 * 1024;
const WINDOW = 4 * 1024 * 1024;
export type ValidatedClientMp4={width:number;height:number;durationSeconds:number;bytes:number;etag:string};

export async function verifyClientMp4(s3:S3Client,bucket:string,key:string,
  expectedBytes:number):Promise<ValidatedClientMp4>{
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<256||expectedBytes>MAX)
    throw Error("CLIENT_VIDEO_SIZE_INVALID");
  const signal=AbortSignal.timeout(12000);
  const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:signal});
  if(head.ContentType!=="video/mp4"||head.ContentLength!==expectedBytes||!head.ETag)
    throw Error("CLIENT_VIDEO_S3_HEAD_MISMATCH");
  const firstSize=Math.min(WINDOW,expectedBytes);
  const tailStart=Math.max(0,expectedBytes-WINDOW);
  async function window(begin:number,end:number){
    const response=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key,
      Range:`bytes=${begin}-${end-1}`,IfMatch:head.ETag}),{abortSignal:AbortSignal.timeout(12000)});
    const bytes=await response.Body?.transformToByteArray();
    if(!bytes||bytes.byteLength!==end-begin)throw Error("CLIENT_VIDEO_RANGE_MISMATCH");
    return bytes;
  }
  const [front,tail]=await Promise.all([
    window(0,firstSize),
    tailStart===0?Promise.resolve(null):window(tailStart,expectedBytes),
  ]);
  const parsed=inspectMp4Upload({size:expectedBytes,read(offset,length){
    if(offset>=0&&offset+length<=front.length)return front.subarray(offset,offset+length);
    if(tail&&offset>=tailStart&&offset+length<=expectedBytes)
      return tail.subarray(offset-tailStart,offset-tailStart+length);
    throw Error("CLIENT_VIDEO_MOOV_OUTSIDE_VERIFICATION_WINDOW");
  }});
  if(!canReuseMobile720(parsed)||!parsed||Math.max(parsed.width,parsed.height)>1920)
    throw Error("CLIENT_VIDEO_MP4_UNSUPPORTED");
  return {width:parsed.width,height:parsed.height,durationSeconds:parsed.seconds,
    bytes:expectedBytes,etag:head.ETag};
}
export async function copyVerifiedClientMp4(s3:S3Client,bucket:string,source:string,
  destination:string,validated:ValidatedClientMp4){
  await s3.send(new CopyObjectCommand({Bucket:bucket,Key:destination,
    CopySource:`${bucket}/${source.split("/").map(encodeURIComponent).join("/")}`,
    CopySourceIfMatch:validated.etag,ContentType:"video/mp4",MetadataDirective:"REPLACE",
    CacheControl:"public, max-age=86400"}),{abortSignal:AbortSignal.timeout(15000)});
  const result=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:destination}),
    {abortSignal:AbortSignal.timeout(12000)});
  if(result.ContentType!=="video/mp4"||result.ContentLength!==validated.bytes||!result.ETag)
    throw Error("CLIENT_VIDEO_FINAL_UNVERIFIED");
}
