import { PrismaClient } from "@prisma/client";
import { createWebLogger } from "@gafus/logger";
import { recordDatabaseQueryDuration, recordDependencyError } from "@gafus/logger/server-telemetry";

// Создаем логгер для prisma
const logger = createWebLogger("prisma-client");

declare global {
  // Чтобы TypeScript не ругался на расширение globalThis
  var prisma: PrismaClient | undefined;
  var gafusPrismaQueryDurationObserverInstalled: boolean | undefined;
  var gafusPrismaErrorObserverInstalled: boolean | undefined;
}

export const prisma: PrismaClient =
  globalThis.prisma ??
  new PrismaClient({
    // Query SQL/parameters are never written to stdout. When enabled, the
    // engine emits duration-only events consumed below; this is not pool wait.
    log: process.env.GAFUS_DB_QUERY_METRICS === "false"
      ? [{ emit: "event", level: "error" }]
      : [{ emit: "event", level: "query" }, { emit: "event", level: "error" }],
  });

// Prisma's typed $on API depends on the constructor log generic. We preserve
// the public PrismaClient type used across dozens of packages.
if (process.env.GAFUS_DB_QUERY_METRICS !== "false" &&
    !globalThis.gafusPrismaQueryDurationObserverInstalled) {
  const observer = prisma as unknown as {
    $on(event: "query", callback: (data: { duration: number }) => void): void;
  };
  observer.$on("query", ({ duration }) => {
    // Never read, log, export or retain data.query / data.params.
    recordDatabaseQueryDuration(duration);
  });
  globalThis.gafusPrismaQueryDurationObserverInstalled = true;
}

// The Prisma error event can carry SQL/query parameters. Record only the
// dependency class; raw error text never leaves the engine via our logger.
if (!globalThis.gafusPrismaErrorObserverInstalled) {
  const observer = prisma as unknown as {
    $on(event: "error", callback: () => void): void;
  };
  observer.$on("error", () => recordDependencyError("postgresql", "query"));
  globalThis.gafusPrismaErrorObserverInstalled = true;
}

// Логируем подключение к базе данных
logger.info("Prisma client initialized", {
  databaseUrl: process.env.DATABASE_URL ? "configured" : "missing",
  environment: process.env.NODE_ENV || "development",
  logLevel: process.env.GAFUS_DB_QUERY_METRICS === "false" ? "error" : "query-event-duration-only,error",
});

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;
