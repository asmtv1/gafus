/** Isolated Questions V2: real signed POST + Sharp worker + signed WebP read. */
import { realpathSync } from "node:fs";
import sharp from "sharp";
import { prisma } from "@gafus/prisma";
import {
  reserveQuestionsPhoto, confirmQuestionsPhoto, statusQuestionsPhoto,
  discardQuestionsV2Photo,
} from "../../apps/api/src/modules/questions/media-v2-upload";

const e=process.env,p=new URL(e.DATABASE_URL ?? "http://invalid");
if (realpathSync(process.cwd()) !== "/Users/asmtv1/Desktop/gafus-refactor" ||
    p.hostname !== "127.0.0.1" || p.port !== "55921" ||
    p.pathname !== "/gafus_refactor_real_work_20261024" ||
    e.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    e.QUESTIONS_V2_MEDIA_ENABLED !== "true" ||
    e.QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED !== "true" ||
    e.QUESTIONS_V2_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
    e.QUESTIONS_V2_S3_BUCKET !== "gafus-refactor-questions-test") {
  throw Error("LOCAL_QUESTIONS_V2_E2E_ISOLATION_DENIED");
}
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function main(){
  const user=await prisma.user.findFirst({
    where:{registrationPending:false,questionBlock:null},
    select:{id:true},
  });
  if(!user)throw Error("LOCAL_TEST_ACTOR_NOT_AVAILABLE");
  const bytes=await sharp({create:{width:720,height:480,channels:3,
    background:{r:107,g:132,b:83}}}).png().toBuffer();
  let id:string|undefined;
  try {
    const reservation=await reserveQuestionsPhoto(user.id,{
      mime:"image/png",bytes:bytes.length,
    });
    id=reservation.id;
    if(reservation.upload.method!=="POST" ||
      new URL(reservation.upload.url).hostname!=="127.0.0.1")
      throw Error("LOCAL_SIGNED_POST_MISMATCH");
    const form=new FormData();
    for(const [k,v] of Object.entries(reservation.upload.fields))form.append(k,v);
    form.append("file",new Blob([bytes],{type:"image/png"}),"local-test.png");
    const posted=await fetch(reservation.upload.url,{method:"POST",body:form,
      signal:AbortSignal.timeout(15000)});
    if(posted.status!==204)throw Error("LOCAL_POST_FAILED_"+posted.status);
    const ack=await confirmQuestionsPhoto(user.id,id);
    if(!["QUEUED","PROCESSING","READY"].includes(ack.status))
      throw Error("LOCAL_QUEUE_ACK_INVALID");
    console.log("LOCAL_QUESTIONS_V2_RESERVATION_POST_CONFIRM_PASS");
    let ready=false;
    for(let n=0;n<50;n++){
      const status=await statusQuestionsPhoto(user.id,id);
      if(status.status==="READY"){
        if(!status.url)throw Error("READY_URL_MISSING");
        const u=new URL(status.url);
        if(u.hostname!=="127.0.0.1"||!u.pathname.startsWith("/gafus-refactor-questions-test/"))
          throw Error("LOCAL_READY_URL_MISMATCH");
        const response=await fetch(status.url,{signal:AbortSignal.timeout(8000)});
        const output=Buffer.from(await response.arrayBuffer());
        if(response.status!==200 || output.toString("ascii",0,4)!=="RIFF" ||
            output.toString("ascii",8,12)!=="WEBP")
          throw Error("LOCAL_WEBP_GET_FAILED");
        ready=true;
        console.log("LOCAL_QUESTIONS_V2_READY_WEBP_PASS",output.length);
        break;
      }
      if(status.status==="FAILED"||status.status==="EXPIRED")
        throw Error("LOCAL_WORKER_STATUS_"+status.status);
      await sleep(700);
    }
    if(!ready)throw Error("LOCAL_WORKER_DID_NOT_FINISH");
  }finally{
    if(id){
      try{
        await discardQuestionsV2Photo(user.id,id);
        console.log("LOCAL_QUESTIONS_V2_TEST_PHOTO_DISCARDED");
      }catch(error){
        console.error("LOCAL_QUESTIONS_V2_CLEANUP_PENDING",
          error instanceof Error?error.name:"unknown");
      }
    }
    await prisma.$disconnect();
  }
}
// The API's isolated BullMQ client may hold background handles open after a
// finished one-shot test. Exit only after the durable cleanup transaction.
void main().then(()=>process.exit(0)).catch(error=>{
  console.error("LOCAL_QUESTIONS_V2_E2E_FAILED",
    error instanceof Error?error.message:"unknown");
  process.exit(1);
});
