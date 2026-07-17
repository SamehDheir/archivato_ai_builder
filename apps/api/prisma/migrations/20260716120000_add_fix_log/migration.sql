-- AlterTable
-- Append-only record of the review fixes the owner approved (R11, FixLogEntry[]).
-- Nullable, so existing rows need no backfill (an absent log reads as "no fixes
-- applied yet"). Owner-only: never crosses onto the public share page.
--
-- It lives on the session rather than on the review report because a review re-run
-- REPLACES the report row wholesale, and the report is carried in version
-- snapshots — so a restore would rewind a log stored there. An audit log that a
-- restore can rewind is not an audit log.
ALTER TABLE "interview_sessions" ADD COLUMN     "fixLog" JSONB;
