/**
 * TR012 Option A: actual new Core function with in-memory Prisma conditional
 * updateMany; NO SQL, HTTP write, CDN, media, provider, or schema change.
 * Do not confuse @updatedAt source mocking with real DB isolation proof.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  updateMany: vi.fn(), findFirst: vi.fn(), publish: vi.fn(),
  invalidate: vi.fn(), log: vi.fn(), oldUpdate: vi.fn(),
  relationWrite: vi.fn(), otherMutation: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      updateMany: m.updateMany, findFirst: m.findFirst,
      update: m.oldUpdate,
    },
    dayOnCourse: {update: m.relationWrite, deleteMany: m.relationWrite},
    courseAccess: {deleteMany: m.relationWrite, createMany: m.relationWrite},
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: m.log, info: vi.fn(), warn: vi.fn(),
  }),
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateCourseContentCache: m.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: m.publish,
}));
import { updateTrainerCourseNameOnly } from "./trainerCourseNameOnlyService";

const BASE = new Date("2026-10-22T10:02:03.123Z");
const CODE = "PRIVATE_DB_TOKEN_COURSE_OWNER_EMAIL";
const A = {id: "trainer_A", role: "TRAINER"};
const B = {id: "trainer_B", role: "TRAINER"};
const ADMIN = {id: "admin_1", role: "ADMIN"};
type Row = {id: string; authorId: string; name: string; updatedAt: Date};
let row: Row | null;
const input = (name = "New title", revision = BASE.toISOString()) => ({
  courseId: "course_A", name, observedUpdatedAt: revision,
});
const noForbiddenWrites = () => {
  expect(m.oldUpdate).not.toHaveBeenCalled();
  expect(m.relationWrite).not.toHaveBeenCalled();
  expect(m.otherMutation).not.toHaveBeenCalled();
};
const safeLogs = () => {
  const out = JSON.stringify(m.log.mock.calls);
  expect(out).not.toContain(CODE);
  expect(out).not.toContain("trainer_A");
  expect(out).not.toContain("course_A");
  expect(out).not.toContain("stack");
};
beforeEach(() => {
  vi.clearAllMocks();
  row = {id:"course_A", authorId:"trainer_A", name:"Old", updatedAt: BASE};
  m.updateMany.mockImplementation(async (q: {
    where:{id:string;authorId?:string;updatedAt:Date};
    data:{name:string;updatedAt:Date};
  }) => {
    if (!row || q.where.id !== row.id ||
        q.where.authorId !== undefined && q.where.authorId !== row.authorId ||
        q.where.updatedAt.getTime() !== row.updatedAt.getTime()) {
      return {count:0};
    }
    row = {...row, name:q.data.name, updatedAt:new Date(q.data.updatedAt)};
    return {count:1};
  });
  m.findFirst.mockImplementation(async (q: {
    where:{id:string;authorId?:string};select:{updatedAt:boolean};
  }) => row && q.where.id === row.id &&
    (q.where.authorId === undefined || q.where.authorId === row.authorId)
    ? {updatedAt: row.updatedAt} : null);
  m.publish.mockResolvedValue(undefined);
});

describe("TR012 Option A conditional name-only Core write", () => {
  it("owner updates only name + revision in exact atomic owner/CAS predicate", async () => {
    expect(await updateTrainerCourseNameOnly(input("New title"), A))
      .toEqual({status:"updated"});
    expect(m.updateMany).toHaveBeenCalledExactlyOnceWith({
      where:{id:"course_A",authorId:"trainer_A",updatedAt:BASE},
      data:{name:"New title",updatedAt:expect.any(Date)},
    });
    expect(row?.name).toBe("New title");
    expect(row?.updatedAt.getTime()).toBeGreaterThan(BASE.getTime());
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.invalidate).toHaveBeenCalledOnce();
    expect(m.publish).toHaveBeenCalledOnce();
    noForbiddenWrites();
  });
  it("foreign user cannot write, gets masked not_found (no existence leak)", async () => {
    expect(await updateTrainerCourseNameOnly(input(), B))
      .toEqual({status:"not_found"});
    expect(row?.name).toBe("Old");
    expect(m.updateMany).toHaveBeenCalledWith({
      where:{id:"course_A",authorId:"trainer_B",updatedAt:BASE},
      data:{name:"New title",updatedAt:expect.any(Date)},
    });
    expect(m.findFirst).toHaveBeenCalledWith({
      where:{id:"course_A",authorId:"trainer_B"},
      select:{updatedAt:true},
    });
    expect(m.publish).not.toHaveBeenCalled();
    noForbiddenWrites();
  });
  it("missing row is identical masked not_found", async () => {
    row=null;
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"not_found"});
    expect(m.publish).not.toHaveBeenCalled();
    noForbiddenWrites();
  });
  it("ADMIN bypass permitted only with trusted Core actor role ADMIN", async () => {
    expect(await updateTrainerCourseNameOnly(input("Admin rename"), ADMIN))
      .toEqual({status:"updated"});
    expect(m.updateMany).toHaveBeenCalledWith({
      where:{id:"course_A",updatedAt:BASE},
      data:{name:"Admin rename",updatedAt:expect.any(Date)},
    });
    expect(row?.name).toBe("Admin rename");
    noForbiddenWrites();
  });
  it("nontrainer role cannot update or even query course", async () => {
    expect(await updateTrainerCourseNameOnly(input(), {
      id:"guest",role:"USER",
    })).toEqual({status:"not_found"});
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.findFirst).not.toHaveBeenCalled();
    noForbiddenWrites();
  });
  it("stale owner revision returns stale without writing", async () => {
    row={...row!,updatedAt:new Date(BASE.getTime()+4)};
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"stale"});
    expect(row.name).toBe("Old");
    expect(m.findFirst).toHaveBeenCalledOnce();
    expect(m.publish).not.toHaveBeenCalled();
    noForbiddenWrites();
  });
  it("ownership transfer before CAS means owner lost access, not stale", async () => {
    row={...row!,authorId:"trainer_B"};
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"not_found"});
    expect(row.name).toBe("Old");
    noForbiddenWrites();
  });
  it("concurrent same-millisecond observed revision: exactly one CAS commit", async () => {
    const [a,b]=await Promise.all([
      updateTrainerCourseNameOnly(input("One"), A),
      updateTrainerCourseNameOnly(input("Two"), A),
    ]);
    expect([a.status,b.status].sort()).toEqual(["stale","updated"]);
    expect(m.updateMany).toHaveBeenCalledTimes(2);
    expect(m.publish).toHaveBeenCalledOnce();
    expect(["One","Two"]).toContain(row?.name);
    noForbiddenWrites();
  });
  it("explicit revision advances even if Date.now matches observed millisecond", async () => {
    vi.spyOn(Date,"now").mockReturnValue(BASE.getTime());
    try {
      expect(await updateTrainerCourseNameOnly(input(), A))
        .toEqual({status:"updated"});
      expect(row?.updatedAt.getTime()).toBe(BASE.getTime()+1);
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("repeat using observed stale revision cannot silently overwrite", async () => {
    expect(await updateTrainerCourseNameOnly(input("One"), A))
      .toEqual({status:"updated"});
    expect(await updateTrainerCourseNameOnly(input("Two"), A))
      .toEqual({status:"stale"});
    expect(row?.name).toBe("One");
    expect(m.publish).toHaveBeenCalledOnce();
  });
  it("updateMany throws before known CAS: UNKNOWN, never auto retry", async () => {
    m.updateMany.mockRejectedValueOnce(new Error(CODE));
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"unknown"});
    expect(m.updateMany).toHaveBeenCalledOnce();
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.publish).not.toHaveBeenCalled();
    safeLogs(); noForbiddenWrites();
  });
  it("postcommit publication failure is UNKNOWN; successful DB write not undone", async () => {
    m.publish.mockRejectedValueOnce(new Error(CODE));
    expect(await updateTrainerCourseNameOnly(input("Committed"), A))
      .toEqual({status:"unknown"});
    expect(row?.name).toBe("Committed");
    expect(m.updateMany).toHaveBeenCalledOnce();
    expect(m.publish).toHaveBeenCalledOnce();
    safeLogs(); noForbiddenWrites();
  });
  it("owner scoped post-CAS read failure is UNKNOWN not fabricated stale/404", async () => {
    m.updateMany.mockResolvedValueOnce({count:0});
    m.findFirst.mockRejectedValueOnce(new Error(CODE));
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"unknown"});
    safeLogs();
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("invalid/extra fields are rejected before any Prisma call", async () => {
    for (const bad of [
      {...input(),name:""},
      {...input(),name:"x".repeat(501)},
      {...input(),courseId:"../foreign"},
      {...input(),observedUpdatedAt:"2026-10-22T10:02:03Z"},
      {...input(),observedUpdatedAt:"2026-13-99T10:02:03.123Z"},
      {...input(),isPaid:true},
      {...input(),dayLinks:[]},
      {...input(),authorId:"trainer_B"},
    ]) {
      expect(await updateTrainerCourseNameOnly(bad, A))
        .toEqual({status:"invalid"});
    }
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.findFirst).not.toHaveBeenCalled();
    noForbiddenWrites();
  });
  it("precision counterexample: second-level DB timestamps defeat millisecond CAS", async () => {
    const sameSecond = new Date("2026-10-22T10:02:03.000Z");
    row = {...row!, updatedAt: sameSecond};
    const sourceRevision = sameSecond.toISOString();
    const now = vi.spyOn(Date, "now").mockReturnValue(sameSecond.getTime());
    // Deliberately simulate an unsupported DB column that truncates sub-second.
    m.updateMany.mockImplementation(async (q: {
      where:{id:string;authorId:string;updatedAt:Date};
      data:{name:string;updatedAt:Date};
    }) => {
      if (!row || q.where.id !== row.id ||
          q.where.authorId !== row.authorId ||
          row.updatedAt.getTime() !== q.where.updatedAt.getTime()) {
        return {count:0};
      }
      row = {
        ...row, name:q.data.name,
        updatedAt:new Date(Math.floor(q.data.updatedAt.getTime()/1000)*1000),
      };
      return {count:1};
    });
    try {
      expect(await updateTrainerCourseNameOnly(input("First",sourceRevision), A))
        .toEqual({status:"updated"});
      expect(await updateTrainerCourseNameOnly(input("Second",sourceRevision), A))
        .toEqual({status:"updated"});
      expect(row?.name).toBe("Second");
      expect(row?.updatedAt).toEqual(sameSecond);
      // This test is not a guarantee for PostgreSQL, it is a blocker witness.
    } finally {
      now.mockRestore();
    }
  });
  it("publication cache invalidation fault after commit is UNKNOWN with no re-CAS", async () => {
    m.invalidate.mockImplementationOnce(() => { throw new Error(CODE); });
    expect(await updateTrainerCourseNameOnly(input("Committed"), A))
      .toEqual({status:"unknown"});
    expect(row?.name).toBe("Committed");
    expect(m.updateMany).toHaveBeenCalledOnce();
    expect(m.publish).not.toHaveBeenCalled();
    safeLogs(); noForbiddenWrites();
  });
  it("impossible/nonunique updateMany count never treated as confirmed success", async () => {
    m.updateMany.mockResolvedValueOnce({count:2});
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"unknown"});
    expect(m.publish).not.toHaveBeenCalled();
    expect(m.findFirst).not.toHaveBeenCalled();
    noForbiddenWrites();
  });
  it("LEGACY timestamp collision can silently overwrite: HTTP write must remain BLOCKED", async () => {
    // A legacy/full-form write can change the name but leave updatedAt
    // indistinguishable within timestamp resolution (not this CAS writer).
    row={...row!,name:"Legacy concurrent title",updatedAt:BASE};
    expect(await updateTrainerCourseNameOnly(input("Second title"), A))
      .toEqual({status:"updated"});
    // This is a documented LIMITATION, not a protected multi-writer CAS.
    expect(row?.name).toBe("Second title");
    expect(m.updateMany).toHaveBeenCalledOnce();
    noForbiddenWrites();
  });
  it("if observed revision is unchanged after count0, return UNKNOWN not a fabricated 409", async () => {
    m.updateMany.mockResolvedValueOnce({count:0});
    expect(await updateTrainerCourseNameOnly(input(), A))
      .toEqual({status:"unknown"});
    expect(m.findFirst).toHaveBeenCalledOnce();
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("invalid actor identity cannot execute the name-only mutation", async () => {
    expect(await updateTrainerCourseNameOnly(input(), {
      id:"../actor",role:"ADMIN",
    })).toEqual({status:"invalid"});
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
