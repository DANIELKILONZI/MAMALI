-- CreateTable
CREATE TABLE "BlockedCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "blockedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessName" TEXT NOT NULL DEFAULT 'MAMALI',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "themeColor" TEXT NOT NULL DEFAULT '#1e293b',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsFallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StoreSettings" ("businessName", "createdAt", "currency", "id", "logoUrl", "primaryColor", "themeColor", "updatedAt") SELECT "businessName", "createdAt", "currency", "id", "logoUrl", "primaryColor", "themeColor", "updatedAt" FROM "StoreSettings";
DROP TABLE "StoreSettings";
ALTER TABLE "new_StoreSettings" RENAME TO "StoreSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BlockedCustomer_phone_key" ON "BlockedCustomer"("phone");

-- CreateIndex
CREATE INDEX "BlockedCustomer_phone_idx" ON "BlockedCustomer"("phone");
