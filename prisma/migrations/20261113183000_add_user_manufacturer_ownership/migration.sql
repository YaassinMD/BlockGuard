-- Add persisted authentication accounts and optional product ownership.
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Rebuild Product to add a nullable foreign key while preserving every existing row.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "description" TEXT,
    "qrCode" TEXT NOT NULL,
    "blockchainHash" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "manufacturerId" TEXT,
    CONSTRAINT "Product_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("batchNo", "blockchainHash", "category", "createdAt", "description", "id", "isVerified", "manufacturer", "name", "qrCode", "updatedAt", "verifiedCount")
SELECT "batchNo", "blockchainHash", "category", "createdAt", "description", "id", "isVerified", "manufacturer", "name", "qrCode", "updatedAt", "verifiedCount" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_batchNo_key" ON "Product"("batchNo");
CREATE UNIQUE INDEX "Product_qrCode_key" ON "Product"("qrCode");
CREATE UNIQUE INDEX "Product_blockchainHash_key" ON "Product"("blockchainHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- The ledger uses a sequential, unique position; confirm existing values before applying.
CREATE UNIQUE INDEX "Block_index_key" ON "Block"("index");

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
