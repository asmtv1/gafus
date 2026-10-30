import {describe,it,expect,vi,afterEach} from "vitest";
import {projectNotificationPage,projectNotificationStatus,getNotificationHistory,getNotificationAccess} from "./notificationsReadApi";
const n={id:"n1",postId:"p1",kind:"comment",createdAt:"2026-10-18T10:00:00.000Z",readAt:null,targetAvailable:true,actorCount:1,actors:[{id:"a1",username:"user1",name:"Анна",avatarUrl:"PRIVATE_S3"}],private:"SECRET"};
const page=(items:unknown[]=[],nextCursor:string|null=null)=>({items,nextCursor,serverNow:"2026-10-18T12:00:00.000Z"});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-022 notification GET Hono contract",()=>{
 it("N1 strips private fields",()=>{const x=projectNotificationPage(page([n]));expect(x.items[0].actorNames).toEqual(["Анна"]);expect(JSON.stringify(x)).not.toMatch(/PRIVATE_|SECRET|avatarUrl|actorId/);});
 it("N1b retains only validated comment target for reply deep links",()=>{
   const found=projectNotificationPage(page([{...n,kind:"reply",commentId:"c1"}]));
   expect(found.items[0].commentId).toBe("c1");
   expect(()=>projectNotificationPage(page([{...n,commentId:"../private"}])))
     .toThrow("INVALID_NOTIFICATION_ROW");
 });
 it("N2 empty and denied status",()=>{expect(projectNotificationPage(page()).items).toEqual([]);expect(projectNotificationStatus({enabled:false,private:"SECRET"})).toEqual({enabled:false});});
 it.each([page([n,n]),page([{...n,id:"../private"}]),page([{...n,actors:[{...n.actors[0],username:".."}]}]),page([],"../err"),page([{...n,createdAt:"invalid"}])])("N3 fail closed invalid notification",value=>{expect(()=>projectNotificationPage(value)).toThrow();});
 it("N4 precise status+list+cursor GET",async()=>{const fetcher=vi.fn(async(path:string)=>new Response(JSON.stringify({success:true,data:path.endsWith("status")?{enabled:true}:page([n])}),{status:200}));vi.stubGlobal("fetch",fetcher);expect((await getNotificationAccess()).enabled).toBe(true);await getNotificationHistory();await getNotificationHistory("next1");expect(fetcher.mock.calls.map(c=>c[0])).toEqual(["/api/v1/feed/status","/api/v1/feed/notifications?pageSize=20","/api/v1/feed/notifications?cursor=next1&pageSize=20"]);});
 it("N5 invalid cursor no fetch",async()=>{const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);await expect(getNotificationHistory("../a")).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();});
 it.each([401,402,403,404,500])("N6 HTTP %d rejects",async(status)=>{vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({success:false,error:"PRIVATE"}),{status})));await expect(getNotificationHistory()).rejects.toMatchObject({status});});
});
