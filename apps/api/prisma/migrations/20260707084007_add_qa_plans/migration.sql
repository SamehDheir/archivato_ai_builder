-- CreateTable
CREATE TABLE "qa_plans" (
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qa_plans_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "qa_plans" ADD CONSTRAINT "qa_plans_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
