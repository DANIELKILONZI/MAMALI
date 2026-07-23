import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { defaultContentPages } from './seedContent';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@mamali.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await prisma.user.create({
      data: {
        name: 'Owner',
        email: 'admin@mamali.com',
        password: hashedPassword,
        role: 'OWNER',
      },
    });
    console.log('Default owner created: admin@mamali.com / Admin@123');
  } else {
    console.log('Owner account already exists.');
  }

  // Migrate any legacy ADMIN accounts to OWNER.
  const migrated = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { role: 'OWNER' },
  });
  if (migrated.count > 0) {
    console.log(`Migrated ${migrated.count} legacy ADMIN account(s) to OWNER.`);
  }

  // Seed homepage sections
  const sectionsCount = await prisma.homepageSection.count();
  if (sectionsCount === 0) {
    await prisma.homepageSection.createMany({
      data: [
        { type: 'HERO', title: 'Welcome to MAMALI', content: '{}', isActive: true, sortOrder: 0 },
        { type: 'FEATURED_PRODUCTS', title: 'Featured Products', content: '{}', isActive: true, sortOrder: 1 },
        { type: 'PROMOTIONS', title: 'Promotions', content: '{}', isActive: true, sortOrder: 2 },
      ],
    });
    console.log('Homepage sections seeded.');
  }

  // Seed default content pages
  const pagesCount = await prisma.contentPage.count();
  if (pagesCount === 0) {
    await prisma.contentPage.createMany({ data: defaultContentPages });
    console.log('Default content pages seeded.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
