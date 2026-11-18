-- AlterTable
ALTER TABLE "user" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EmailUsage" (
    "day" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "alertedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailUsage_pkey" PRIMARY KEY ("day")
);
