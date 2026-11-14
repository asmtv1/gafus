import { describe, expect, it, vi } from "vitest";
import {
  registerTrainerCourseRowsPort, createTrainerCourseRow, readCourseRowAuthor,
  updateTrainerCourseRows, isCourseVersionNoMatch,
  type TrainerCourseRowsPort,
} from "./trainerCourseRowsPort";

describe("Trainer course SQL CAS port", () => {
  it("fails closed before API composition", () => {
    expect(() => readCourseRowAuthor("course-A")).toThrow("TRAINER_COURSE_ROWS_PORT_UNBOUND");
  });
  it("does not fabricate successful writes or swallow CAS/ACL failures", async () => {
    const casError = new Error("COURSE_VERSION_STALE");
    const update = vi.fn().mockRejectedValue(casError);
    const create = vi.fn().mockResolvedValue(undefined);
    const port: TrainerCourseRowsPort = {
      createRow: create, updateRows: update,
      readLogo: vi.fn().mockResolvedValue(null), readAuthor: vi.fn().mockResolvedValue({ authorId: "trainer-A" }),
      readDraft: vi.fn().mockResolvedValue(null),
      readVisibleAfterStale: vi.fn().mockResolvedValue([]),
      deleteDependencies: vi.fn().mockResolvedValue(undefined),
      isVersionMismatch: (error) => error === casError,
    };
    registerTrainerCourseRowsPort(port);
    registerTrainerCourseRowsPort(port);
    expect(() => registerTrainerCourseRowsPort({ ...port }))
      .toThrow("TRAINER_COURSE_ROWS_PORT_ALREADY_BOUND");
    expect(await readCourseRowAuthor("course-A")).toEqual({ authorId: "trainer-A" });
    expect(isCourseVersionNoMatch(casError)).toBe(true);
    await expect(updateTrainerCourseRows({} as never, { id: "trainer-A", role: "TRAINER" }, true))
      .rejects.toBe(casError);
    expect(update).toHaveBeenCalledExactlyOnceWith({}, { id: "trainer-A", role: "TRAINER" }, true);
    await createTrainerCourseRow({} as never, "trainer-A", "type", true, []);
    expect(create).toHaveBeenCalledExactlyOnceWith({}, "trainer-A", "type", true, []);
  });
});
