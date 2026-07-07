-- Add the billing cadence (monthly vs annual) to subscriptions.
-- Orthogonal to `plan`: annual is the same Pro entitlement, only a different
-- price / period length / Paddle price id. Existing rows default to monthly.
ALTER TABLE "subscriptions" ADD COLUMN "billingCycle" TEXT NOT NULL DEFAULT 'monthly';
