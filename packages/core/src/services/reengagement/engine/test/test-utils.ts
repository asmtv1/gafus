/**
 * Локальные моки для тестов @gafus/reengagement (опция B)
 */
import { vi } from "vitest";

function makeModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createMockPrisma() {
  return {
    user: makeModel(),
    userTraining: makeModel(),
    userStep: makeModel(),
    reengagementCampaign: makeModel(),
    reengagementNotification: makeModel(),
    reengagementMetrics: makeModel(),
    reengagementSettings: makeModel(),
    userCourse: makeModel(),
    courseReview: makeModel(),
    $transaction: vi.fn(),
  };
}

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };
}
