-- AlterTable
ALTER TABLE "Order" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "userAgent" TEXT;

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "customerPhone" TEXT,
    "cartItems" TEXT NOT NULL DEFAULT '[]',
    "cartValue" REAL NOT NULL DEFAULT 0,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "abandonedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "externalId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_sessionToken_key" ON "CheckoutSession"("sessionToken");

-- CreateIndex
CREATE INDEX "CheckoutSession_customerPhone_idx" ON "CheckoutSession"("customerPhone");

-- CreateIndex
CREATE INDEX "CheckoutSession_isConverted_createdAt_idx" ON "CheckoutSession"("isConverted", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_orderId_idx" ON "NotificationLog"("orderId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_recipient_idx" ON "NotificationLog"("recipient");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
