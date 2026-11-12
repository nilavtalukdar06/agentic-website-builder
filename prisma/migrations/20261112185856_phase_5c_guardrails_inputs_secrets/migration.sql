-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('READY', 'DRAFT');

-- CreateEnum
CREATE TYPE "InputKind" AS ENUM ('CHOICE', 'TEXT', 'SECRET', 'CONFIRM');

-- CreateEnum
CREATE TYPE "InputStatus" AS ENUM ('PENDING', 'PAUSED', 'ANSWERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SecretAction" AS ENUM ('SET', 'REPLACED', 'DELETED');

-- AlterTable
ALTER TABLE "Version" ADD COLUMN     "runId" TEXT,
ADD COLUMN     "status" "VersionStatus" NOT NULL DEFAULT 'READY',
ALTER COLUMN "number" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InputRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "kind" "InputKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "InputStatus" NOT NULL DEFAULT 'PENDING',
    "answer" JSONB,
    "questionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "InputRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSecret" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" "SecretAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "runId" TEXT,
    "stage" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "categories" TEXT[],
    "textHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InputRequest_projectId_status_idx" ON "InputRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "InputRequest_projectId_questionHash_idx" ON "InputRequest"("projectId", "questionHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSecret_projectId_name_key" ON "ProjectSecret"("projectId", "name");

-- CreateIndex
CREATE INDEX "SecretEvent_projectId_createdAt_idx" ON "SecretEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "GuardEvent_userId_createdAt_idx" ON "GuardEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GuardEvent_projectId_createdAt_idx" ON "GuardEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Version_projectId_status_idx" ON "Version"("projectId", "status");

-- AddForeignKey
ALTER TABLE "InputRequest" ADD CONSTRAINT "InputRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSecret" ADD CONSTRAINT "ProjectSecret_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretEvent" ADD CONSTRAINT "SecretEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
