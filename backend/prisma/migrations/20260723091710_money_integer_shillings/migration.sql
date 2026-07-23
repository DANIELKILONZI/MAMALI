/*
  Warnings:

  - You are about to alter the column `cartValue` on the `CheckoutSession` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `minOrderValue` on the `Coupon` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `discountAmount` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `subtotal` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `total` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `price` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `total` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `price` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "customerPhone" TEXT,
    "cartItems" TEXT NOT NULL DEFAULT '[]',
    "cartValue" INTEGER NOT NULL DEFAULT 0,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "abandonedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CheckoutSession" ("abandonedAt", "cartItems", "cartValue", "createdAt", "customerPhone", "id", "isConverted", "orderId", "sessionToken", "updatedAt") SELECT "abandonedAt", "cartItems", "cartValue", "createdAt", "customerPhone", "id", "isConverted", "orderId", "sessionToken", "updatedAt" FROM "CheckoutSession";
DROP TABLE "CheckoutSession";
ALTER TABLE "new_CheckoutSession" RENAME TO "CheckoutSession";
CREATE UNIQUE INDEX "CheckoutSession_sessionToken_key" ON "CheckoutSession"("sessionToken");
CREATE INDEX "CheckoutSession_customerPhone_idx" ON "CheckoutSession"("customerPhone");
CREATE INDEX "CheckoutSession_isConverted_createdAt_idx" ON "CheckoutSession"("isConverted", "createdAt");
CREATE TABLE "new_Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" REAL NOT NULL,
    "minOrderValue" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Coupon" ("code", "createdAt", "description", "discountType", "discountValue", "expiresAt", "id", "isActive", "maxUses", "minOrderValue", "updatedAt", "usedCount") SELECT "code", "createdAt", "description", "discountType", "discountValue", "expiresAt", "id", "isActive", "maxUses", "minOrderValue", "updatedAt", "usedCount" FROM "Coupon";
DROP TABLE "Coupon";
ALTER TABLE "new_Coupon" RENAME TO "Coupon";
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "total" INTEGER NOT NULL,
    "assignedToId" TEXT,
    "notes" TEXT,
    "expiresAt" DATETIME,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskFlags" TEXT NOT NULL DEFAULT '[]',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("assignedToId", "couponCode", "createdAt", "customerName", "customerPhone", "discountAmount", "expiresAt", "id", "ipAddress", "notes", "orderNumber", "riskFlags", "riskScore", "status", "subtotal", "total", "updatedAt", "userAgent") SELECT "assignedToId", "couponCode", "createdAt", "customerName", "customerPhone", "discountAmount", "expiresAt", "id", "ipAddress", "notes", "orderNumber", "riskFlags", "riskScore", "status", "subtotal", "total", "updatedAt", "userAgent" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_riskScore_idx" ON "Order"("riskScore");
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "id", "name", "orderId", "price", "productId", "quantity", "total") SELECT "createdAt", "id", "name", "orderId", "price", "productId", "quantity", "total" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,
    "mpesaReceiptNumber" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultCode" TEXT,
    "resultDesc" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "checkoutRequestId", "createdAt", "id", "idempotencyKey", "merchantRequestId", "mpesaReceiptNumber", "orderId", "phoneNumber", "resultCode", "resultDesc", "status", "updatedAt") SELECT "amount", "checkoutRequestId", "createdAt", "id", "idempotencyKey", "merchantRequestId", "mpesaReceiptNumber", "orderId", "phoneNumber", "resultCode", "resultDesc", "status", "updatedAt" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
CREATE UNIQUE INDEX "Payment_checkoutRequestId_key" ON "Payment"("checkoutRequestId");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 5,
    "images" TEXT NOT NULL DEFAULT '[]',
    "categoryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "discountEndsAt" DATETIME,
    "boostScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("boostScore", "categoryId", "createdAt", "description", "discount", "discountEndsAt", "id", "images", "isActive", "isFeatured", "name", "price", "reorderLevel", "slug", "stock", "updatedAt") SELECT "boostScore", "categoryId", "createdAt", "description", "discount", "discountEndsAt", "id", "images", "isActive", "isFeatured", "name", "price", "reorderLevel", "slug", "stock", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_isActive_isFeatured_idx" ON "Product"("isActive", "isFeatured");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
