import { describe, expect, it } from "vitest";

import { CACHE_TAGS, ADMIN_CACHE_ALL_TAGS } from "./tags";

describe("CACHE_TAGS", () => {
  it("has TRAINER_NOTES as string", () => {
    expect(typeof CACHE_TAGS.TRAINER_NOTES).toBe("string");
    expect(CACHE_TAGS.TRAINER_NOTES).toBe("trainer-notes");
  });

  it("TRAINER_NOTES_BY_TRAINER returns trainer-notes-{id}", () => {
    expect(CACHE_TAGS.TRAINER_NOTES_BY_TRAINER("trainer-abc")).toBe(
      "trainer-notes-trainer-abc",
    );
  });

  it("has COURSES, COURSES_ALL, DAYS, DAY", () => {
    expect(CACHE_TAGS.COURSES).toBe("courses");
    expect(CACHE_TAGS.COURSES_ALL).toBe("courses-all");
    expect(CACHE_TAGS.DAYS).toBe("days");
    expect(CACHE_TAGS.DAY).toBe("day");
  });

  it("all properties are strings or functions returning strings", () => {
    for (const [_key, val] of Object.entries(CACHE_TAGS)) {
      if (typeof val === "function") {
        expect(typeof val("test")).toBe("string");
      } else {
        expect(typeof val).toBe("string");
      }
    }
  });
});

describe("ADMIN_CACHE_ALL_TAGS", () => {
  it("is an array", () => {
    expect(Array.isArray(ADMIN_CACHE_ALL_TAGS)).toBe(true);
  });

  it("contains training, courses, achievements, statistics, streaks", () => {
    expect(ADMIN_CACHE_ALL_TAGS).toContain("training");
    expect(ADMIN_CACHE_ALL_TAGS).toContain("courses");
    expect(ADMIN_CACHE_ALL_TAGS).toContain("achievements");
    expect(ADMIN_CACHE_ALL_TAGS).toContain("statistics");
    expect(ADMIN_CACHE_ALL_TAGS).toContain("streaks");
  });
});
