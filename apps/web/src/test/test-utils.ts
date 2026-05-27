import { afterEach, vi } from "vitest";

function installLocalStorage() {
  const storage = new Map<string, string>();
  const localStorageMock = {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
}

if (typeof globalThis.localStorage === "undefined") {
  installLocalStorage();
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
