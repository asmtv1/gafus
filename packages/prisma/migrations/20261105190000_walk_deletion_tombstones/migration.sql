CREATE TABLE "DogWalkTombstone" (
 "userId" TEXT NOT NULL,
 "clientId" VARCHAR(64) NOT NULL,
 "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DogWalkTombstone_pkey" PRIMARY KEY ("userId","clientId")
);
ALTER TABLE "DogWalkTombstone" ADD CONSTRAINT "DogWalkTombstone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
