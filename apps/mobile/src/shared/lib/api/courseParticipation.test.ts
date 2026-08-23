import { describe, expect, it } from "vitest";

import { getCourseStartedUsersCount } from "./courseParticipation";

describe("getCourseStartedUsersCount", () => {
  it("использует серверный агрегат, когда API уже его возвращает", () => {
    expect(getCourseStartedUsersCount({ startedUsersCount: 20 })).toBe(20);
  });

  it("для старого API считает реальные статусы из userCourses", () => {
    expect(
      getCourseStartedUsersCount({
        userCourses: [
          { status: "NOT_STARTED" },
          { status: "IN_PROGRESS" },
          { status: "COMPLETED" },
          { status: "PAUSED" },
          { status: "RESET" },
        ],
      }),
    ).toBe(2);
  });
});
