-- AlterTable
-- Whether this project generates the threat model + QA plan (R12).
--
-- NOT NULL DEFAULT true is the whole back-compat story: every existing row is
-- backfilled to true by the default, so nothing already created changes behaviour.
-- New projects get a budget-derived default at the confirmation gate (see
-- `defaultExtendedArtifacts`), which the owner can override with a toggle.
ALTER TABLE "interview_sessions" ADD COLUMN     "generateExtendedArtifacts" BOOLEAN NOT NULL DEFAULT true;
