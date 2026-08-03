-- Phase E3b: in-app notifications, one row per recipient (fan-out at write time).
--
-- Purely additive: one new table, no column added to an existing one and no backfill. Nobody has a
-- history of notifications for events that happened before this table existed, which is correct —
-- the feed starts empty and fills from the next event on.
--
-- Both indexes are (userId, tenantId, ...) because every query is "my notifications, in the
-- workspace I am currently looking at": the unread badge counts on `readAt`, the dropdown list
-- orders on `createdAt`.

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_tenantId_readAt_idx" ON "Notification"("userId", "tenantId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_tenantId_createdAt_idx" ON "Notification"("userId", "tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
