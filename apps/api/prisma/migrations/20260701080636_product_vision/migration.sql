-- CreateTable
CREATE TABLE "product_visions" (
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_visions_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "product_visions" ADD CONSTRAINT "product_visions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
