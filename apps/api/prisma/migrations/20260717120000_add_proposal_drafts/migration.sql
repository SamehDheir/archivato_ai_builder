-- AlterTable
-- The last 5 proposal cover messages generated for a project (R13, ProposalDraft[]).
--
-- Nullable with no default, exactly like `fixLog`: NULL means "no message has ever
-- been written for this project", which is the truth for every existing row and is
-- what `appendProposalDraft(null, draft)` already expects. Nothing is backfilled
-- and no existing behaviour changes.
ALTER TABLE "interview_sessions" ADD COLUMN     "proposalDrafts" JSONB;
