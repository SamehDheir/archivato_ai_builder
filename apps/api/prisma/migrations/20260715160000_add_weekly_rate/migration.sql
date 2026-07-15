-- AlterTable
-- Owner-only internal weekly rate for pricing (R9). Nullable, so existing rows
-- need no backfill (an absent rate reads as "no suggested price"). Never shown
-- to clients / never crosses onto the public share page.
ALTER TABLE "interview_sessions" ADD COLUMN     "weeklyRate" DOUBLE PRECISION;
