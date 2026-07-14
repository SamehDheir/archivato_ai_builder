-- AlterTable
-- The end client a scoping is for. Nullable: every existing row predates the
-- field and there is nothing to backfill it from, so no default and no data
-- migration — an unset client name simply doesn't render on the card.
ALTER TABLE "interview_sessions" ADD COLUMN     "clientName" TEXT;
