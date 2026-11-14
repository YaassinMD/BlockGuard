
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prisma: any = new PrismaClient();

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const email = (
      await rl.question('Admin email: ')
    ).trim().toLowerCase();

    const name = (await rl.question('Admin name: ')).trim();

    const password = await rl.question('Admin password: ');

    if (!email || !name || password.length < 12 || password.length > 128) {
      throw new Error('Enter a valid email, name, and password of 12–128 characters.');
    }

    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (existingAdmin) {
      throw new Error('An Admin account already exists. Setup is disabled.');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error('This email already belongs to an account.');
    }

    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    console.log('Admin account created successfully:', admin);
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error('Admin setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
