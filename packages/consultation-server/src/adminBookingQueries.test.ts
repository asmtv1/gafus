import { expect, it, vi } from "vitest";
const {findMany,raw,transaction,actor}=vi.hoisted(()=>({findMany:vi.fn(),raw:vi.fn(),transaction:vi.fn(),actor:vi.fn()}));
vi.mock("@gafus/prisma",()=>({Prisma:{sql:(strings:TemplateStringsArray,...values:unknown[])=>({strings:[...strings],values}),join:(values:unknown[],separator:string)=>({values,separator})},prisma:{consultationBooking:{findMany},$transaction:transaction}}));
import {listAdminBookings,listAdminBookingPage} from "./adminBookingQueries.js";

it("admin booking backend uses bounded 500-row SQL projection with nested trainer identity",async()=>{
  findMany.mockResolvedValue([]);
  expect(await listAdminBookings()).toEqual([]);
  expect(findMany).toHaveBeenCalledWith({
    orderBy:{createdAt:"desc"},take:500,
    include:{
      slot:true,
      client:{select:{username:true}},
      cynologist:{select:{userId:true,user:{select:{profile:{select:{fullName:true}}}}}},
    },
  });
});

it("pages all matching history in DB and loads only selected IDs",async()=>{
  findMany.mockClear();raw.mockReset();
  actor.mockResolvedValue({role:"ADMIN"});
  transaction.mockImplementation(async fn=>fn({user:{findUnique:actor},$queryRaw:raw,consultationBooking:{findMany}}));
  raw.mockResolvedValueOnce([{total:550n}]).mockResolvedValueOnce([{id:"b-old"}]);
  const when=new Date("2026-01-01T00:00:00Z");
  findMany.mockResolvedValueOnce([{id:"b-old",status:"COMPLETED",slot:{id:"s",startAt:when,endAt:when,status:"BOOKED"},
    cynologist:{userId:"trainer",user:{profile:{fullName:"Trainer"}}},client:{username:"client"},
    createdAt:when,confirmationDeadlineAt:when}]);
  const result=await listAdminBookingPage("admin",{page:22,pageSize:25,search:"dog%",status:"COMPLETED"});
  expect(result.pagination).toEqual({page:22,pageSize:25,search:"dog%",status:"COMPLETED",total:550});
  expect(result.items[0].id).toBe("b-old");
  expect(findMany.mock.calls[0][0].where).toEqual({id:{in:["b-old"]}});
  expect(raw.mock.calls[1].slice(-2)).toEqual([25,525]);
  expect(JSON.stringify(raw.mock.calls[0])).toContain("dog%");
  expect(JSON.stringify(raw.mock.calls[0])).toContain("COMPLETED");
  expect(transaction.mock.calls[0][1]).toEqual({isolationLevel:"RepeatableRead"});
});
it("rejects unbounded and invalid status pages before touching the DB",async()=>{
  raw.mockClear();
  await expect(listAdminBookingPage("admin",{page:1,pageSize:500,search:"",status:"ALL"})).rejects.toThrow("INVALID_PAGE");
  expect(raw).not.toHaveBeenCalled();
});

it("denies a stale staff role before reading complete booking history",async()=>{
  raw.mockClear();
  actor.mockResolvedValueOnce({role:"MODERATOR"});
  await expect(listAdminBookingPage("former-admin",{page:1,pageSize:25,search:"",status:"ALL"})).rejects.toThrow("FORBIDDEN");
  expect(raw).not.toHaveBeenCalled();
});
