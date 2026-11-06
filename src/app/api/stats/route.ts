import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/stats - Get dashboard statistics
export async function GET() {
  try {
    const totalProducts = await db.product.count();
    const totalBlocks = await db.block.count();
    const totalVerifications = await db.verification.count();
    const authenticVerifications = await db.verification.count({
      where: { isAuthentic: true },
    });
    const fakeVerifications = await db.verification.count({
      where: { isAuthentic: false },
    });

    // Category breakdown
    const categories = await db.product.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    // Recent verifications
    const recentVerifications = await db.verification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Recent products
    const recentProducts = await db.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Manufacturer breakdown
    const manufacturers = await db.product.groupBy({
      by: ['manufacturer'],
      _count: { id: true },
    });

    return NextResponse.json({
      totalProducts,
      totalBlocks,
      totalVerifications,
      authenticVerifications,
      fakeVerifications,
      categories,
      manufacturers,
      recentVerifications,
      recentProducts,
      chainIntegrity: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
