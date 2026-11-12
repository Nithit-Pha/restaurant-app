-- Dine-in (Step 1c): staff can merge two table visits into one bill.

-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN     "mergedIntoId" TEXT;
