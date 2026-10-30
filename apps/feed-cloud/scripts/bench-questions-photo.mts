/**
 * Synthetic, offline-only Questions Photo V2 image benchmark.
 * Reports encoder timings and output sizes; NOT real Cloud S3/network latency,
 * NOT p95, and memory snapshots are NOT peak-RSS measurements.
 */
import {performance} from "node:perf_hooks";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {questionsV2SourceKey} from "@gafus/feed-cloud";
import {processQuestionsV2Photo} from "../src/questions-v2-processor.js";

const width=800,height=1280;
const pixels=Buffer.alloc(width*height*3);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*3;
  pixels[i]=Math.floor(x*255/width);
  pixels[i+1]=Math.floor(y*255/height);
  pixels[i+2]=(x*31+y*17)&255;
}
const source=await sharp(pixels,{raw:{width,height,channels:3}})
  .jpeg({quality:90}).toBuffer();
const mediaId=randomUUID(),ownerId="synthetic-benchmark";
const job={
  mediaId,ownerId,sourceKey:questionsV2SourceKey(ownerId,mediaId,"image/jpeg"),
  sourceMime:"image/jpeg" as const,sourceBytes:source.length,
};
let downloaded=0;
const outputs:Uint8Array[]=[];
const cpuStart=process.cpuUsage(),rssBefore=process.memoryUsage().rss;
const started=performance.now();
const manifest=await processQuestionsV2Photo(job,{
  downloadSource:async()=>{downloaded++;return source;},
  createWebp:async(_key,bytes)=>{outputs.push(bytes);},
},new AbortController().signal);
const elapsed=performance.now()-started;
const cpu=process.cpuUsage(cpuStart);
if(downloaded!==1||outputs.length!==2)throw Error("BENCHMARK_COMMAND_COUNT_MISMATCH");
const result={
  kind:"synthetic-offline-encoder-benchmark",
  originalJpegBytes:source.length,
  smallWebpBytes:outputs[0]?.length,
  mediumWebpBytes:outputs[1]?.length,
  outputTotalBytes:outputs.reduce((sum,file)=>sum+file.length,0),
  smallDimensions:[manifest.variants.small.width,manifest.variants.small.height],
  mediumDimensions:[manifest.variants.medium.width,manifest.variants.medium.height],
  mockGetCount:downloaded,mockPutCount:outputs.length,
  sharpAndMockPipelineMs:Number(elapsed.toFixed(1)),
  processCpuMs:Number(((cpu.user+cpu.system)/1000).toFixed(1)),
  rssSnapshotBeforeMiB:Number((rssBefore/1024/1024).toFixed(1)),
  rssSnapshotAfterMiB:Number((process.memoryUsage().rss/1024/1024).toFixed(1)),
  networkCalls:0,
};
console.log(JSON.stringify(result,null,2));
