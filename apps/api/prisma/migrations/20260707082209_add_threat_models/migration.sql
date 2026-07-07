-- CreateTable
CREATE TABLE "threat_models" (
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threat_models_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "threat_models" ADD CONSTRAINT "threat_models_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
