/** WEB-5: authenticated Hono -> actual Core -> isolated WORK SQL -> development Stream. */
import {createHash,randomUUID} from "node:crypto";
import {Hono} from "hono";
import {StreamChat} from "stream-chat";
import {prisma} from "@gafus/prisma";
import {generateAccessToken} from "@gafus/auth/jwt";
import {authMiddleware} from "../../middleware/auth";
import {cynologistChatRoutes} from "./cynologist-chat";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const enabled=process.env.GAFUS_WEB5_ISOLATED_CHAT_STREAM_TEST==="1";
const run=enabled?describe:describe.skip;
const ids=[randomUUID(),randomUUID(),randomUUID()];
const label=(id:string)=>`web5_chat_${id.replaceAll("-","")}`;
const channelId=`chat-${createHash("sha256").update(ids[0]).digest("hex").slice(0,40)}`;
const app=new Hono();
app.use("/api/v1/cynologist-chat",authMiddleware);
app.use("/api/v1/cynologist-chat/*",authMiddleware);
app.route("/api/v1/cynologist-chat",cynologistChatRoutes);
const endpoint="http://127.0.0.1:3001/api/v1/cynologist-chat";
const clients:StreamChat[]=[];
const accepted:string[]=[];
let chatId="";
let provider:StreamChat;
let fixtureCreated=false;
const intake={clientOwnerName:"WEB5 Synthetic",clientPhone:"+79990000000",
  petName:"WEB5 dog",petGender:"MALE",petAge:"3",petBreed:"Mixed",
  clientProblem:"Synthetic integration test only",clientProblemDuration:"Seven days",
  clientSelfHelpAttempt:"Training exercise"};
