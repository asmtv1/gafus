import {afterEach,describe,it,expect,vi} from "vitest";
import {projectHiddenAuthorsPage,projectHiddenAuthorsStatus,
  getHiddenAuthorsAccess,getMyHiddenAuthors} from "./hiddenAuthorsReadApi";
const a={id:"userA",name:"Анна",username:"anna",
  avatarUrl:"SECRET_SIGNED_S3",email:"PRIVATE_MAIL",role:"ADMIN"};
const page=(items:unknown[]=[],nextCursor:string|null=null)=>({
  items,nextCursor,serverNow:"2026-10-18T12:00:00.000Z",
  internalToken:"SECRET_INTERNAL",
});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-021 Hono hidden authors typed consumer",()=>{
  it("HA01 project only name, username and stable id; drop private data",()=>{
    const dto=projectHiddenAuthorsPage(page([a]));
    expect(dto.items).toEqual([{id:"userA",username:"anna",name:"Анна"}]);
    expect(JSON.stringify(dto)).not.toMatch(/PRIVATE_|SECRET_|avatarUrl|role/);
  });
  it("HA02 empty and disabled status keep normal shape",()=>{
    expect(projectHiddenAuthorsPage(page())).toEqual({items:[],nextCursor:null});
    expect(projectHiddenAuthorsStatus({enabled:false,private:"SECRET"}))
      .toEqual({enabled:false});
  });
  it.each([
    ["bad username",page([{...a,username:"../../x"}])],
    ["duplicate user",page([a,a])],
    ["bad cursor",page([],"../private")],
    ["bad status",page([{...a,id:""}])],
    ["bad name",page([{...a,name:123}])],
    ["bad serverNow",{...page([a]),serverNow:null}],
  ])("HA03 %s fails closed",(_name,raw)=>{
    expect(()=>projectHiddenAuthorsPage(raw)).toThrow();
  });
  it("HA09 only existing Core GET endpoints with exact pagination",async()=>{
    const fetcher=vi.fn(async(path:string)=>new Response(JSON.stringify({
      success:true,data:path.endsWith("status")?{enabled:true}:page([a]),
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    expect(await getHiddenAuthorsAccess()).toEqual({enabled:true});
    expect((await getMyHiddenAuthors()).items).toHaveLength(1);
    await getMyHiddenAuthors("next1");
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual([
      "/api/v1/feed/status",
      "/api/v1/feed/me/hidden-authors?pageSize=20",
      "/api/v1/feed/me/hidden-authors?cursor=next1&pageSize=20",
    ]);
  });
  it("HA10 invalid cursor never fetches",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await expect(getMyHiddenAuthors("../secret")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401,402,403,404,500])("HA11 HTTP %d fails, never empty",async(status)=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
      success:false,error:"SECRET_SERVER_STACK",
    }),{status})));
    await expect(getMyHiddenAuthors()).rejects.toMatchObject({status});
  });
});
