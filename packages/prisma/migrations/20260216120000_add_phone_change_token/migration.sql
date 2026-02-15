-- AlterTable
ALTER TABLE "User" ADD COLUMN "phoneChangeRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PhoneChangeToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneChangeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneChangeToken_shortCode_key" ON "PhoneChangeToken"("shortCode");

-- AddForeignKey
ALTER TABLE "PhoneChangeToken" ADD CONSTRAINT "PhoneChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
