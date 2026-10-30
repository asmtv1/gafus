#!/usr/bin/env node
/** AG2-READ-FEED-AUTHOR-001. No production access. Real mode fail closed. */
import {execFileSync} from "node:child_process";
import {readFileSync,realpathSync,lstatSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const id=/^[A-Za-z0-9_-]{1,128}$/;
const allow=[
 "GET /api/v1/feed/status",
 "GET /api/v1/feed/profiles/:username/posts?pageSize=20",
 "GET /api/v1/feed/profiles/:username/posts?pageSize=1",
 "GET /api/v1/feed/profiles/:username/posts?cursor=<opaque>&pageSize=20",
 "GET /api/v1/feed/profiles/:username/posts?cursor=<opaque>&pageSize=1",
 "GET /api/v1/feed/posts/:postId",
 "GET /api/v1/feed/posts/:postId/comments?pageSize=20",
 "GET /api/v1/feed/comments/:commentId",
];
export const PINNED=[
 "apps/web-vite/scripts/feed-author-read-runner.mjs",
 "apps/web-vite/src/features/moments/MomentsProfile.tsx",
 "apps/web-vite/src/features/moments/MomentDetails.tsx",
 "apps/web-vite/src/features/moments/MomentsCatalog.tsx",
 "apps/web-vite/src/features/moments/momentsApi.ts",
 "apps/web-vite/src/features/moments/feedClient.ts",
 "apps/web-vite/src/features/moments/notificationsReadApi.ts",
 "apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx",
 "apps/web-vite/src/features/moments/postDetailReadApi.ts",
 "apps/web-vite/migration/AG2_WEB_URL019_POST_DETAIL_SOURCE_EVIDENCE_20261018.json",
 "apps/web-vite/migration/AG2_WEB_URL024_PUBLIC_AUTHOR_PARITY_EVIDENCE_20261018.json",
 "apps/api/src/routes/v1/feed.ts",
 "packages/feed-server/src/index.ts",
 "packages/core/src/services/feed/service.ts",
 "packages/core/src/services/feed/social.ts",
];
function assert(condition){if(!condition)throw Error("AG2_FEED_READ_DENIED");}
export function fileWithin(path){
 assert(typeof path==="string"&&/^(apps\/|packages\/|docs\/refactor\/)/.test(path)&&
 !path.startsWith("/")&&!path.includes("\\")&&
 path.split("/").every(x=>x&&x!=="."&&x!==".."));
 const full=resolve(ROOT,path);
 assert(full.startsWith(ROOT+sep));
 let cur=ROOT;
 for(const chunk of path.split("/")){
  cur=resolve(cur,chunk);assert(!lstatSync(cur).isSymbolicLink());
 }
 assert(realpathSync(full)===full);return full;
}
export function digest(path){return createHash("sha256")
 .update(readFileSync(fileWithin(path))).digest("hex");}
export function safeGet(origin,path,cookie){
 assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(origin));
 assert(typeof path==="string"&&/^\/api\/v1\/feed\/[A-Za-z0-9_/?=&%-]+$/.test(path)&&
 !path.includes("//")&&!path.includes(".."));
 assert(typeof cookie==="string"&&cookie.length>=16&&
 !/[\r\n]/.test(cookie));
 const url=new URL(path,origin);
 assert(url.origin===origin);
 return {url:url.href,init:{
   method:"GET",headers:{Accept:"application/json",Cookie:cookie},
   cache:"no-store",signal:AbortSignal.timeout(8000),
 }};
}
export function authorizedPaths(fixture){
 const username=fixture?.username,postId=fixture?.visiblePostId,
 hiddenId=fixture?.hiddenPostId,deletedId=fixture?.deletedPostId,
 commentId=fixture?.visibleCommentId;
 assert([username,postId,hiddenId,deletedId,commentId].every(v=>id.test(v)));
 const safe=encodeURIComponent(username);
 return {
  status:"/api/v1/feed/status",
  profile:"/api/v1/feed/profiles/"+safe+"/posts?pageSize=20",
  profileCursor(cursor){
   assert(typeof cursor==="string"&&cursor.length>0&&cursor.length<=512&&
    !/[\x00-\x1F\x7F]/.test(cursor));
   return "/api/v1/feed/profiles/"+safe+"/posts?cursor="+
     encodeURIComponent(cursor)+"&pageSize=20";
  },
  detail:"/api/v1/feed/posts/"+postId,
  comments:"/api/v1/feed/posts/"+postId+"/comments?pageSize=20",
  focus:"/api/v1/feed/comments/"+commentId,
  hidden:"/api/v1/feed/posts/"+hiddenId,
  deleted:"/api/v1/feed/posts/"+deletedId,
  unknownAuthor:"/api/v1/feed/profiles/ag2feed-unknown-author/posts?pageSize=20",
 };
}
function projectPage(data){
 assert(data&&typeof data==="object"&&!Array.isArray(data)&&
 Array.isArray(data.items)&&data.items.length<=20&&
 (data.nextCursor===null||(typeof data.nextCursor==="string"&&
 data.nextCursor.length>0&&data.nextCursor.length<=512)));
 const ids=new Set();
 for(const item of data.items){
  assert(item&&typeof item==="object"&&id.test(item.id)&&
    !ids.has(item.id)&&item.status==="published"&&
    item.author&&typeof item.author.username==="string");
  ids.add(item.id);
 }
 return {ids:[...ids],nextCursor:data.nextCursor,
  authors:data.items.map(x=>x.author.username)};
}
const generic=(data)=>{assert(data&&typeof data==="object"&&!Array.isArray(data));return data;};
export async function checkFeedRead({origin,cookie,fixture,transport=fetch,leaseCheck=()=>true}){
 const p=authorizedPaths(fixture),checks=[];
 const req=async(path,expectStatus=200)=>{
  assert(leaseCheck());
  const {url,init}=safeGet(origin,path,cookie);
  const response=await transport(url,init);
  assert(response.status===expectStatus);
  const json=await response.json();
  assert(json?.success===(expectStatus===200));
  // NEVER return response object, raw URL, cookie, signed media or sensitive data.
  return expectStatus===200?generic(json.data):null;
 };
 const status=await req(p.status);
 assert(status.enabled===true);
 checks.push({case:"STATUS_ENABLED",pass:true});
 const list=projectPage(await req(p.profile));
 assert(list.ids.length===2&&list.ids.every((s,i)=>id.test(s)&&
  list.authors[i]===fixture.username));
 assert(list.ids.includes(fixture.visiblePostId));
 checks.push({case:"PUBLIC_AUTHOR_VISIBLE_2_OF_4",pass:true});
 // A separate one-item cursor is required to verify actual pagination
 // without inventing nextCursor for pageSize=20 on exactly two posts.
 const first=await req(p.profile.replace("pageSize=20","pageSize=1"));
 const firstPage=projectPage(first);
 assert(firstPage.ids.length===1&&typeof firstPage.nextCursor==="string");
 const next=projectPage(await req(p.profileCursor(firstPage.nextCursor)
  .replace("pageSize=20","pageSize=1")));
 assert(next.ids.length===1&&next.ids[0]!==firstPage.ids[0]&&
   list.ids.includes(next.ids[0]));
 checks.push({case:"CURSOR_TWO_ONE_ITEM_PAGES",pass:true});
 const visible=await req(p.detail);
 assert(visible.id===fixture.visiblePostId&&visible.author?.username===fixture.username&&
  visible.status==="published");
 checks.push({case:"VISIBLE_POST_DETAIL",pass:true});
 const comments=await req(p.comments);
 assert(Array.isArray(comments.items)&&comments.items.some(
  x=>x.id===fixture.visibleCommentId&&x.postId===fixture.visiblePostId));
 checks.push({case:"ROOT_COMMENT_POST_SCOPED",pass:true});
 const focus=await req(p.focus);
 assert(focus.id===fixture.visibleCommentId&&focus.postId===fixture.visiblePostId);
 checks.push({case:"FOCUSED_COMMENT_POST_SCOPED",pass:true});
 await req(p.hidden,404);await req(p.deleted,404);await req(p.unknownAuthor,404);
 checks.push({case:"HIDDEN_DELETED_UNKNOWN_404",pass:true});
 return {kind:"AG2_FEED_AUTHOR_REAL_GET_V1",mode:"AG4_GATED_REAL_LOCAL_GET",
  pass:true,realHono:true,cases:checks,checksCount:checks.length,
  writes:0,querySize:20,oneItemCursor:true};
}
export function validateGrant(grant,now=Date.now()){
 const git=execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],
  {encoding:"utf8"}).trim();
 const branch=execFileSync("git",["-C",ROOT,"branch","--show-current"],
  {encoding:"utf8"}).trim();
 assert(git===ROOT&&realpathSync(ROOT)===ROOT&&branch==="vite");
 assert(grant?.kind==="AG4_AG2_FEED_AUTHOR_REAL_GET_EXCLUSIVE_GRANT_V1"&&
  grant.state==="ACTIVE_AG2_EXCLUSIVE"&&grant.owner==="AG2"&&
  grant.repo===ROOT&&grant.branch==="vite"&&
  grant.batch==="AG2-READ-FEED-AUTHOR-001"&&
  grant.exclusiveLeaseConfirmed===true&&
  grant.syntheticActorsConfirmed===true&&
  grant.ag1CurrentProducerAccepted===true&&
  grant.readOnlyVerifiedByAG1===true&&
  grant.readOnlyRoleConfirmedByAG4===true&&
  typeof grant.honoOrigin==="string"&&
  /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(grant.honoOrigin));
 const expiry=Date.parse(grant.expiresUTC);
 assert(Number.isFinite(expiry)&&expiry>now&&expiry<=now+30*60000);
 assert(Array.isArray(grant.operations)&&
  grant.operations.length===allow.length&&
  allow.every(op=>grant.operations.includes(op)));
 assert(grant.databaseName==="gafus_ag2_feed_author_read_20261018"&&
  grant.readOnlyPgRole==="ag2_feed_author_read_20261018");
 assert(grant.pin&&typeof grant.pin==="object"&&
  PINNED.every(f=>grant.pin[f]===digest(f)));
 const ag1=grant.ag1ProducerReady;
 assert(typeof ag1==="string"&&ag1.startsWith("apps/api/")&&
  grant.ag1ProducerReadySHA256===digest(ag1));
 const producer=JSON.parse(readFileSync(fileWithin(ag1),"utf8"));
 assert(producer?.kind==="AG1_AG2_FEED_AUTHOR_READ_PRODUCER_READY_V1"&&
  producer.state==="READY_FOR_AG2_GATED_READ"&&
  producer.origin===grant.honoOrigin&&producer.readOnlyVerified===true);
 const fixture=grant.syntheticFixture;
 authorizedPaths(fixture);
 // Exact IDs are AG4-seeded synthetic identifiers, never production IDs.
 assert(fixture.username==="ag2feedauthora20261018"&&
  fixture.visiblePostId==="ag2feed_visible_01_20261018"&&
  fixture.hiddenPostId==="ag2feed_hidden_01_20261018"&&
  fixture.deletedPostId==="ag2feed_deleted_01_20261018"&&
  fixture.visibleCommentId==="ag2feed_comment_visible_01");
 return {origin:grant.honoOrigin,fixture,expiry};
}
async function runReal(){
 assert(process.env.AG2_FEED_REAL_GET==="AG4_SCOPE_ACKNOWLEDGED"&&
   typeof process.env.AG2_FEED_COOKIE_B==="string"&&
   process.env.AG2_FEED_COOKIE_B.length>=16);
 const grantRel="apps/admin-panel/AG4_AG2_FEED_AUTHOR_REAL_GET_EXCLUSIVE_GRANT_ACTIVE_20261018.v1.json";
 const grant=JSON.parse(readFileSync(fileWithin(grantRel),"utf8"));
 const ready=validateGrant(grant);
 return checkFeedRead({origin:ready.origin,fixture:ready.fixture,
  cookie:process.env.AG2_FEED_COOKIE_B,
  leaseCheck:()=>Date.now()<ready.expiry});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=="--real"||
  args[1]!=="--I-ACKNOWLEDGE-AG4-READONLY-FEED-LEASE"){
  process.stderr.write("AG2_FEED_READ_DENIED: explicit real GET grant required\n");
  process.exitCode=78;
 }else{
  try{
   const result=await runReal();
   console.log(JSON.stringify(result,null,2));
  }catch{
   // Never log response, cookies, fixture secrets or Origin.
   process.stderr.write("AG2_FEED_READ_DENIED_OR_FAILED_NO_FALLBACK\n");
   process.exitCode=78;
  }
 }
}
