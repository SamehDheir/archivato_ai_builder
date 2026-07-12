-- CreateTable
CREATE TABLE "share_links" (
    "sessionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
