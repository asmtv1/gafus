/**
 * Общие утилиты для тестов @gafus/core
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
  };
}

/**
 * Создаёт mock Prisma client для тестов сервисов
 */
export function createMockPrisma() {
  return {
    user: makeModel(),
    course: makeModel(),
    userTraining: makeModel(),
    userStep: makeModel(),
    dayOnCourse: makeModel(),
    stepOnDay: makeModel(),
    pet: makeModel(),
    achievement: makeModel(),
    pushSubscription: makeModel(),
    courseAccess: makeModel(),
    purchase: makeModel(),
    note: makeModel(),
    diary: makeModel(),
    reminder: makeModel(),
    examResult: makeModel(),
    videoProgress: makeModel(),
    userProfile: makeModel(),
    userCourse: makeModel(),
    stepNotification: makeModel(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
}

/**
 * Создаёт mock logger для тестов
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };
}
