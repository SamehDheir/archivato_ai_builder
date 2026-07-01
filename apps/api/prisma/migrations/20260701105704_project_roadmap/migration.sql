-- CreateTable
CREATE TABLE "project_roadmaps" (
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_roadmaps_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "project_roadmaps" ADD CONSTRAINT "project_roadmaps_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
