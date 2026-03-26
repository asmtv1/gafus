-- CreateTable
CREATE TABLE "AppFeatureFlag" (
    "key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppFeatureFlag_pkey" PRIMARY KEY ("key")
);
