-- Step 3d: receiving deliveries

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "receivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "purchaseDeliveryId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseDelivery" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "priceTotal" DECIMAL(10,2),
    "pricedById" TEXT,
    "pricedAt" TIMESTAMP(3),
    "expenseId" TEXT,

    CONSTRAINT "PurchaseDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDeliveryLine" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "price" DECIMAL(10,2),

    CONSTRAINT "PurchaseDeliveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseDelivery_expenseId_key" ON "PurchaseDelivery"("expenseId");

-- CreateIndex
CREATE INDEX "PurchaseDelivery_purchaseOrderId_idx" ON "PurchaseDelivery"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseDeliveryLine_deliveryId_purchaseOrderItemId_key" ON "PurchaseDeliveryLine"("deliveryId", "purchaseOrderItemId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseDeliveryId_fkey" FOREIGN KEY ("purchaseDeliveryId") REFERENCES "PurchaseDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDelivery" ADD CONSTRAINT "PurchaseDelivery_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDelivery" ADD CONSTRAINT "PurchaseDelivery_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDelivery" ADD CONSTRAINT "PurchaseDelivery_pricedById_fkey" FOREIGN KEY ("pricedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDelivery" ADD CONSTRAINT "PurchaseDelivery_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDeliveryLine" ADD CONSTRAINT "PurchaseDeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PurchaseDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDeliveryLine" ADD CONSTRAINT "PurchaseDeliveryLine_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
