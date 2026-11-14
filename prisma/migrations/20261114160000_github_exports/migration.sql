CREATE TYPE "ProjectOperation" AS ENUM ('EXPORT', 'RESTORE', 'WAKE');
CREATE TYPE "GithubExportStatus" AS ENUM ('QUEUED', 'RECOVERING', 'PREPARING', 'PUSHING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "Project" ADD COLUMN "operationId" TEXT,
ADD COLUMN "operationKind" "ProjectOperation",
ADD COLUMN "operationStartedAt" TIMESTAMP(3);

CREATE TABLE "GithubExport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL,
    "status" "GithubExportStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "runId" TEXT,
    "repository" TEXT,
    "repositoryUrl" TEXT,
    "branch" TEXT,
    "baseCommit" TEXT,
    "commitSha" TEXT,
    "error" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "GithubExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GithubExport_projectId_createdAt_idx" ON "GithubExport"("projectId", "createdAt");
CREATE INDEX "GithubExport_userId_status_idx" ON "GithubExport"("userId", "status");
ALTER TABLE "GithubExport" ADD CONSTRAINT "GithubExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
