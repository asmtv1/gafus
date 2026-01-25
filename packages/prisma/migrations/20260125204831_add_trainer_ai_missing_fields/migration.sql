-- Add missing fields to TrainerAIChat
ALTER TABLE "TrainerAIChat" ADD COLUMN "model" TEXT;
ALTER TABLE "TrainerAIChat" ADD COLUMN "attachments" JSONB;

-- Add missing field to TrainerAIConfig
ALTER TABLE "TrainerAIConfig" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openrouter';
