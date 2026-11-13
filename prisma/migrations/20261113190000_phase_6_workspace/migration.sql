-- CreateEnum
CREATE TYPE "MessageFeedback" AS ENUM ('UP', 'DOWN');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "feedback" "MessageFeedback",
ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "stopRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: link each existing reply to the latest prompt before it
UPDATE "Message" AS reply
SET "replyToId" = (
  SELECT prompt."id"
  FROM "Message" AS prompt
  WHERE prompt."projectId" = reply."projectId"
    AND prompt."role" = 'USER'
    AND prompt."createdAt" <= reply."createdAt"
  ORDER BY prompt."createdAt" DESC
  LIMIT 1
)
WHERE reply."role" = 'ASSISTANT';

UPDATE "Message" SET "startedAt" = "createdAt" WHERE "role" = 'USER';
