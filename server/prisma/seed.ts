import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Sample data with well-known passwords: for local development only.
// Refuses to run in production unless ALLOW_SEED=1 is set on purpose.
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
  console.error('Refusing to seed: NODE_ENV=production. Set ALLOW_SEED=1 if you really mean it.');
  process.exit(1);
}

async function main() {
  // Seed the two Super Admin logins (passwords can be overridden from the environment)
  const admins = [
    { name: 'Super Admin', username: 'superadmin', password: process.env.SEED_SUPERADMIN_PASSWORD || 'superadmin123' },
    { name: 'Admin', username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'superadmin123' },
  ];
  for (const admin of admins) {
    const user = await prisma.user.upsert({
      where: { username: admin.username },
      update: {},
      create: {
        name: admin.name,
        username: admin.username,
        password: await bcrypt.hash(admin.password, 12),
        role: Role.SUPER_ADMIN,
      },
    });
    console.log('Super Admin created:', user.username);
  }

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

  // Name is not unique in the schema, so look it up first: running the seed
  // twice must not duplicate the menu.
  for (const item of menuItems) {
    const exists = await prisma.menuItem.findFirst({ where: { name: item.name } });
    if (!exists) await prisma.menuItem.create({ data: item });
  }
  console.log(`Seeded ${menuItems.length} menu items`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1; // so start.bat notices a failed seed
  })
  .finally(() => prisma.$disconnect());
