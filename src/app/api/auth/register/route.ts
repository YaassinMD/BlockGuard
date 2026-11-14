
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid registration details',
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { name, password } = validation.data;
    const email = validation.data.email.toLowerCase();

    const passwordHash = await hashPassword(password);

    const user = await (
      db as unknown as {
        user: {
          create: (args: {
            data: {
              name: string;
              email: string;
              passwordHash: string;
              role: string;
            };
            select: {
              id: true;
              name: true;
              email: true;
              role: true;
              createdAt: true;
            };
          }) => Promise<{
            id: string;
            name: string;
            email: string;
            role: string;
            createdAt: Date;
          }>;
        };
      }
    ).user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: 'Account created successfully',
        user,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Unable to create account with these details' },
        { status: 409 }
      );
    }

    console.error('Registration failed:', error);

    return NextResponse.json(
      { error: 'Unable to create account. Please try again.' },
      { status: 500 }
    );
  }
}
