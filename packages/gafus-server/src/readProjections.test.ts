import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({activity:vi.fn(),settings:vi.fn(),update:vi.fn(),create:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  gafusRewardEvent:{findMany:m.activity,create:m.create},
  gafusSettings:{findUnique:m.settings,update:m.update},
}}));
import {listGrantedGafusActivity} from "./activityRead.js";
import {getGafusSettingsRow} from "./settingsRead.js";
const now=new Date("2026-11-07T06:00:00.000Z");
const cutoff=new Date("2026-11-06T06:00:00.000Z");
beforeEach(()=>{vi.clearAllMocks();m.activity.mockResolvedValue([]);m.settings.mockResolvedValue(null)});
describe("owner-only read-side Gafus economy",()=>{
  it("selects strictly granted ACTIVITY within (cutoff, now] for authenticated owner",async()=>{
    await expect(listGrantedGafusActivity("owner-1",cutoff,now)).resolves.toEqual([]);
    expect(m.activity).toHaveBeenCalledExactlyOnceWith({
      where:{userId:"owner-1",rewardClass:"ACTIVITY",decision:"GRANTED",
        occurredAt:{gt:cutoff,lte:now}},
      select:{amount:true,occurredAt:true},orderBy:{occurredAt:"asc"},
    });
    expect(m.update).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
  });
  it("denies absent owner or invalid clocks without querying database",async()=>{
    await expect(listGrantedGafusActivity("",cutoff,now)).rejects.toThrow("GAFUS_STATUS_OWNER_REQUIRED");
    await expect(listGrantedGafusActivity("owner",now,cutoff)).rejects.toThrow("GAFUS_STATUS_TIME_WINDOW_INVALID");
    await expect(listGrantedGafusActivity("owner",new Date("bad"),now)).rejects.toThrow("GAFUS_STATUS_TIME_WINDOW_INVALID");
    expect(m.activity).not.toHaveBeenCalled();
  });
  it("reads only default settings, with no mutation of product pricing",async()=>{
    await expect(getGafusSettingsRow()).resolves.toBeNull();
    expect(m.settings).toHaveBeenCalledExactlyOnceWith({where:{key:"default"}});
    expect(m.update).not.toHaveBeenCalled();
  });
});
