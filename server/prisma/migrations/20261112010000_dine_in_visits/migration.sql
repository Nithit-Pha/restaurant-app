-- Dine-in (Step 1b): table visits, guest orders without an account.

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'DINE_IN';

-- AlterTable: dine-in guests order without an account; orders link to a visit.
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL,
ADD COLUMN     "tableSessionId" TEXT;

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "tableId" TEXT,
    "tableLabel" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "guests" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "staffCalledAt" TIMESTAMP(3),
    "billRequestedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableSession_tableId_closedAt_idx" ON "TableSession"("tableId", "closedAt");

-- CreateIndex
CREATE INDEX "Order_tableSessionId_idx" ON "Order"("tableSessionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
