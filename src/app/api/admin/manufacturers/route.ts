
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { requireRole } from '@/lib/authorization';

const manufacturerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

const updateManufacturerSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

// GET: List all manufacturer accounts
export async function GET() {
  try {
    const authorization = await requireRole(['ADMIN']);

    if (authorization instanceof NextResponse) {
      return authorization;
    }

    const manufacturers = await db.user.findMany({
      where: { role: 'MANUFACTURER' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ manufacturers });
  } catch (error) {
    console.error('Manufacturer listing failed:', error);

    return NextResponse.json(
      { error: 'Unable to retrieve manufacturers' },
      { status: 500 }
    );
  }
}

// POST: Create a manufacturer account
export async function POST(request: NextRequest) {
  try {
    const authorization = await requireRole(['ADMIN']);

    if (authorization instanceof NextResponse) {
      return authorization;
    }

    const body = await request.json().catch(() => null);
    const validation = manufacturerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid manufacturer details' },
        { status: 400 }
      );
    }

    const { name, password } = validation.data;
    const email = validation.data.email.toLowerCase();

    const passwordHash = await hashPassword(password);

    const manufacturer = await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'MANUFACTURER',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: 'Manufacturer account created successfully',
        manufacturer,
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

    console.error('Manufacturer creation failed:', error);

    return NextResponse.json(
      { error: 'Unable to create manufacturer account' },
      { status: 500 }
    );
  }
}

// PATCH: Activate or deactivate a manufacturer account
export async function PATCH(request: NextRequest) {
  try {
    const authorization = await requireRole(['ADMIN']);

    if (authorization instanceof NextResponse) {
      return authorization;
    }

    const body = await request.json().catch(() => null);
    const validation = updateManufacturerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid manufacturer update details' },
        { status: 400 }
      );
    }

    const { id, isActive } = validation.data;

    const result = await db.user.updateMany({
      where: {
        id,
        role: 'MANUFACTURER',
      },
      data: { isActive },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Manufacturer not found' },
        { status: 404 }
      );
    }

    const manufacturer = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      message: `Manufacturer ${isActive ? 'activated' : 'deactivated'} successfully`,
      manufacturer,
    });
  } catch (error) {
    console.error('Manufacturer update failed:', error);

    return NextResponse.json(
      { error: 'Unable to update manufacturer account' },
      { status: 500 }
    );
  }
}
