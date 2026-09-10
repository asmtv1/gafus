CREATE TABLE "VkIdOneTimeLogin" (
  "id" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
  "consentCompletedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VkIdOneTimeLogin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VkIdOneTimeLogin_tokenHash_key" ON "VkIdOneTimeLogin"("tokenHash");
CREATE INDEX "VkIdOneTimeLogin_userId_expiresAt_idx" ON "VkIdOneTimeLogin"("userId", "expiresAt");
CREATE INDEX "VkIdOneTimeLogin_expiresAt_idx" ON "VkIdOneTimeLogin"("expiresAt");

ALTER TABLE "VkIdOneTimeLogin" ADD CONSTRAINT "VkIdOneTimeLogin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
