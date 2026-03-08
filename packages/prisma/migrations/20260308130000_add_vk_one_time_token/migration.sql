-- CreateTable
CREATE TABLE "VkOneTimeToken" (
    "token" TEXT NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkOneTimeToken_pkey" PRIMARY KEY ("token")
);
