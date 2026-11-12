-- Step 3c: order-day drafts and urgent drafts

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "urgentSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderDayCheck" (
    "supplierId" TEXT NOT NULL,
    "orderDay" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDayCheck_pkey" PRIMARY KEY ("supplierId","orderDay")
);

-- AddForeignKey
ALTER TABLE "OrderDayCheck" ADD CONSTRAINT "OrderDayCheck_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
