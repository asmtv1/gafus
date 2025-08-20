-- CreateTable
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "appName" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "componentStack" TEXT,
    "additionalContext" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorReport_appName_idx" ON "ErrorReport"("appName");

-- CreateIndex
CREATE INDEX "ErrorReport_environment_idx" ON "ErrorReport"("environment");

-- CreateIndex
CREATE INDEX "ErrorReport_resolved_idx" ON "ErrorReport"("resolved");

-- CreateIndex
CREATE INDEX "ErrorReport_createdAt_idx" ON "ErrorReport"("createdAt");
