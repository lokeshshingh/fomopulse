-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" TEXT NOT NULL DEFAULT 'bottom-left',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "accentColor" TEXT NOT NULL DEFAULT '#111111',
    "initialDelaySec" INTEGER NOT NULL DEFAULT 4,
    "displaySec" INTEGER NOT NULL DEFAULT 8,
    "gapSec" INTEGER NOT NULL DEFAULT 12,
    "randomizeGap" BOOLEAN NOT NULL DEFAULT true,
    "maxPerPage" INTEGER NOT NULL DEFAULT 5,
    "hideOnMobile" BOOLEAN NOT NULL DEFAULT false,
    "excludedPaths" TEXT NOT NULL DEFAULT '/cart
/checkouts
/account',
    "lookbackHours" INTEGER NOT NULL DEFAULT 72,
    "nameStyle" TEXT NOT NULL DEFAULT 'first',
    "anonymousLabel" TEXT NOT NULL DEFAULT 'Someone',
    "showLocation" BOOLEAN NOT NULL DEFAULT true,
    "showTimeAgo" BOOLEAN NOT NULL DEFAULT true,
    "purchaseTemplate" TEXT NOT NULL DEFAULT '{{name}} from {{location}} bought {{product}}',
    "roundupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "roundupWindowHours" INTEGER NOT NULL DEFAULT 24,
    "roundupMinCount" INTEGER NOT NULL DEFAULT 3,
    "roundupTemplate" TEXT NOT NULL DEFAULT '{{count}} people bought {{product}} in the last {{window}}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProofEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT,
    "imageUrl" TEXT,
    "firstName" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProofEvent_shop_occurredAt_idx" ON "ProofEvent"("shop", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProofEvent_shop_orderId_productId_key" ON "ProofEvent"("shop", "orderId", "productId");
