/*
  Warnings:

  - You are about to drop the `project_quota_usage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_quota_usage" DROP CONSTRAINT "project_quota_usage_userId_fkey";

-- DropTable
DROP TABLE "project_quota_usage";
