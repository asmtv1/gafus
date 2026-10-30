import {afterEach,describe,expect,it,vi} from "vitest";
import {projectDetailPost,projectDetailComments,projectFocusedComment,
  detailCommentId,getPostDetailRead,getPostDetailComments,getPostFocusedComment}
  from "./postDetailReadApi";
const author={id:"PRIVATE_OWNER",username:"trainer",name:"Кинолог",
  role:"TRAINER",avatarUrl:"SECRET_SIGNED_URL"};
const post=(id="post-A")=>({id,status:"published",text:"Учимся ждать",
  author,attachments:[{id:"m1",kind:"photo",status:"ready",
    thumbUrl:"https://cdn.example/media/thumb.webp?sig=PUBLIC"}],reactions:[],myReaction:null,
  createdAt:"2026-10-18T12:00:00Z",publishedAt:"2026-10-18T12:00:00Z",
  viewCount:2,commentCount:2,canEdit:false,hasPoll:false,
  recommendationExposureToken:"PRIVATE_PERSONALIZATION"});
const comment=(id="c1",postId="post-A")=>({id,postId,text:"Полезный ответ",
  createdAt:"2026-10-18T12:00:00Z",author,
  rootId:null,replyToId:null,replyToName:null,deleted:false,replyCount:0,
  reactions:[],myReaction:null,canEdit:false,canDelete:false,
  accessToken:"SECRET_JWT"});
const page=(items:unknown[]=[],nextCursor:string|null=null)=>({
  items,nextCursor,serverNow:"2026-10-18T12:00:00Z",
  privateRank:"SECRET_FEED_RANK"});
const http=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status===200,data,error:"PRIVATE_INTERNAL",
}),{status});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-019 Hono focused post and comments existing DTO",()=>{
  it("D01 existing post projector strips author ID, media URLs and private rankings",()=>{
    const value=projectDetailPost(post(),"post-A");
    expect(value.id).toBe("post-A");
    expect(value.roleBadge).toBe("Кинолог");
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE_|SECRET_|avatarUrl|thumbUrl/);
  });
  it("D02 rejects post IDs/path traversal and cross-post response",()=>{
    expect(()=>projectDetailPost(post(),"../admin")).toThrow();
    expect(()=>projectDetailPost(post("wrong"),"post-A")).toThrow();
    expect(()=>projectDetailPost({...post(),status:"draft"},"post-A")).toThrow();
  });
  it("D03 strict comments whitelist and hidden deleted text",()=>{
    const safe=projectDetailComments(page([
      comment(),{...comment("c2"),deleted:true,text:"PRIVATE_DELETED_BODY"},
    ]),"post-A");
    expect(safe.items).toHaveLength(2);
    expect(safe.items[1].text).toBe("");
    expect(JSON.stringify(safe)).not.toMatch(/PRIVATE_|SECRET_|accessToken|postId/);
  });
  it.each([
    ["foreign",page([comment("c1","other")])],
    ["duplicate",page([comment(),comment()])],
    ["path",page([comment("../hidden")])],
    ["invalid cursor",page([comment()],"\nB")],
    ["invalid page",null],
  ])("D04 page rejected: %s",(_label,raw)=>{
    expect(()=>projectDetailComments(raw,"post-A")).toThrow();
  });
  it("D09 focused from notification same post and ID only",()=>{
    const focused=projectFocusedComment(comment(),"post-A","c1");
    expect(focused.text).toBe("Полезный ответ");
    expect(()=>projectFocusedComment(comment("c1","other"),"post-A","c1")).toThrow();
    expect(()=>projectFocusedComment(comment(),"post-A","another")).toThrow();
  });
  it("D10 safe deep link commentId single, duplicate rejected",()=>{
    expect(detailCommentId("?commentId=c1")).toBe("c1");
    expect(detailCommentId("?commentId=c1&commentId=c2")).toBeNull();
    expect(detailCommentId("?commentId=%2Fadmin")).toBeNull();
  });
  it("D11 exact same-origin Hono GET paths; no mutation",async()=>{
    const f=vi.fn(async(path:string,_init:RequestInit)=>{
      const data=path.includes("/comments?")?page([comment()]):
        path.endsWith("/comments/c1")?comment():post();
      return http(data);
    });
    vi.stubGlobal("fetch",f);
    expect((await getPostDetailRead("post-A")).id).toBe("post-A");
    expect((await getPostDetailComments("post-A")).items).toHaveLength(1);
    expect((await getPostDetailComments("post-A","page+2")).items).toHaveLength(1);
    expect((await getPostFocusedComment("post-A","c1")).id).toBe("c1");
    expect(f.mock.calls.map(([url])=>url)).toEqual([
      "/api/v1/feed/posts/post-A",
      "/api/v1/feed/posts/post-A/comments?pageSize=20",
      "/api/v1/feed/posts/post-A/comments?pageSize=20&cursor=page%2B2",
      "/api/v1/feed/comments/c1",
    ]);
    expect(f.mock.calls.every(([,opts])=>opts.method==="GET"&&
      opts.credentials==="include"&&opts.cache==="no-store"&&
      (opts.headers as Record<string,string>)["X-Gafus-Auth-Transport"]==="cookie"))
      .toBe(true);
  });
  it("D12 invalid parameters rejected before any network",async()=>{
    const f=vi.fn();vi.stubGlobal("fetch",f);
    await expect(getPostDetailRead("../bad")).rejects.toThrow();
    await expect(getPostDetailComments("post-A","\t")).rejects.toThrow();
    await expect(getPostFocusedComment("post-A","../bad")).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it.each([401,403,404,409,500])("D13 actual %d Hono error not converted to fake empty",async code=>{
    vi.stubGlobal("fetch",vi.fn(async()=>http(null,code)));
    await expect(getPostDetailRead("post-A")).rejects.toMatchObject({status:code});
  });
});
