import {describe,it,expect} from "vitest";
import {G04_MOCK_ENDPOINTS,createG04SourceMockConsumer} from
 "../account/g04SourceMockConsumer";
import {CODE_PATH,DELETE_PATH,projectDeletionEligibility,
 projectSessionReadback} from "./accountDeleteReview";
describe("WEB-URL-038 thin profile adapter uses canonical G04 consumer",()=>{
 it("D01 existing Hono paths SAME REFERENCES as single G04 source",()=>{
  expect(CODE_PATH).toBe(G04_MOCK_ENDPOINTS.requestCode);
  expect(DELETE_PATH).toBe(G04_MOCK_ENDPOINTS.deleteAccount);
  expect(CODE_PATH).toBe("/api/v1/user/account/deletion-code");
  expect(DELETE_PATH).toBe("/api/v1/user/account/delete");
 });
 it("D02 shared G04 source sends ONLY exact one POST code shape",async()=>{
  const calls:unknown[]=[];
  const consumer=createG04SourceMockConsumer(async input=>{
   calls.push(input);return {status:200,body:{success:true}};
  });
  await consumer.requestCode("owner");
  expect(calls).toEqual([{operation:"requestCode",path:CODE_PATH,
   method:"POST",ownerId:"owner",json:{}}]);
 });
 it("D03 shared G04 source sends ONLY validated six-digit deletion shape",async()=>{
  const calls:unknown[]=[];
  const consumer=createG04SourceMockConsumer(async input=>{
   calls.push(input);return {status:200,body:{success:true}};
  });
  expect((await consumer.deleteAccount("owner","12345")).kind).toBe("rejected");
  expect(calls).toHaveLength(0);
  await consumer.deleteAccount("owner","012345");
  expect(calls).toEqual([{operation:"deleteAccount",path:DELETE_PATH,
   method:"POST",ownerId:"owner",json:{code:"012345"}}]);
 });
 it("D04 shared G04 source projects 500 response as unknown",async()=>{
  const consumer=createG04SourceMockConsumer(async()=>({
   status:500,body:{success:false,error:"SECRET_DB"},
  }));
  const state=await consumer.deleteAccount("owner","123456");
  expect(state.kind).toBe("unknown");
  expect(JSON.stringify(state)).not.toContain("SECRET_DB");
 });
 it("D05 eligibility whitelists email-ready bit only",()=>{
  expect(projectDeletionEligibility({emailReady:true,email:"PRIVATE_MAIL",
   accessToken:"SECRET_TOKEN"})).toEqual({emailReady:true});
 });
 it("D06 eligibility false permitted without email details",()=>{
  expect(projectDeletionEligibility({emailReady:false})).toEqual({emailReady:false});
 });
 it.each([null,[],{}, {emailReady:"yes"}])(
  "D07 invalid eligibility rejected",raw=>
   expect(()=>projectDeletionEligibility(raw)).toThrow());
 it("D11 GET /auth/me readback never proves deletion",()=>{
  expect(projectSessionReadback({active:false,deleted:true,userId:"PRIVATE"}))
   .toBe("unauthenticated");
  expect(projectSessionReadback({active:true,username:"owner"})).toBe("active");
 });
 it.each([null,{}, {active:"yes"}])(
  "D12 malformed readback unknown",raw=>
   expect(()=>projectSessionReadback(raw)).toThrow());
});
