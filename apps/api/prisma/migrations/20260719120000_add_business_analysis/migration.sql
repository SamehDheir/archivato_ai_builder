-- CreateTable
CREATE TABLE "business_analyses" (
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_analyses_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "business_analyses" ADD CONSTRAINT "business_analyses_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
