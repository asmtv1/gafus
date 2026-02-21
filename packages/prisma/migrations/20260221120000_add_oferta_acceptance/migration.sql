-- CreateTable
CREATE TABLE "OfertaAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "paymentId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "documentVersions" JSONB NOT NULL,
    "source" VARCHAR(10) NOT NULL,

    CONSTRAINT "OfertaAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfertaAcceptance_userId_idx" ON "OfertaAcceptance"("userId");

-- CreateIndex
CREATE INDEX "OfertaAcceptance_courseId_idx" ON "OfertaAcceptance"("courseId");

-- CreateIndex
CREATE INDEX "OfertaAcceptance_paymentId_idx" ON "OfertaAcceptance"("paymentId");

-- CreateIndex
CREATE INDEX "OfertaAcceptance_acceptedAt_idx" ON "OfertaAcceptance"("acceptedAt");

-- AddForeignKey
ALTER TABLE "OfertaAcceptance" ADD CONSTRAINT "OfertaAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaAcceptance" ADD CONSTRAINT "OfertaAcceptance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaAcceptance" ADD CONSTRAINT "OfertaAcceptance_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
