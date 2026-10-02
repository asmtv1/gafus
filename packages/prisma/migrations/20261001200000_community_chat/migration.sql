-- CreateTable
CREATE TABLE "CommunityChatSendOperation" (
    "id" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "streamMessageId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityChatSendOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityChatAttachment" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityChatSendOperation_streamMessageId_key" ON "CommunityChatSendOperation"("streamMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityChatSendOperation_senderUserId_clientMessageId_key" ON "CommunityChatSendOperation"("senderUserId", "clientMessageId");

-- CreateIndex
CREATE INDEX "CommunityChatAttachment_state_createdAt_idx" ON "CommunityChatAttachment"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "CommunityChatSendOperation" ADD CONSTRAINT "CommunityChatSendOperation_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityChatAttachment" ADD CONSTRAINT "CommunityChatAttachment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
