-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "level" TEXT NOT NULL DEFAULT 'error',
    "appName" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'development',
    "context" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "componentStack" TEXT,
    "additionalContext" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'new',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorLog_appName_level_timestamp_idx" ON "ErrorLog"("appName", "level", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_environment_timestamp_idx" ON "ErrorLog"("environment", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_status_timestamp_idx" ON "ErrorLog"("status", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt" DESC);
