import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  read:vi.fn(async()=>null),list:vi.fn(async()=>[]),
}));
vi.mock("@gafus/course-progress-server/training-day-rows",()=>({
  readTrainingDayForEdit:sql.read,
  insertTrainingDay:vi.fn(async()=>({id:"day-1"})),
  replaceTrainingDay:vi.fn(async()=>({id:"day-1"})),
  deleteTrainingDayRows:vi.fn(async()=>null),
  listVisibleTrainingDays:sql.list,
}));
describe("API trainer day owner-scoped SQL composition",()=>{
  it("injects exact TRAINER actor to SQL and never widens visibility",async()=>{
    const core=await import("@gafus/core/services/trainingDay");
    const { trainingDayRows } = await import("./training-day-rows-instance");
    const trainer={id:"trainer-1",role:"TRAINER" as const};
    await expect(core.getTrainingDayForEdit("day-1",trainer,trainingDayRows)).resolves.toBeNull();
    expect(sql.read).toHaveBeenCalledExactlyOnceWith("day-1",trainer);
    await expect(core.getVisibleDays(trainer.id,false,trainingDayRows)).resolves.toEqual([]);
    expect(sql.list).toHaveBeenCalledExactlyOnceWith(trainer.id,false);
  });
});
