-- AlterTable
-- Slot-filling interview (R6). Both nullable Json snapshots derived from the
-- transcript, so existing rows need no backfill — an absent snapshot reads as
-- "no slots filled" everywhere it's consumed.
ALTER TABLE "interview_sessions" ADD COLUMN     "slots" JSONB;
ALTER TABLE "interview_sessions" ADD COLUMN     "openQuestions" JSONB;
