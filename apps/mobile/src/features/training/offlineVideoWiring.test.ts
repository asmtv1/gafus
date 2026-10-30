import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const step = readFileSync(new URL("./components/AccordionStep.tsx", import.meta.url), "utf8");
const description = readFileSync(new URL("./components/CourseDescription.tsx", import.meta.url), "utf8");
const day = readFileSync(new URL("../../../app/(main)/training/[courseType]/[dayId].tsx", import.meta.url), "utf8");
const course = readFileSync(new URL("../../../app/(main)/training/[courseType]/index.tsx", import.meta.url), "utf8");

describe("real mobile course route wiring for downloaded video", () => {
  it("passes the course type from route to the offline step lookup", () => {
    expect(day).toContain("offlineCourseType={courseType}");
    expect(step).toContain("getOfflineVideoUri(offlineCourseType ?? courseId, videoUrl)");
    expect(step).toContain("getOfflineVideoPosterUri(offlineCourseType ?? courseId, videoUrl)");
  });
  it("renders introduction videos from the course API and resolves them locally when offline", () => {
    expect(course).toContain("videoUrl={courseData.courseVideoUrl}");
    expect(description).toContain("getOfflineVideoUri(courseType, videoUrl)");
    expect(description).toContain("isOffline ? offlineVideoUri : playbackUrl");
  });
});
