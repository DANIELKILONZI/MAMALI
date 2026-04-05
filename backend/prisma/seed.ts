import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@mamali.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await prisma.user.create({
      data: {
        name: 'Admin User',
        email: 'admin@mamali.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log('Default admin user created: admin@mamali.com / Admin@123');
  } else {
    console.log('Admin user already exists.');
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
    await prisma.contentPage.createMany({
      data: [
        { slug: 'about', title: 'About Us', content: '<p>About MAMALI</p>', isActive: true },
        { slug: 'contact', title: 'Contact Us', content: '<p>Contact information</p>', isActive: true },
        { slug: 'faq', title: 'FAQ', content: '<p>Frequently asked questions</p>', isActive: true },
        { slug: 'privacy', title: 'Privacy Policy', content: '<p>Privacy policy</p>', isActive: true },
        { slug: 'terms', title: 'Terms & Conditions', content: '<p>Terms and conditions</p>', isActive: true },
      ],
    });
    console.log('Default content pages seeded.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
