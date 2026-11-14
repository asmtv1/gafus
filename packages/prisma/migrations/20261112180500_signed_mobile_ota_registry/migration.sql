-- CreateTable
CREATE TABLE "MobileNativeRelease" (
    "id" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "platform" VARCHAR(12) NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "distribution" VARCHAR(32) NOT NULL,
    "bundleId" VARCHAR(160) NOT NULL,
    "appVersion" VARCHAR(32) NOT NULL,
    "buildNumber" VARCHAR(40) NOT NULL,
    "runtimeVersion" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(48) NOT NULL,
    "updateUrl" VARCHAR(512) NOT NULL,
    "signingKeyId" VARCHAR(64) NOT NULL,
    "certificateSha256" VARCHAR(64) NOT NULL,
    "nativeFingerprint" VARCHAR(64) NOT NULL,
    "sourceSha" VARCHAR(40) NOT NULL,
    "embeddedUpdateId" UUID,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileNativeRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilePatchDefinition" (
    "id" UUID NOT NULL,
    "version" VARCHAR(100) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "allowedBases" JSONB NOT NULL,
    "allowedPaths" JSONB NOT NULL,
    "nativeRequirements" JSONB NOT NULL,
    "sourceLocation" VARCHAR(512) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobilePatchDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilePatchApplication" (
    "id" UUID NOT NULL,
    "patchDefinitionId" UUID NOT NULL,
    "nativeReleaseId" UUID NOT NULL,
    "baseSha" VARCHAR(40) NOT NULL,
    "resultSha" VARCHAR(40),
    "operationId" VARCHAR(120) NOT NULL,
    "state" VARCHAR(28) NOT NULL DEFAULT 'DRAFT',
    "initiatedById" VARCHAR(100) NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePatchApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileOtaRelease" (
    "id" UUID NOT NULL,
    "nativeReleaseId" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "platform" VARCHAR(12) NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "channel" VARCHAR(48) NOT NULL,
    "runtimeVersion" VARCHAR(100) NOT NULL,
    "sourceSha" VARCHAR(40) NOT NULL,
    "revision" INTEGER NOT NULL,
    "updateId" UUID NOT NULL,
    "manifestBody" BYTEA NOT NULL,
    "signatureHeader" VARCHAR(1024) NOT NULL,
    "signingKeyId" VARCHAR(64) NOT NULL,
    "state" VARCHAR(28) NOT NULL DEFAULT 'DRAFT',
    "checks" JSONB NOT NULL DEFAULT '{}',
    "appTracerRef" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "MobileOtaRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileOtaArtifact" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "assetKey" VARCHAR(256) NOT NULL,
    "immutableUrl" VARCHAR(1024) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileOtaArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileOtaDeployment" (
    "id" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "platform" VARCHAR(12) NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "channel" VARCHAR(48) NOT NULL,
    "runtimeVersion" VARCHAR(100) NOT NULL,
    "signingKeyId" VARCHAR(64) NOT NULL,
    "activeReleaseId" UUID,
    "previousReleaseId" UUID,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT true,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileOtaDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileOtaAuditEvent" (
    "id" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "operationId" VARCHAR(120) NOT NULL,
    "action" VARCHAR(28) NOT NULL,
    "actorId" VARCHAR(100) NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "resultingVersion" INTEGER NOT NULL,
    "releaseId" UUID,
    "reason" VARCHAR(512) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileOtaAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileNativeRelease_appId_platform_environment_channel_runt_idx" ON "MobileNativeRelease"("appId", "platform", "environment", "channel", "runtimeVersion");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_native_unique_build" ON "MobileNativeRelease"("appId", "platform", "environment", "distribution", "buildNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePatchDefinition_sha256_key" ON "MobilePatchDefinition"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePatchApplication_operationId_key" ON "MobilePatchApplication"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileOtaRelease_updateId_key" ON "MobileOtaRelease"("updateId");

-- CreateIndex
CREATE INDEX "MobileOtaRelease_platform_environment_channel_runtimeVersio_idx" ON "MobileOtaRelease"("platform", "environment", "channel", "runtimeVersion", "state");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_ota_revision_unique" ON "MobileOtaRelease"("appId", "platform", "environment", "channel", "runtimeVersion", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "MobileOtaArtifact_releaseId_assetKey_key" ON "MobileOtaArtifact"("releaseId", "assetKey");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_ota_deployment_unique" ON "MobileOtaDeployment"("appId", "platform", "environment", "channel", "runtimeVersion", "signingKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileOtaAuditEvent_operationId_key" ON "MobileOtaAuditEvent"("operationId");

-- AddForeignKey
ALTER TABLE "MobilePatchApplication" ADD CONSTRAINT "MobilePatchApplication_patchDefinitionId_fkey" FOREIGN KEY ("patchDefinitionId") REFERENCES "MobilePatchDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilePatchApplication" ADD CONSTRAINT "MobilePatchApplication_nativeReleaseId_fkey" FOREIGN KEY ("nativeReleaseId") REFERENCES "MobileNativeRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOtaRelease" ADD CONSTRAINT "MobileOtaRelease_nativeReleaseId_fkey" FOREIGN KEY ("nativeReleaseId") REFERENCES "MobileNativeRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOtaArtifact" ADD CONSTRAINT "MobileOtaArtifact_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "MobileOtaRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOtaDeployment" ADD CONSTRAINT "MobileOtaDeployment_activeReleaseId_fkey" FOREIGN KEY ("activeReleaseId") REFERENCES "MobileOtaRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOtaDeployment" ADD CONSTRAINT "MobileOtaDeployment_previousReleaseId_fkey" FOREIGN KEY ("previousReleaseId") REFERENCES "MobileOtaRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOtaAuditEvent" ADD CONSTRAINT "MobileOtaAuditEvent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "MobileOtaDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
