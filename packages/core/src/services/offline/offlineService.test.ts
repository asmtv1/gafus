import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  getCourseVersion,
  checkCourseUpdates,
  downloadFullCourse,
} from "./offlineService";

const mockCourseFindFirst = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findFirst: (...args: unknown[]) => mockCourseFindFirst(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("getCourseVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns version when course found", async () => {
    mockCourseFindFirst.mockResolvedValue({
      updatedAt: new Date("2024-01-15"),
    });

    const result = await getCourseVersion("fitness");

    expect(result.success).toBe(true);
    expect(result.version).toContain("2024-01-15");
  });

  it("returns error when course not found", async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const result = await getCourseVersion("unknown");

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
  });

  it("returns error on prisma failure", async () => {
    mockCourseFindFirst.mockRejectedValue(new Error("DB error"));

    const result = await getCourseVersion("fitness");

    expect(result.success).toBe(false);
  });
});

describe("checkCourseUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns hasUpdates true when server version newer than client", async () => {
    mockCourseFindFirst.mockResolvedValue({
      updatedAt: new Date("2024-06-01T12:00:00.000Z"),
    });

    const result = await checkCourseUpdates("fitness", "2024-01-01T00:00:00.000Z");

    expect(result.success).toBe(true);
    expect(result.hasUpdates).toBe(true);
    expect(result.serverVersion).toContain("2024-06-01");
  });

  it("returns hasUpdates false when client version same or newer", async () => {
    mockCourseFindFirst.mockResolvedValue({
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const result = await checkCourseUpdates("fitness", "2024-06-01T12:00:00.000Z");

    expect(result.success).toBe(true);
    expect(result.hasUpdates).toBe(false);
    expect(result.serverVersion).toBeDefined();
  });

  it("returns error when course not found", async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const result = await checkCourseUpdates("unknown", "2024-01-01");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error on prisma exception", async () => {
    mockCourseFindFirst.mockRejectedValue(new Error("DB down"));

    const result = await checkCourseUpdates("fitness", "2024-01-01");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("downloadFullCourse", () => {
  const fullCourseMock = {
    id: "c1",
    type: "fitness",
    name: "Фитнес",
    description: "Описание курса",
    shortDesc: "Кратко",
    duration: "30 дней",
    logoImg: "https://cdn/logo.jpg",
    isPrivate: false,
    isPaid: false,
    avgRating: null,
    trainingLevel: "beginner",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-06-01"),
    author: { username: "trainer1" },
    videoUrl: "https://cdn/video.mp4",
    equipment: null,
    dayLinks: [
      {
        id: "dl1",
        order: 1,
        day: {
          id: "day1",
          title: "День 1",
          description: "",
          equipment: "",
          type: "regular",
          showCoursePathExport: false,
          stepLinks: [
            {
              id: "sl1",
              order: 1,
              step: {
                id: "step1",
                title: "Шаг 1",
                description: "",
                type: "TRAINING",
                durationSec: 60,
                estimatedDurationSec: null,
                videoUrl: "https://cdn/step-video.mp4",
                imageUrls: ["https://cdn/img1.jpg"],
                pdfUrls: ["https://cdn/doc1.pdf"],
                checklist: null,
                requiresVideoReport: false,
                requiresWrittenFeedback: false,
                hasTestQuestions: false,
              },
            },
          ],
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns FullCourseData with deduped mediaFiles on success", async () => {
    mockCourseFindFirst.mockResolvedValue(fullCourseMock);

    const result = await downloadFullCourse("fitness");

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.course.id).toBe("c1");
    expect(result.data?.trainingDays).toHaveLength(1);
    expect(result.data?.trainingDays[0].steps).toHaveLength(1);
    expect(result.data?.mediaFiles.videos).toContain("https://cdn/video.mp4");
    expect(result.data?.mediaFiles.videos).toContain("https://cdn/step-video.mp4");
    expect(result.data?.mediaFiles.images).toContain("https://cdn/logo.jpg");
    expect(result.data?.mediaFiles.images).toContain("https://cdn/img1.jpg");
    expect(result.data?.mediaFiles.pdfs).toContain("https://cdn/doc1.pdf");
  });

  it("returns error when course not found", async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const result = await downloadFullCourse("unknown");

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
  });

  it("returns error on prisma exception", async () => {
    mockCourseFindFirst.mockRejectedValue(new Error("DB connection failed"));

    const result = await downloadFullCourse("fitness");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
