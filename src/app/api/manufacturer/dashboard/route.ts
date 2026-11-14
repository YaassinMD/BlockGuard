import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/authorization';

export async function GET() {
  try {
    const authorization = await requireRole(['MANUFACTURER']);
    if (authorization instanceof NextResponse) return authorization;

    const manufacturerId = authorization.user.id;
    const products = await db.product.findMany({
      where: { manufacturerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        category: true,
        batchNo: true,
        qrCode: true,
        createdAt: true,
      },
    });

    const productIds = products.map(({ id }) => id);
    const groupedVerifications = productIds.length
      ? await db.verification.groupBy({
          by: ['productId', 'isAuthentic'],
          where: { productId: { in: productIds } },
          _count: { _all: true },
        })
      : [];

    const counts = new Map<string, { total: number; authentic: number; fake: number }>();
    for (const verification of groupedVerifications) {
      if (!verification.productId) continue;
      const current = counts.get(verification.productId) ?? { total: 0, authentic: 0, fake: 0 };
      const count = verification._count._all;
      current.total += count;
      if (verification.isAuthentic) current.authentic += count;
      else current.fake += count;
      counts.set(verification.productId, current);
    }

    const productsWithCounts = products.map((product) => ({
      ...product,
      verificationCount: counts.get(product.id)?.total ?? 0,
    }));
    const totals = [...counts.values()].reduce(
      (result, current) => ({
        total: result.total + current.total,
        authentic: result.authentic + current.authentic,
        fake: result.fake + current.fake,
      }),
      { total: 0, authentic: 0, fake: 0 }
    );

    return NextResponse.json({
      products: productsWithCounts,
      statistics: {
        totalProducts: products.length,
        totalVerifications: totals.total,
        authenticVerifications: totals.authentic,
        fakeVerifications: totals.fake,
      },
    });
  } catch (error) {
    console.error('Manufacturer dashboard failed:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve manufacturer dashboard' },
      { status: 500 }
    );
  }
}
