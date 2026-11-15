import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/authorization';
import { createProductVerificationUrl, getPublicAppUrl } from '@/lib/product-qr';

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
        isDemo: true,
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

    const counts = new Map<string, { total: number; authentic: number; invalid: number }>();
    for (const verification of groupedVerifications) {
      if (!verification.productId) continue;
      const current = counts.get(verification.productId) ?? { total: 0, authentic: 0, invalid: 0 };
      const count = verification._count._all;
      current.total += count;
      if (verification.isAuthentic) current.authentic += count;
      else current.invalid += count;
      counts.set(verification.productId, current);
    }

    const publicAppUrl = getPublicAppUrl();
    const productsWithCounts = await Promise.all(products.map(async (product) => {
      const verificationUrl = createProductVerificationUrl(product.qrCode, publicAppUrl);
      return {
        ...product,
        verificationUrl,
        qrImageUrl: `/api/products/${encodeURIComponent(product.id)}/qr`,
        verificationCount: counts.get(product.id)?.total ?? 0,
        authenticVerificationCount: counts.get(product.id)?.authentic ?? 0,
        invalidVerificationCount: counts.get(product.id)?.invalid ?? 0,
      };
    }));
    const totals = [...counts.values()].reduce(
      (result, current) => ({
        total: result.total + current.total,
        authentic: result.authentic + current.authentic,
        fake: result.fake + current.invalid,
      }),
      { total: 0, authentic: 0, fake: 0 }
    );

    const response = NextResponse.json({
      companyName: authorization.user.companyName,
      contactName: authorization.user.name,
      products: productsWithCounts,
      statistics: {
        totalProducts: products.length,
        totalVerifications: totals.total,
        authenticVerifications: totals.authentic,
        fakeVerifications: totals.fake,
      },
    });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    console.error('Manufacturer dashboard failed:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve manufacturer dashboard' },
      { status: 500 }
    );
  }
}
