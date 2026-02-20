/**
 * Fixture для тестов питомцев
 */
import type { Pet } from "@gafus/prisma";

export function createPetFixture(overrides?: Partial<Pet>): Partial<Pet> {
  return {
    id: "test-pet-id",
    ownerId: "test-user-id",
    name: "Бобик",
    type: "DOG",
    breed: "Лабрадор",
    birthDate: new Date("2020-01-15"),
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}