function check(labelName:string){accepted.push(labelName);console.log(`WEB5_REAL_${labelName}=PASS`);}
const jwt=async(i:number)=>generateAccessToken({id:ids[i],username:label(ids[i]),role:i===1?"TRAINER":"USER"});
async function call(path:string,method:string,i?:number,payload?:unknown){
  const headers:Record<string,string>={...(i===undefined?{}:{authorization:`Bearer ${await jwt(i)}`}),
    ...(payload===undefined?{}:{"content-type":"application/json"})};
  const response=await app.request(endpoint+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  return {status:response.status,body:await response.json() as {success:boolean;data:{[key:string]:unknown;chat?:{id:string};id?:string;userId?:string;apiKey?:string;token?:string;channelType?:string;channelId?:string};code?:string}};
}
run("WEB5 registered Hono+Core+isolated SQL+development Stream",()=>{
  beforeAll(async()=>{
    const u=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
    if(process.cwd()!==`${root}/apps/api`||u.hostname!=="127.0.0.1"||u.port!=="55921"||
      u.pathname!=="/gafus_refactor_real_work_20261024"||u.username!=="gafus_refactor_local_real"||
      !u.password||u.search!=="?schema=public"||
      process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||!process.env.STREAM_API_KEY||
      !process.env.STREAM_API_SECRET||process.env.CYNOLOGIST_CHAT_ENABLED!=="true"||
      (process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID &&
       process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID!==ids[1]))
      throw Error("WEB5_WRONG_ISOLATED_TARGET_DENIED");
    const identity=await prisma.$queryRaw<{db:string;actor:string}[]>`SELECT current_database() AS db,current_user AS actor`;
    expect(identity).toEqual([{db:"gafus_refactor_real_work_20261024",actor:"gafus_refactor_local_real"}]);
    provider=StreamChat.getInstance(process.env.STREAM_API_KEY,process.env.STREAM_API_SECRET);
    const settings=await provider.getAppSettings();
    expect(String(settings.app?.id)).toBe("1730620");
    expect(settings.app?.disable_auth_checks).toBe(false);
    expect(settings.app?.disable_permissions_checks).toBe(false);
    const existing=await prisma.user.count({where:{id:{in:ids}}});
    expect(existing).toBe(0);
    await prisma.user.createMany({data:ids.map((id,i)=>({id,username:label(id),
      password:randomUUID(),role:i===1?"TRAINER":"USER",registrationPending:false}))});
    fixtureCreated=true;
    process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID=ids[1];
    await prisma.appSubscription.create({data:{userId:ids[0],provider:"MANUAL",
      planCode:"MONTHLY",status:"ACTIVE",isLifetime:false,
      currentPeriodStart:new Date(),currentPeriodEnd:new Date(Date.now()+86400000)}});
    check("WORK_SYNTHETIC_ACTORS_ENTITLEMENT");
    const {connection}=await import("@gafus/queues");
    console.warn("WEB5_RATE_LIMIT_TRANSPORT",typeof connection.eval,
      connection.constructor?.name??"NO_CONSTRUCTOR");
  },65000);
  afterAll(async()=>{
    // Own-only cleanup; never modify any pre-existing channel, user or chat.
    await Promise.allSettled(clients.map(client=>client.disconnectUser()));
    if(fixtureCreated){
      const rows=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,username:true}});
      for(const row of rows)if(row.username!==label(row.id))throw Error("WEB5_CLEANUP_FOREIGN_ACTOR_DENIED");
      const ownedChat=await prisma.cynologistChat.findUnique({where:{clientUserId:ids[0]}});
      const ownChatId=ownedChat?.id??chatId;
      if(ownChatId){
        const row=await prisma.cynologistChat.findUnique({where:{id:ownChatId}});
        if(row&& (row.clientUserId!==ids[0]||row.trainerUserId!==ids[1]||row.streamChannelId!==channelId))
          throw Error("WEB5_CLEANUP_FOREIGN_CHAT_DENIED");
        await prisma.chatNotification.deleteMany({where:{chatId:ownChatId}});
        await prisma.chatSendOperation.deleteMany({where:{chatId:ownChatId}});
        await prisma.chatAttachment.deleteMany({where:{chatId:ownChatId}});
        await prisma.cynologistChat.deleteMany({where:{id:ownChatId,clientUserId:ids[0]}});
      }
      await prisma.appSubscription.deleteMany({where:{userId:ids[0],provider:"MANUAL",planCode:"MONTHLY"}});
      await prisma.refreshToken.deleteMany({where:{userId:{in:ids}}});
      await prisma.user.deleteMany({where:{id:{in:ids}}});
      expect(await prisma.user.count({where:{id:{in:ids}}})).toBe(0);
      check("WORK_OWN_ACTOR_SQL_CLEANUP");
    }
    // Remote channel and users are likewise synthetic-only. Do not touch community room.
    if(provider){
      try {await provider.channel("gafus_cynologist",channelId).delete({hard_delete:true});check("DEV_OWN_CHANNEL_CLEANUP");}
      catch {console.warn("WEB5_DEV_CHANNEL_CLEANUP_REVIEW_REQUIRED");}
      try {await provider.deleteUsers(ids.map(id=>`gafus-${id}`),{user:"hard",messages:"hard"});}
      catch {console.warn("WEB5_DEV_ACTOR_CLEANUP_REVIEW_REQUIRED");}
    }
    await prisma.$disconnect();
  },65000);
  it("owner / foreign ACL, start, POST, idempotency, other actor realtime, refresh",async()=>{
    expect((await call("","GET")).status).toBe(401);
    expect((await call("","GET",0)).status).toBe(200);
    expect((await call("/dialogs","GET",2)).status).toBe(403);
    const created=await call("/start","POST",0,intake);
    if(created.status!==200){
      console.warn("WEB5_START_SAFE_DIAGNOSTIC",created.status,created.body.code??"NO_CODE");
      try{
        const service=await import("@gafus/core/services/cynologistChat");
        await service.startChat(ids[0],intake);
        console.warn("WEB5_CORE_DIRECT_DIAG=RESOLVED");
      }catch(e){
        const v=e as {name?:string;code?:string|number;message?:string};
        console.warn("WEB5_CORE_DIRECT_DIAG",v.name??"unknown",v.code??"NO_CODE",
          String(v.message??"").replaceAll(process.env.STREAM_API_KEY??"[none]","[REDACTED]").slice(0,220));
      }
    }
    expect(created.status).toBe(200);
    const createdId=created.body.data.chat?.id;
    if(typeof createdId!=="string"||!createdId)throw Error("WEB5_CREATED_CHAT_ID_MISSING");
    chatId=createdId;
    expect((await prisma.cynologistChat.findUnique({where:{id:chatId}}))?.streamChannelId).toBe(channelId);
    check("HONO_START_CORE_SQL_READY");
    const foreign=await call(`?chatId=${chatId}`,"GET",2);
    expect(foreign.status).toBe(403);
    expect((await call(`/session?chatId=${chatId}`,"POST",2,{})).status).toBe(403);
    const first=await call("/session","POST",0,{});
    const trainer=await call(`/session?chatId=${chatId}`,"POST",1,{});
    expect(first.status).toBe(200);expect(trainer.status).toBe(200);
    check("HONO_SIGNED_SESSIONS_PRIVATE_ACL");
    for(const session of [first.body.data,trainer.body.data]){
      if(!session.apiKey||!session.userId||!session.token||!session.channelType||!session.channelId)
        throw Error("WEB5_TEST_SESSION_SHAPE");
      const client=new StreamChat(session.apiKey,{allowServerSideConnect:true,logger:()=>{}});
      clients.push(client);
      await client.connectUser({id:session.userId},session.token);
      await client.channel(session.channelType,session.channelId).watch();
    }
    const member=clients[1].channel("gafus_cynologist",channelId);
    const messageId=randomUUID();
    const sent=await call("/messages","POST",0,{clientMessageId:messageId,text:"WEB5 isolated real end-to-end",attachmentIds:[]});
    expect(sent.status).toBe(200);
    const replay=await call("/messages","POST",0,{clientMessageId:messageId,text:"WEB5 isolated real end-to-end",attachmentIds:[]});
    expect(replay.status).toBe(200);expect(replay.body.data.id).toBe(sent.body.data.id);
    expect((await call("/messages","POST",0,{clientMessageId:messageId,text:"changed",attachmentIds:[]})).status).toBe(409);
    const stored=await prisma.chatSendOperation.findMany({where:{chatId}});
    expect(stored).toHaveLength(1);expect(stored[0].state).toBe("SENT");
    check("HONO_SQL_SEND_ONE_RECEIPT_200_REPLAY_409_CONFLICT");
    const realtime=await member.query({messages:{limit:30}});
    expect(realtime.messages.some(message=>message.id===sent.body.data.id)).toBe(true);
    await clients[1].disconnectUser();
    const refreshed=await call(`/session?chatId=${chatId}`,"POST",1,{});
    expect(refreshed.status).toBe(200);
    if(!refreshed.body.data.userId||!refreshed.body.data.token)throw Error("NO_RECONNECT_SESSION");
    await clients[1].connectUser({id:refreshed.body.data.userId},refreshed.body.data.token);
    const reloaded=await clients[1].channel("gafus_cynologist",channelId).watch();
    expect(reloaded.messages.some(message=>message.id===sent.body.data.id)).toBe(true);
    check("DEV_TRAINER_SECOND_CLIENT_RECEIVE_RECONNECT_RELOAD");
  },120000);
});
