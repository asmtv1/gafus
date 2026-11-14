import { expect, it, vi } from "vitest";
const findMany=vi.hoisted(()=>vi.fn());
vi.mock("@gafus/prisma",()=>({prisma:{consultationBooking:{findMany}}}));
import {listAdminBookings} from "./adminBookingQueries.js";

it("admin booking backend uses bounded 500-row SQL projection with nested trainer identity",async()=>{
  findMany.mockResolvedValue([]);
  expect(await listAdminBookings()).toEqual([]);
  expect(findMany).toHaveBeenCalledWith({
    orderBy:{createdAt:"desc"},take:500,
    include:{
      slot:true,
      client:{select:{username:true}},
      cynologist:{include:{user:{include:{profile:{select:{fullName:true}}}}}},
    },
  });
});
