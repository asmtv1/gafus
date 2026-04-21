import { vi } from "vitest";

process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

vi.mock("ioredis", () => {
  class MockRedis {
    constructor(..._args: unknown[]) {}

    on() {
      return this;
    }

    script() {
      return Promise.resolve("sha");
    }

    evalsha() {
      return Promise.resolve(1);
    }

    decr() {
      return Promise.resolve(1);
    }

    del() {
      return Promise.resolve(1);
    }
  }
  return { default: MockRedis, Redis: MockRedis };
});
