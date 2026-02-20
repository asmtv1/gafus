import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  trackPresentationView,
  trackPresentationEvent,
  trackReengagementClick,
} from "./trackingService";

const mockPresentationViewCreate = vi.fn();
const mockPresentationViewFindFirst = vi.fn();
const mockPresentationViewUpdate = vi.fn();
const mockPresentationEventCreate = vi.fn();
const mockReengagementNotificationUpdate = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    presentationView: {
      create: (...args: unknown[]) => mockPresentationViewCreate(...args),
      findFirst: (...args: unknown[]) => mockPresentationViewFindFirst(...args),
      update: (...args: unknown[]) => mockPresentationViewUpdate(...args),
    },
    presentationEvent: {
      create: (...args: unknown[]) => mockPresentationEventCreate(...args),
    },
    reengagementNotification: {
      update: (...args: unknown[]) => mockReengagementNotificationUpdate(...args),
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

describe("trackPresentationView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates view record for eventType view", async () => {
    mockPresentationViewCreate.mockResolvedValue({});

    const result = await trackPresentationView(
      { sessionId: "s1" },
      "view",
    );

    expect(result).toEqual({ success: true });
    expect(mockPresentationViewCreate).toHaveBeenCalled();
  });

  it("returns success true for valid data", async () => {
    mockPresentationViewCreate.mockResolvedValue({});

    const result = await trackPresentationView({
      sessionId: "s1",
      referrer: "https://example.com",
    });

    expect(result.success).toBe(true);
  });

  it("returns error for invalid data", async () => {
    const result = await trackPresentationView({
      sessionId: "",
    } as Parameters<typeof trackPresentationView>[0]);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("updates existing view for heartbeat eventType", async () => {
    mockPresentationViewFindFirst.mockResolvedValue({
      id: "view-1",
      timeOnPage: 10,
      scrollDepth: 50,
    });
    mockPresentationViewUpdate.mockResolvedValue({});

    const result = await trackPresentationView(
      { sessionId: "s1", timeOnPage: 15 },
      "heartbeat",
    );

    expect(result.success).toBe(true);
    expect(mockPresentationViewFindFirst).toHaveBeenCalled();
    expect(mockPresentationViewUpdate).toHaveBeenCalled();
  });

  it("creates new view when heartbeat but no existing view", async () => {
    mockPresentationViewFindFirst.mockResolvedValue(null);
    mockPresentationViewCreate.mockResolvedValue({});

    const result = await trackPresentationView(
      { sessionId: "s1" },
      "heartbeat",
    );

    expect(result.success).toBe(true);
    expect(mockPresentationViewCreate).toHaveBeenCalled();
  });

  it("updates existing view for exit eventType", async () => {
    mockPresentationViewFindFirst.mockResolvedValue({
      id: "view-1",
      timeOnPage: 30,
      scrollDepth: 80,
    });
    mockPresentationViewUpdate.mockResolvedValue({});

    const result = await trackPresentationView(
      { sessionId: "s1", timeOnPage: 30, scrollDepth: 80 },
      "exit",
    );

    expect(result.success).toBe(true);
    expect(mockPresentationViewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionEndedAt: expect.any(Date),
        }),
      }),
    );
  });
});

describe("trackPresentationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates event record", async () => {
    mockPresentationEventCreate.mockResolvedValue({});

    const result = await trackPresentationEvent({
      sessionId: "s1",
      viewId: null,
      eventType: "click",
      eventName: "cta_click",
    });

    expect(result).toEqual({ success: true });
    expect(mockPresentationEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "s1",
          eventType: "click",
          eventName: "cta_click",
        }),
      }),
    );
  });

  it("returns error when prisma throws", async () => {
    mockPresentationEventCreate.mockRejectedValue(new Error("DB error"));

    const result = await trackPresentationEvent({
      sessionId: "s1",
      viewId: null,
      eventType: "click",
      eventName: "cta",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("DB error");
  });
});

describe("trackReengagementClick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when notificationId empty", async () => {
    const result = await trackReengagementClick("");

    expect(result).toEqual({
      success: false,
      error: "ID уведомления не указан",
    });
  });

  it("updates notification and returns success", async () => {
    mockReengagementNotificationUpdate.mockResolvedValue({});

    const result = await trackReengagementClick("notif-1");

    expect(result).toEqual({ success: true });
    expect(mockReengagementNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-1" },
        data: expect.objectContaining({ clicked: true }),
      }),
    );
  });

  it("returns error when update fails", async () => {
    mockReengagementNotificationUpdate.mockRejectedValue(new Error("Network error"));

    const result = await trackReengagementClick("notif-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });
});
