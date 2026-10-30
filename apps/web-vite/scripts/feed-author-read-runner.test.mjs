import {test} from "node:test";
import assert from "node:assert/strict";
import {checkFeedRead,safeGet,authorizedPaths,validateGrant,PINNED}
 from "./feed-author-read-runner.mjs";
const origin="http://127.0.0.1:4137";
const fixture={username:"ag2feedauthora20261018",
 visiblePostId:"ag2feed_visible_01_20261018",
 hiddenPostId:"ag2feed_hidden_01_20261018",
 deletedPostId:"ag2feed_deleted_01_20261018",
 visibleCommentId:"ag2feed_comment_visible_01"};
const cookie="ag2_synthetic_only_fake_cookie";
const author={id:"SECRET_AUTHOR_ID",username:fixture.username,name:"Кинолог",role:"TRAINER"};
const post=(id)=>({id,author,status:"published",text:"Synthetic text",
 publishedAt:"2026-10-18T08:00:00Z",createdAt:"2026-10-18T07:00:00Z",
 attachments:[],reactions:[],myReaction:null,canEdit:false,commentCount:1,viewCount:0});
const comment={id:fixture.visibleCommentId,postId:fixture.visiblePostId,
 text:"Synthetic comment",author,deleted:false,createdAt:"2026-10-18T08:00:00Z",
 rootId:null,replyToId:null,replyToName:null,replyCount:0,
 canEdit:false,canDelete:false,reactions:[],myReaction:null};
const ok=(data,code=200)=>({
 status:code,json:async()=>({success:code===200,data}),
});
function wire({wrongAuthor=false,hiddenStatus=404,commentPost=fixture.visiblePostId}={}){
 const requests=[];
 const fetcher=async(url,init)=>{
  requests.push({url,method:init.method,headers:init.headers});
  assert.equal(init.method,"GET");
  assert.ok(url.startsWith(origin+"/api/v1/feed/"));
  const path=new URL(url).pathname,search=new URL(url).searchParams;
  if(path==="/api/v1/feed/status")return ok({enabled:true});
  if(path.endsWith("/profiles/"+fixture.username+"/posts")){
   const rows=[post(fixture.visiblePostId),post("ag2feed_visible_02_20261018")];
   if(wrongAuthor)rows[0].author.username="someone";
   if(search.get("pageSize")==="1"){
    return search.has("cursor")?ok({items:[rows[1]],nextCursor:null}):
     ok({items:[rows[0]],nextCursor:"cursor1"});
   }
   return ok({items:rows,nextCursor:null});
  }
  if(path.endsWith("/profiles/ag2feed-unknown-author/posts"))
   return ok(null,404);
  if(path.endsWith("/posts/"+fixture.visiblePostId))return ok(post(fixture.visiblePostId));
  if(path.endsWith("/posts/"+fixture.hiddenPostId))return ok(null,hiddenStatus);
  if(path.endsWith("/posts/"+fixture.deletedPostId))return ok(null,404);
  if(path.endsWith("/posts/"+fixture.visiblePostId+"/comments"))
   return ok({items:[{...comment,postId:commentPost}],nextCursor:null});
  if(path.endsWith("/comments/"+fixture.visibleCommentId))
   return ok({...comment,postId:commentPost});
  throw Error("UNEXPECTED_ROUTE");
 };
 return {requests,fetcher};
}
test("F01 actual 6 GET cases+cursor, no other method",async()=>{
 const w=wire();
 const out=await checkFeedRead({origin,cookie,fixture,transport:w.fetcher});
 assert.equal(out.pass,true);
 assert.equal(out.checksCount,7);
 assert.equal(out.writes,0);
 assert.equal(w.requests.length,10);
 assert.ok(w.requests.every(x=>x.method==="GET"));
 assert.ok(JSON.stringify(out).includes("CURSOR_TWO_ONE_ITEM_PAGES"));
 assert.doesNotMatch(JSON.stringify(out),/SECRET_|COOKIE|ag2feed_visible_/);
});
test("F02 wrong public author denied",async()=>{
 const w=wire({wrongAuthor:true});
 await assert.rejects(checkFeedRead({origin,cookie,fixture,transport:w.fetcher}));
});
test("F03 hidden post 200 is a hard failure",async()=>{
 const w=wire({hiddenStatus:200});
 await assert.rejects(checkFeedRead({origin,cookie,fixture,transport:w.fetcher}));
});
test("F04 focused post mismatch denied",async()=>{
 const w=wire({commentPost:"foreign"});
 await assert.rejects(checkFeedRead({origin,cookie,fixture,transport:w.fetcher}));
});
test("F05 lease expiry prevents first GET",async()=>{
 const w=wire();
 await assert.rejects(checkFeedRead({origin,cookie,fixture,
  transport:w.fetcher,leaseCheck:()=>false}));
 assert.equal(w.requests.length,0);
});
test("F06 invalid Origin rejected before fetch",()=>{
 assert.throws(()=>safeGet("https://gafus.ru","/api/v1/feed/status",cookie));
 assert.throws(()=>safeGet("http://127.0.0.1:333","/api/v1/feed/status",cookie));
 assert.throws(()=>safeGet("http://127.0.0.1:4137","/api/v1/feed/posts/../../wrong",cookie));
});
test("F07 paths only AG4 fixed synthetic IDs",()=>{
 assert.equal(authorizedPaths(fixture).detail,"/api/v1/feed/posts/"+fixture.visiblePostId);
 assert.throws(()=>authorizedPaths({...fixture,hiddenPostId:"../../path"}));
});
test("F08 active grant absent must reject; source pin list nonempty",()=>{
 assert.ok(PINNED.length>=10);
 assert.throws(()=>validateGrant({kind:"AG4_AG2_FEED_AUTHOR_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"AG4_WRITER_BOOTSTRAP_AG2_NOT_ACTIVE"}));
});
test("F09 no request made when gate is absent",()=>{
 assert.throws(()=>safeGet(origin,"/api/v1/feed/status",""));
});
