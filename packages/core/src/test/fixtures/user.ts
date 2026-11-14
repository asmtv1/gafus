/**
 * Fixture для тестов пользователей
 */
function defaultUserFixture() {
  return {
    id: "test-user-id",
    username: "testuser",
    phone: "+79001234567",
    password: "hashed",
    role: "USER",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

type UserFixture = ReturnType<typeof defaultUserFixture>;

export function createUserFixture(overrides?: Partial<UserFixture>): Partial<UserFixture> {
  return { ...defaultUserFixture(), ...overrides };
}
