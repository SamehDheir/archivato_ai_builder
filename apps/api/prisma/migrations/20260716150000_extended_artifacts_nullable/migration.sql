-- AlterTable
-- Make `generateExtendedArtifacts` nullable, where NULL means "the owner hasn't
-- decided" and the budget-derived default applies (`resolveExtendedArtifacts`).
--
-- This is non-destructive and preserves the previous migration's guarantee exactly:
-- that migration added the column NOT NULL DEFAULT true, which **backfilled every
-- pre-R12 row to an explicit `true`**. Those rows keep that value here, so existing
-- projects still carry an explicit "yes" rather than falling back to a derivation.
-- Only rows created from now on start NULL.
--
-- Dropping the default is the point: a new session must insert NULL so the toggle
-- at the confirmation gate can keep tracking the budget slot until the owner
-- touches it. With a default of true, "not decided" and "chose yes" were the same
-- value, and correcting the budget at the gate could not move the toggle.
ALTER TABLE "interview_sessions" ALTER COLUMN "generateExtendedArtifacts" DROP DEFAULT;
ALTER TABLE "interview_sessions" ALTER COLUMN "generateExtendedArtifacts" DROP NOT NULL;
