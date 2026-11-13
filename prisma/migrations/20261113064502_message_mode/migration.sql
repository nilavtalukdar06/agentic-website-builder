-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('STANDARD', 'FAST');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mode" "AgentMode" NOT NULL DEFAULT 'STANDARD';
