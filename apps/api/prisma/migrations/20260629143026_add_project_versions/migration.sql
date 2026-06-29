-- CreateTable
CREATE TABLE "project_versions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_versions_sessionId_idx" ON "project_versions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_sessionId_version_key" ON "project_versions"("sessionId", "version");

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
