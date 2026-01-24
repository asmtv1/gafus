-- CreateTable
CREATE TABLE "TrainerAIChat" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAIChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAIConfig" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "apiKey" VARCHAR(500) NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerAIConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerAIChat_trainerId_createdAt_idx" ON "TrainerAIChat"("trainerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TrainerAIChat_trainerId_idx" ON "TrainerAIChat"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAIConfig_trainerId_key" ON "TrainerAIConfig"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerAIConfig_trainerId_idx" ON "TrainerAIConfig"("trainerId");

-- AddForeignKey
ALTER TABLE "TrainerAIChat" ADD CONSTRAINT "TrainerAIChat_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAIConfig" ADD CONSTRAINT "TrainerAIConfig_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
