-- Adaptive interview (Slice): store the pending (AI-generated) question and the
-- latest coverage estimate on the session.
ALTER TABLE "interview_sessions" ADD COLUMN "pendingQuestion" JSONB;
ALTER TABLE "interview_sessions" ADD COLUMN "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0;
