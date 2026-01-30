-- CreateTable
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOnCourseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiaryEntry_userId_dayOnCourseId_key" ON "DiaryEntry"("userId", "dayOnCourseId");

-- CreateIndex
CREATE INDEX "DiaryEntry_userId_idx" ON "DiaryEntry"("userId");

-- CreateIndex
CREATE INDEX "DiaryEntry_dayOnCourseId_idx" ON "DiaryEntry"("dayOnCourseId");

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_dayOnCourseId_fkey" FOREIGN KEY ("dayOnCourseId") REFERENCES "DayOnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
