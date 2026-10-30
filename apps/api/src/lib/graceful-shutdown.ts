/**
 * API entrypoint shutdown orchestration, isolated from server/Redis/DB imports.
 * Cleanup actions and process exit are provided only by the real entrypoint.
 */
export type ShutdownTasks = {
  stopMonitor: () => void | Promise<void>;
  closeHttp: (onClosed: (error?: Error) => void) => void;
  disconnectDatabase: () => Promise<void>;
  quitRedis: () => Promise<unknown>;
  logInfo: (message: string) => void;
  logError: (message: string) => void;
  exit: (code: 0 | 1) => void;
};

const FORCE_EXIT_AFTER_MS = 10_000;

export function createGracefulShutdown(tasks: ShutdownTasks) {
  let isShuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    let failed = false;
    let exited = false;
    const exitOnce = (code: 0 | 1) => {
      if (exited) return;
      exited = true;
      tasks.exit(code);
    };
    const reportError = (message: string) => {
      failed = true;
      try {
        tasks.logError(message);
      } catch {
        // Logging must never prevent another cleanup or the exit deadline.
      }
    };
    const reportInfo = (message: string) => {
      try {
        tasks.logInfo(message);
      } catch {
        reportError("Shutdown logging failed");
      }
    };
    const cleanup = async (name: string, action: () => void | Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch {
        reportError(`${name} shutdown failed`);
        return false;
      }
    };

    // Arm the deadline before attempting even the first cleanup.
    const forceExitTimeout = setTimeout(() => {
      reportError("Forced shutdown after timeout");
      exitOnce(1);
    }, FORCE_EXIT_AFTER_MS);

    try {
      reportInfo(`${signal} received, shutting down gracefully`);
      await cleanup("Media CDN monitor", tasks.stopMonitor);

      const closed = await cleanup(
        "HTTP server",
        () =>
          new Promise<void>((resolve, reject) => {
            tasks.closeHttp((error) => (error ? reject(error) : resolve()));
          }),
      );
      if (closed) reportInfo("HTTP server closed");

      // Attempt both independently even if either fails, preserving parallel close.
      const [dbClosed, redisClosed] = await Promise.all([
        cleanup("Database", tasks.disconnectDatabase),
        cleanup("Redis", tasks.quitRedis),
      ]);
      if (dbClosed && redisClosed) reportInfo("Database and Redis connections closed");
    } finally {
      clearTimeout(forceExitTimeout);
      exitOnce(failed ? 1 : 0);
    }
  };
}
