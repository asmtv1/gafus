import {describe,expect,it,vi} from "vitest";
import type {FeedService,FeedSocialService,FeedPollService} from "@gafus/core/services/feed";
vi.mock("@gafus/queues",()=>({connection:{status:"end"}}));
import {dispatchFeedRequest} from "./index.js";
const actor="user_A",post="post_A";
const close=vi.fn().mockResolvedValue({postId:post,closed:true,canClose:false});
const listVoters=vi.fn().mockResolvedValue({optionId:"opt_A",items:[],nextCursor:null});
function invoke(path:string,method:string,payload?:unknown){
 const url="https://example.test/api/v1/feed"+path;
 return dispatchFeedRequest(actor,new Request(url,{
  method,headers:payload===undefined?undefined:{"content-type":"application/json"},
  body:payload===undefined?undefined:JSON.stringify(payload),
 }),new URL(url).pathname.replace("/api/v1/feed",""),{} as FeedService,{} as FeedSocialService,undefined,
  {close,listVoters} as unknown as FeedPollService);
}
describe("WEB4 manually close registered Feed route",()=>{
 it("POST empty body delegates exact scoped actor/post",async()=>{
  close.mockClear();
  expect(await invoke("/posts/"+post+"/poll/close","POST",{})).toMatchObject({closed:true});
  expect(close).toHaveBeenCalledExactlyOnceWith(actor,post);
 });
 it("GET public poll voter option dispatches precise actor/option + pagination",async()=>{
  listVoters.mockClear();
  const path=`/posts/${post}/poll/options/opt_A/voters?pageSize=10&cursor=actor_X`;
  expect(await invoke(path,"GET")).toMatchObject({optionId:"opt_A",items:[]});
  expect(listVoters).toHaveBeenCalledExactlyOnceWith(actor,post,"opt_A",{pageSize:10,cursor:"actor_X"});
 });
 it("rejects malformed voter list pagination without calling Core",async()=>{
  listVoters.mockClear();
  await expect(invoke(`/posts/${post}/poll/options/opt_A/voters?pageSize=21`,"GET"))
    .rejects.toMatchObject({code:"VALIDATION_ERROR",status:400});
  await expect(invoke(`/posts/${post}/poll/options/opt_A/voters?unknown=1`,"GET"))
    .rejects.toMatchObject({code:"VALIDATION_ERROR",status:400});
  expect(listVoters).not.toHaveBeenCalled();
 });
 it.each([
  ["nonempty body",`/posts/${post}/poll/close`,{force:true},400],
  ["search params",`/posts/${post}/poll/close?unexpected=1`,{},400],
  ["empty segment","/posts//poll/close",{},404],
  ["path traversal","/posts/%2Fadmin/poll/close",{},400],
 ])("rejects %s without calling Core",async(_label,path,payload,status)=>{
  close.mockClear();
  await expect(invoke(path,"POST",payload)).rejects.toMatchObject({status});
  expect(close).not.toHaveBeenCalled();
 });
});
