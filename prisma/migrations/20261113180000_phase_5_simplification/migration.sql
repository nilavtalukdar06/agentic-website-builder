-- DropForeignKey
ALTER TABLE "InputRequest" DROP CONSTRAINT "InputRequest_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectSecret" DROP CONSTRAINT "ProjectSecret_projectId_fkey";

-- DropForeignKey
ALTER TABLE "SecretEvent" DROP CONSTRAINT "SecretEvent_projectId_fkey";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "mode";

-- DropTable
DROP TABLE "InputRequest";

-- DropTable
DROP TABLE "ProjectSecret";

-- DropTable
DROP TABLE "SecretEvent";

-- DropEnum
DROP TYPE "AgentMode";

-- DropEnum
DROP TYPE "InputKind";

-- DropEnum
DROP TYPE "InputStatus";

-- DropEnum
DROP TYPE "SecretAction";
