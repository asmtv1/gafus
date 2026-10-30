import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdown, type ShutdownTasks } from "./graceful-shutdown";

function syntheticTasks() {
  const stopMonitor = vi.fn(() => undefined);
  const closeHttp = vi.fn((callback: (error?: Error) => void) => callback());
  const disconnectDatabase = vi.fn(async () => undefined);
  const quitRedis = vi.fn(async () => undefined);
  const logInfo = vi.fn((_message: string) => undefined);
  const logError = vi.fn((_message: string) => undefined);
  const exit = vi.fn((_code: 0 | 1) => undefined);
  const tasks: ShutdownTasks = {
    stopMonitor,
    closeHttp,
    disconnectDatabase,
    quitRedis,
    logInfo,
    logError,
    exit,
  };
  return { tasks, stopMonitor, closeHttp, disconnectDatabase, quitRedis, logInfo, logError, exit };
}
const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("API shutdown: synthetic handles and exit only; never imports the API entrypoint", () => {
  it("main entrypoint delegates original startup to an import-safe lifecycle with the same routes", () => {
    const entry = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const startup = readFileSync(new URL("./api-server-startup.ts", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
    expect(entry).toContain("if (isDirectApiEntrypoint(import.meta.url, process.argv[1]))");
    expect(entry).toContain("void startApiServer(");
    expect(entry).toContain('import("./app.js")');
    expect(entry).toContain('import("@gafus/queues")');
    expect(entry).toContain('import("./lib/media-cdn-monitor.js")');
    expect(entry).toContain("listen: (port, hostname) =>");
    expect(entry).toContain("serve({ fetch: app.fetch, port, ...(hostname ? { hostname } : {}) })");
    expect(entry).toContain("startMonitor: () => {");
    expect(entry).toContain("const stopMedia = startMediaCdnMonitor(redis);");
    // With outbox recovery disabled, shutdown still owns the original monitor.
    expect(entry).toContain("return stopMedia;");
    // Opt-in outbox recovery must stop both timer and media monitor.
    expect(entry).toContain("clearInterval(timer); stopMedia();");
    expect(startup).toContain("runtime.listen(port, hostname)");
    expect(startup).toContain("const stopMonitor = runtime.startMonitor();");
    expect(startup).toContain("const shutdown = createGracefulShutdown({");
    expect(startup).toContain('runtimeProcess.onSignal("SIGTERM"');
    expect(startup).toContain('runtimeProcess.onSignal("SIGINT"');
    // Guest catalogs are retired: the authenticated course route remains mounted.
    expect(app).toContain('app.use("/api/v1/courses/*", authMiddleware);');
    expect(app).toContain('app.route("/api/v1/courses", coursesRoutes);');
    expect(app).not.toContain('app.route("/api/v1/public/courses", publicCoursesRoutes);');
    expect(entry.indexOf('import("./app.js")')).toBeGreaterThan(
      entry.indexOf("async function loadApiRuntime()"),
    );
  });

  it("successful ordered SIGTERM closes all exactly once, exits 0, removes timeout", async () => {
    const t = syntheticTasks();
    await createGracefulShutdown(t.tasks)("SIGTERM");
    for (const action of [t.stopMonitor, t.closeHttp, t.disconnectDatabase, t.quitRedis])
      expect(action).toHaveBeenCalledTimes(1);
    expect(t.stopMonitor.mock.invocationCallOrder[0]).toBeLessThan(
      t.closeHttp.mock.invocationCallOrder[0]!,
    );
    expect(t.closeHttp.mock.invocationCallOrder[0]).toBeLessThan(
      t.disconnectDatabase.mock.invocationCallOrder[0]!,
    );
    expect(t.closeHttp.mock.invocationCallOrder[0]).toBeLessThan(
      t.quitRedis.mock.invocationCallOrder[0]!,
    );
    expect(t.logInfo).toHaveBeenCalledWith("SIGTERM received, shutting down gracefully");
    expect(t.logError).not.toHaveBeenCalled();
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("original RED scenario: throwing monitor stop still closes HTTP/DB/Redis and exits 1", async () => {
    const t = syntheticTasks();
    t.stopMonitor.mockImplementationOnce(() => {
      throw new Error("PRIVATE_MONITOR_TOKEN");
    });
    await createGracefulShutdown(t.tasks)("SIGINT");
    for (const action of [t.stopMonitor, t.closeHttp, t.disconnectDatabase, t.quitRedis])
      expect(action).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(t.logError).toHaveBeenCalledWith("Media CDN monitor shutdown failed");
    expect(JSON.stringify(t.logError.mock.calls)).not.toContain("PRIVATE_MONITOR_TOKEN");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("async monitor failure also attempts every subsequent cleanup", async () => {
    const t = syntheticTasks();
    t.tasks.stopMonitor = vi.fn(async () => {
      throw Error("monitor failed");
    });
    await createGracefulShutdown(t.tasks)("SIGTERM");
    expect(t.closeHttp).toHaveBeenCalledTimes(1);
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("HTTP close callback error still disconnects both services, with safe error", async () => {
    const t = syntheticTasks();
    t.closeHttp.mockImplementationOnce((callback) => callback(new Error("PRIVATE_SOCKET_ERROR")));
    await createGracefulShutdown(t.tasks)("SIGTERM");
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(t.logError).toHaveBeenCalledWith("HTTP server shutdown failed");
    expect(JSON.stringify(t.logError.mock.calls)).not.toContain("PRIVATE_SOCKET_ERROR");
  });

  it("synchronously throwing HTTP close cannot bypass DB/Redis", async () => {
    const t = syntheticTasks();
    t.closeHttp.mockImplementationOnce(() => {
      throw Error("close threw");
    });
    await createGracefulShutdown(t.tasks)("SIGINT");
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("DB rejects while Redis still runs exactly once", async () => {
    const t = syntheticTasks();
    t.disconnectDatabase.mockRejectedValueOnce(Error("PRIVATE_DB_URL"));
    await createGracefulShutdown(t.tasks)("SIGTERM");
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(t.logError).toHaveBeenCalledWith("Database shutdown failed");
    expect(JSON.stringify(t.logError.mock.calls)).not.toContain("PRIVATE_DB_URL");
  });

  it("Redis rejects while database is attempted exactly once", async () => {
    const t = syntheticTasks();
    t.quitRedis.mockRejectedValueOnce(Error("PRIVATE_REDIS_TOKEN"));
    await createGracefulShutdown(t.tasks)("SIGTERM");
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(t.logError).toHaveBeenCalledWith("Redis shutdown failed");
  });

  it("both DB and Redis reject without short-circuit", async () => {
    const t = syntheticTasks();
    t.disconnectDatabase.mockRejectedValueOnce(Error("db"));
    t.quitRedis.mockRejectedValueOnce(Error("redis"));
    await createGracefulShutdown(t.tasks)("SIGTERM");
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.logError).toHaveBeenCalledTimes(2);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("repeated SIGINT while SIGTERM awaits HTTP does not duplicate any cleanup", async () => {
    const t = syntheticTasks();
    let resolveClose: ((error?: Error) => void) | undefined;
    t.closeHttp.mockImplementationOnce((callback) => {
      resolveClose = callback;
    });
    const shutdown = createGracefulShutdown(t.tasks);
    const pending = shutdown("SIGTERM");
    await flush();
    expect(t.closeHttp).toHaveBeenCalledTimes(1);
    await shutdown("SIGINT");
    expect(t.stopMonitor).toHaveBeenCalledTimes(1);
    expect(t.closeHttp).toHaveBeenCalledTimes(1);
    expect(t.disconnectDatabase).not.toHaveBeenCalled();
    expect(resolveClose).toBeDefined();
    resolveClose?.();
    await pending;
    expect(t.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(t.quitRedis).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hanging HTTP closure force-exits at exactly 10s, never later exits 0", async () => {
    const t = syntheticTasks();
    let resolveClose: ((error?: Error) => void) | undefined;
    t.closeHttp.mockImplementationOnce((callback) => {
      resolveClose = callback;
    });
    const shutdown = createGracefulShutdown(t.tasks);
    const pending = shutdown("SIGTERM");
    await flush();
    await vi.advanceTimersByTimeAsync(9999);
    expect(t.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(t.logError).toHaveBeenCalledWith("Forced shutdown after timeout");
    await shutdown("SIGINT");
    expect(t.closeHttp).toHaveBeenCalledTimes(1);
    resolveClose?.();
    await pending;
    expect(t.exit).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("monitor hangs before HTTP: timeout had already been armed", async () => {
    const t = syntheticTasks();
    let release!: () => void;
    t.tasks.stopMonitor = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = createGracefulShutdown(t.tasks)("SIGTERM");
    await flush();
    expect(t.closeHttp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.exit).toHaveBeenCalledExactlyOnceWith(1);
    release();
    await pending;
    expect(t.exit).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
