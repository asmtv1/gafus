/**
 * Fixture для тестов питомцев
 */
function defaultPetFixture() {
  return {
    id: "test-pet-id",
    ownerId: "test-user-id",
    name: "Бобик",
    type: "DOG",
    breed: "Лабрадор",
    birthDate: new Date("2020-01-15"),
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

type PetFixture = ReturnType<typeof defaultPetFixture>;

export function createPetFixture(overrides?: Partial<PetFixture>): Partial<PetFixture> {
  return { ...defaultPetFixture(), ...overrides };
}
