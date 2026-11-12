-- Step 3a: suppliers and the ordering settings of ingredients. Only adds.

-- CreateEnum
CREATE TYPE "OrderFrequency" AS ENUM ('DAILY', 'WEEKLY', 'EVERY_N_DAYS', 'MONTHLY');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "emergencyLevel" DECIMAL(12,3),
ADD COLUMN     "lastPackPrice" DECIMAL(12,2),
ADD COLUMN     "packName" TEXT,
ADD COLUMN     "packSize" DECIMAL(12,3) NOT NULL DEFAULT 1,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "targetLevel" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "lineId" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "OrderFrequency" NOT NULL DEFAULT 'WEEKLY',
    "weekdays" INTEGER[],
    "everyNDays" INTEGER,
    "startDate" TEXT,
    "monthDay" INTEGER,
    "draftTime" TEXT,
    "cutOffTime" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "minOrder" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Ingredient_supplierId_idx" ON "Ingredient"("supplierId");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
