import {describe,it,expect,vi} from "vitest";
import {createChat2MediaRecoveryTick} from "./chat2-media-recovery.js";
const current=()=>new Date("2026-10-27T20:00:00.000Z");
function mock(groups:Array<{sourceMime:string;_count:{_all:number}}>) {
 const groupBy=vi.fn(async(_args:unknown)=>groups);
 const photo=vi.fn(async()=>({dispatched:1}));
 const video=vi.fn(async()=>({dispatched:1}));
 return {groupBy,photo,video,run:createChat2MediaRecoveryTick({
   database:{chat2V2MediaTask:{groupBy}} as never,photo:photo as never,video:video as never,now:current,
 })};
}
describe("Chat2 typed durable recovery with 2 independent Cloud Jobs per kind",()=>{
 it("does not launch Cloud when no due records exist",async()=>{
  const x=mock([]);
  expect(await x.run()).toEqual({dispatched:0});
  expect(x.photo).not.toHaveBeenCalled();expect(x.video).not.toHaveBeenCalled();
  expect(x.groupBy).toHaveBeenCalledOnce();
  expect(x.groupBy.mock.calls[0][0]).toMatchObject({
   by:["sourceMime"],where:{attempts:{lt:4}},
  });
 });
 it("launches two video plus two photo Jobs when queue backlog has >=2 of each",async()=>{
  const x=mock([{sourceMime:"image/jpeg",_count:{_all:1}},
   {sourceMime:"image/png",_count:{_all:3}},
   {sourceMime:"video/mp4",_count:{_all:8}}]);
  expect(await x.run()).toEqual({dispatched:4});
  expect(x.photo).toHaveBeenCalledTimes(2);
  expect(x.video).toHaveBeenCalledTimes(2);
 });
 it("launches no video when only an image is due",async()=>{
  const x=mock([{sourceMime:"image/jpeg",_count:{_all:1}}]);
  expect(await x.run()).toEqual({dispatched:1});
  expect(x.photo).toHaveBeenCalledTimes(1);expect(x.video).not.toHaveBeenCalled();
 });
 it("does not launch a second duplicate on failed Cloud dispatch",async()=>{
  const x=mock([{sourceMime:"video/mp4",_count:{_all:3}}]);
  x.video.mockRejectedValueOnce(new Error("CLOUDRU_503"));
  await expect(x.run()).rejects.toThrow("CLOUDRU_503");
  expect(x.video).toHaveBeenCalledTimes(1);
  expect(x.photo).not.toHaveBeenCalled();
 });
});
