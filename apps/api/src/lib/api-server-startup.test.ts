/** Safe API startup lifecycle only. Forbidden modules must NEVER be evaluated here. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  isDirectApiEntrypoint,
  isolatedLocalApiHostname,
  startApiServer,
  type ApiServerRuntime,
} from "./api-server-startup";

vi.mock("@gafus/queues", () => {
  throw Error("UNEXPECTED_QUEUE_IMPORT_ON_PREFLIGHT");
});
vi.mock("@hono/node-server", () => {
  throw Error("UNEXPECTED_SOCKET_IMPORT_ON_PREFLIGHT");
});
vi.mock("@gafus/core/services/systemHealth", () => {
  throw Error("UNEXPECTED_DATABASE_PROVIDER_IMPORT_ON_PREFLIGHT");
});
vi.mock("./media-cdn-monitor", () => {
  throw Error("UNEXPECTED_MONITOR_IMPORT_ON_PREFLIGHT");
});

afterEach(() => vi.restoreAllMocks());

function syntheticRuntime() {
  const calls: string[] = [];
  const close = vi.fn((done: (error?: Error) => void) => {
    calls.push("close");
    done();
  });
  const stop = vi.fn(() => {
    calls.push("stop-monitor");
  });
  const listen = vi.fn((port: number) => {
    calls.push("listen:" + port);
    return { close };
  });
  const startMonitor = vi.fn(() => {
    calls.push("start-monitor");
    return stop;
  });
  const disconnectDatabase = vi.fn(async () => {
    calls.push("disconnect-db");
  });
  const quitRedis = vi.fn(async () => {
    calls.push("quit-redis");
  });
  const logInfo = vi.fn((_text: string) => {
    calls.push("log-info");
  });
  const logError = vi.fn((_text: string) => {
    calls.push("log-error");
  });
  const runtime: ApiServerRuntime = {
    listen,
    startMonitor,
    disconnectDatabase,
    quitRedis,
    logInfo,
    logError,
  };
  const handlers = new Map<string, () => void>();
  const onSignal = vi.fn((signal: "SIGTERM" | "SIGINT", handler: () => void) => {
    calls.push("register:" + signal);
    handlers.set(signal, handler);
  });
  let resolveExit: (code: number) => void = () => undefined;
  const exited = new Promise<number>((done) => {
    resolveExit = done;
  });
  const exit = vi.fn((code: 0 | 1) => {
    calls.push("exit:" + code);
    resolveExit(code);
  });
  return {
    calls,
    close,
    stop,
    listen,
    startMonitor,
    disconnectDatabase,
    quitRedis,
    logInfo,
    logError,
    runtime,
    handlers,
    onSignal,
    exit,
    exited,
  };
}

describe("original API entrypoint — import-safe explicit startup, no app/queue/provider loads", () => {
  it("importing the real entry as a module never loads services, listens, starts a monitor or signals", async () => {
    const before = {
      term: process.listenerCount("SIGTERM"),
      int: process.listenerCount("SIGINT"),
    };
    const imported = await import("../index");
    expect(Object.keys(imported)).toEqual([]);
    expect(process.listenerCount("SIGTERM")).toBe(before.term);
    expect(process.listenerCount("SIGINT")).toBe(before.int);
    // Forbidden module factories above would throw immediately on accidental import.
  });
  it("only direct execution is allowed to start; imported/tested URL stays inert", () => {
    const file = fileURLToPath(new URL("../index.ts", import.meta.url));
    const url = pathToFileURL(file).href;
    expect(isDirectApiEntrypoint(url, file)).toBe(true);
    expect(isDirectApiEntrypoint(url, "src/index.ts")).toBe(true);
    expect(isDirectApiEntrypoint(url, undefined)).toBe(false);
    expect(isDirectApiEntrypoint(url, resolve("apps/api/src/lib/api-server-startup.test.ts"))).toBe(
      false,
    );
  });
  it("startup loads dependencies only explicitly then listen -> monitor -> signal; shutdown uses existing orchestration", async () => {
    const s = syntheticRuntime();
    const loadRuntime = vi.fn(async () => s.runtime);
    expect(loadRuntime).not.toHaveBeenCalled();
    expect(s.listen).not.toHaveBeenCalled();
    expect(s.startMonitor).not.toHaveBeenCalled();
    expect(s.onSignal).not.toHaveBeenCalled();
    await startApiServer(loadRuntime, { onSignal: s.onSignal, exit: s.exit }, 3001);
    expect(loadRuntime).toHaveBeenCalledOnce();
    expect(s.listen).toHaveBeenCalledExactlyOnceWith(3001);
    expect(s.startMonitor).toHaveBeenCalledOnce();
    expect(s.onSignal).toHaveBeenCalledTimes(2);
    expect(s.calls.slice(0, 5)).toEqual([
      "listen:3001",
      "log-info",
      "start-monitor",
      "register:SIGTERM",
      "register:SIGINT",
    ]);
    s.handlers.get("SIGTERM")?.();
    expect(await s.exited).toBe(0);
    expect(s.stop).toHaveBeenCalledOnce();
    expect(s.close).toHaveBeenCalledOnce();
    expect(s.disconnectDatabase).toHaveBeenCalledOnce();
    expect(s.quitRedis).toHaveBeenCalledOnce();
    expect(s.calls.indexOf("stop-monitor")).toBeLessThan(s.calls.indexOf("close"));
    expect(s.calls.indexOf("close")).toBeLessThan(s.calls.indexOf("disconnect-db"));
    expect(s.calls.indexOf("close")).toBeLessThan(s.calls.indexOf("quit-redis"));
    s.handlers.get("SIGINT")?.();
    expect(s.exit).toHaveBeenCalledTimes(1);
    expect(s.stop).toHaveBeenCalledTimes(1);
  });
  it("failed monitor after HTTP listen closes that listener and both DB and Redis resources", async () => {
    const s = syntheticRuntime();
    s.startMonitor.mockImplementationOnce(() => {
      throw Error("MONITOR_START_FAILED");
    });
    await expect(
      startApiServer(async () => s.runtime, { onSignal: s.onSignal, exit: s.exit }, 3001),
    ).rejects.toThrow("MONITOR_START_FAILED");
    expect(s.listen).toHaveBeenCalledOnce();
    expect(s.startMonitor).toHaveBeenCalledOnce();
    expect(s.close).toHaveBeenCalledOnce();
    expect(s.disconnectDatabase).toHaveBeenCalledOnce();
    expect(s.quitRedis).toHaveBeenCalledOnce();
    expect(s.onSignal).not.toHaveBeenCalled();
    expect(s.exit).not.toHaveBeenCalled();
  });
  it("failed listen still releases initialized DB and Redis resources without monitor or signals", async () => {
    const s = syntheticRuntime();
    s.listen.mockImplementationOnce(() => {
      throw Error("LISTENER_START_FAILED");
    });
    await expect(
      startApiServer(async () => s.runtime, { onSignal: s.onSignal, exit: s.exit }, 3001),
    ).rejects.toThrow("LISTENER_START_FAILED");
    expect(s.startMonitor).not.toHaveBeenCalled();
    expect(s.close).not.toHaveBeenCalled();
    expect(s.disconnectDatabase).toHaveBeenCalledOnce();
    expect(s.quitRedis).toHaveBeenCalledOnce();
    expect(s.onSignal).not.toHaveBeenCalled();
    expect(s.exit).not.toHaveBeenCalled();
  });
  it("failed dependency loading cannot listen, enqueue, start monitor or install signals", async () => {
    const s = syntheticRuntime();
    await expect(
      startApiServer(
        async () => {
          throw Error("ISOLATED_LOAD_FAILED");
        },
        { onSignal: s.onSignal, exit: s.exit },
        3001,
      ),
    ).rejects.toThrow("ISOLATED_LOAD_FAILED");
    expect(s.listen).not.toHaveBeenCalled();
    expect(s.startMonitor).not.toHaveBeenCalled();
    expect(s.onSignal).not.toHaveBeenCalled();
    expect(s.exit).not.toHaveBeenCalled();
  });
});

describe("explicit isolated original API boot boundary (no provider/HTTP execution)", () => {
  const local = (): NodeJS.ProcessEnv => ({
    GAFUS_LOCAL_ISOLATED_API: "1",
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: "3001",
    DATABASE_URL:
      "postgresql://gafus_refactor_local_real:isolated-test-only@127.0.0.1:55921/gafus_refactor_real_work_20261024?schema=public",
    REDIS_URL: "redis://127.0.0.1:55927/1",
    CDN_HEALTH_MONITOR_ENABLED: "false",
    GALLERY_ENABLED: "false",
    FEED_ENABLED: "false",
  });
  it("without explicit grant retains original production listener contract", () => {
    expect(isolatedLocalApiHostname({ NODE_ENV: "production" })).toBeUndefined();
  });
  it("allows only approved isolated local DB, Redis and loopback host", () => {
    expect(isolatedLocalApiHostname(local())).toBe("127.0.0.1");
  });
  it.each([
    { API_HOST: "0.0.0.0" },
    { API_PORT: "3002" },
    { REDIS_URL: "redis://127.0.0.1:6379/1" },
    { REDIS_URL: "redis://example.com:55927/1" },
    { DATABASE_URL: "postgresql://asmtv1@localhost:5432/gafus_refactor_real_work_20261024" },
    {
      DATABASE_URL:
        "postgresql://gafus_refactor_local_real:isolated-test-only@127.0.0.1:55921/gafus_refactor_real_20261023?schema=public",
    },
    {
      DATABASE_URL:
        "postgresql://gafus_refactor_local_real@127.0.0.1:55921/gafus_refactor_real_work_20261024?schema=public",
    },
    {
      DATABASE_URL:
        "postgresql://asmtv1:isolated-test-only@127.0.0.1:55921/gafus_refactor_real_work_20261024?schema=public",
    },
    {
      DATABASE_URL:
        "postgresql://gafus_refactor_local_real:isolated-test-only@127.0.0.1:55921/gafus_refactor_real_work_20261024?host=/tmp/s",
    },
    { CDN_HEALTH_MONITOR_ENABLED: "true" },
    { GALLERY_ENABLED: "true" },
    { AWS_ACCESS_KEY_ID: "forbidden" },
    { NODE_ENV: "production" },
  ])("rejects mismatched resource or external provider before imports %#", (override) => {
    expect(() =>
      isolatedLocalApiHostname({ ...local(), ...override } as NodeJS.ProcessEnv),
    ).toThrow("LOCAL_API_ISOLATION_PREFLIGHT_DENIED");
  });
  it("refuses Chat2 manual startup without explicitly isolated private attachment storage", () => {
    const chat2 = {
      ...local(), API_PORT: "3003", GAFUS_CHAT2_LOCAL_MANUAL_TEST: "1",
      CHAT2_API_ENABLED: "enabled", GAFUS_ISOLATED_NONPROD_S3: "enabled",
      GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
      GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
      GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
      GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
      GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE: "1",
      CLOUDRU_MEDIA_JOBS_ENABLED: "false",
      GALLERY_MEDIA_FALLBACK_ENABLED: "false", FEED_MEDIA_FALLBACK_ENABLED: "false",
    };
    expect(() => isolatedLocalApiHostname(chat2)).toThrow("LOCAL_API_ISOLATION_PREFLIGHT_DENIED");
    expect(isolatedLocalApiHostname({ ...chat2, CHAT2_PRIVATE_MEDIA_ENABLED: "isolated-dev-only" }))
      .toBe("127.0.0.1");
    expect(() => isolatedLocalApiHostname({ ...chat2, CHAT2_PRIVATE_MEDIA_ENABLED: "enabled" }))
      .toThrow("LOCAL_API_ISOLATION_PREFLIGHT_DENIED");
  });
  it("permits gallery+feed only for the exact loopback test-bucket runtime with external processing off", () => {
    const isolated = {
      ...local(), GAFUS_ISOLATED_NONPROD_S3: "enabled",
      GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
      GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
      GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
      GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
      GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE: "1",
      CLOUDRU_MEDIA_JOBS_ENABLED: "false",
      GALLERY_MEDIA_FALLBACK_ENABLED: "false",
      FEED_MEDIA_FALLBACK_ENABLED: "false",
      GALLERY_ENABLED: "true", FEED_ENABLED: "true", FEED_PROCESSOR_READY: "true",
    };
    expect(isolatedLocalApiHostname(isolated)).toBe("127.0.0.1");
    for (const unsafe of [
      { GAFUS_ISOLATED_NONPROD_S3: undefined },
      { GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE: undefined },
      { GAFUS_ISOLATED_S3_ENDPOINT: "http://localhost:9000" },
      { GAFUS_ISOLATED_S3_ENDPOINT: "https://s3.cloud.ru" },
      { GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-documents-private" },
      { GAFUS_ISOLATED_S3_GALLERY_BUCKET: "another-bucket" },
      { GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-public" },
      { CLOUDRU_MEDIA_JOBS_ENABLED: "true" },
      { GALLERY_MEDIA_FALLBACK_ENABLED: "true" },
      { FEED_MEDIA_FALLBACK_ENABLED: "true" },
      { AWS_ACCESS_KEY_ID: "forbidden" },
      { API_PORT: "3002" },
      { NODE_ENV: "production" },
      { DATABASE_URL: "postgresql://any@127.0.0.1:5432/test" },
    ]) {
      expect(() => isolatedLocalApiHostname({ ...isolated, ...unsafe } as NodeJS.ProcessEnv))
        .toThrow("LOCAL_API_ISOLATION_PREFLIGHT_DENIED");
    }
  });
  it("passes localhost hostname to normal injected listener without opening a port", async () => {
    const s = syntheticRuntime();
    const load = vi.fn(async () => s.runtime);
    await startApiServer(
      load,
      { onSignal: s.onSignal, exit: s.exit },
      3001,
      isolatedLocalApiHostname(local()),
    );
    expect(s.listen).toHaveBeenCalledExactlyOnceWith(3001, "127.0.0.1");
    s.handlers.get("SIGINT")?.();
    expect(await s.exited).toBe(0);
  });
});
