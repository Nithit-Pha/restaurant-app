-- Item options and notes: option groups per menu item (e.g. Size, Spice
-- level, Extras), a free-text note per order line, and a copy of the chosen
-- options on each order line. Only adds tables and a nullable column.

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modifier" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemModifier" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierId" TEXT,
    "groupName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModifierGroup_menuItemId_idx" ON "ModifierGroup"("menuItemId");

-- CreateIndex
CREATE INDEX "Modifier_groupId_idx" ON "Modifier"("groupId");

-- CreateIndex
CREATE INDEX "OrderItemModifier_orderItemId_idx" ON "OrderItemModifier"("orderItemId");

-- AddForeignKey
ALTER TABLE "ModifierGroup" ADD CONSTRAINT "ModifierGroup_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "Modifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
