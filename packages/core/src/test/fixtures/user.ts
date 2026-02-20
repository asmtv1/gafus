/**
 * Fixture для тестов пользователей
 */
import type { User } from "@gafus/prisma";

export function createUserFixture(overrides?: Partial<User>): Partial<User> {
  return {
    id: "test-user-id",
    username: "testuser",
    phone: "+79001234567",
    password: "hashed",
    role: "USER",
    isConfirmed: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}
