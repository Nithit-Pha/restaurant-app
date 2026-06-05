import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Seed Super Admin
  const superAdminPassword = await bcrypt.hash('superadmin123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@restaurant.com' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'superadmin@restaurant.com',
      password: superAdminPassword,
      role: Role.SUPER_ADMIN,
    },
  });
  console.log('Super Admin created:', superAdmin.email);

  // Seed Staff
  const staffPassword = await bcrypt.hash('staff123', 12);
  const staff = await prisma.user.upsert({
    where: { email: 'staff@restaurant.com' },
    update: {},
    create: {
      name: 'Staff Member',
      email: 'staff@restaurant.com',
      password: staffPassword,
      role: Role.STAFF,
    },
  });
  console.log('Staff created:', staff.email);

  // Seed default settings
  const defaults = {
    TAX_RATE: '0.07',
    DELIVERY_BASE_FEE: '3.99',
    DELIVERY_FEE_PER_KM: '1.00',
    DELIVERY_FREE_KM: '3',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log('Default settings seeded');

  // Seed sample menu items
  const menuItems = [
    { name: 'Spring Rolls', description: 'Crispy vegetable spring rolls with sweet chili dipping sauce', category: 'Appetizers', costPrice: 2.5, sellingPrice: 7.99 },
    { name: 'Grilled Chicken Burger', description: 'Juicy grilled chicken breast with lettuce, tomato, and aioli', category: 'Mains', costPrice: 5.0, sellingPrice: 14.99 },
    { name: 'Margherita Pizza', description: 'Classic tomato, mozzarella, and fresh basil', category: 'Mains', costPrice: 4.5, sellingPrice: 13.99 },
    { name: 'Caesar Salad', description: 'Romaine lettuce, parmesan, croutons, Caesar dressing', category: 'Appetizers', costPrice: 2.0, sellingPrice: 9.99 },
    { name: 'Lemonade', description: 'Fresh-squeezed lemonade with mint', category: 'Drinks', costPrice: 0.5, sellingPrice: 3.99 },
    { name: 'Chocolate Lava Cake', description: 'Warm chocolate cake with a molten center, served with vanilla ice cream', category: 'Desserts', costPrice: 1.5, sellingPrice: 6.99 },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: item.name }, // won't match by name — just create if not exists
      update: {},
      create: item,
    }).catch(async () => {
      // upsert by name not possible; skip if already exists
      const exists = await prisma.menuItem.findFirst({ where: { name: item.name } });
      if (!exists) await prisma.menuItem.create({ data: item });
    });
  }
  console.log(`Seeded ${menuItems.length} menu items`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
