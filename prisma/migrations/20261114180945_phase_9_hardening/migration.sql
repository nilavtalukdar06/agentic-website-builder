-- CreateEnum
CREATE TYPE "SandboxOutcome" AS ENUM ('RESUMED', 'REBUILT', 'FAILED');

-- CreateTable
CREATE TABLE "ThrottleWindow" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ThrottleWindow_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "outcome" "SandboxOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThrottleWindow_windowStart_idx" ON "ThrottleWindow"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE INDEX "SandboxEvent_createdAt_idx" ON "SandboxEvent"("createdAt");
