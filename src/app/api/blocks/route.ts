import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authorization';

// GET /api/blocks - Get all blockchain blocks
export async function GET() {
  try {
    const authorization = await requireRole(['ADMIN', 'MANUFACTURER']);
    if (authorization instanceof NextResponse) return authorization;

    let productIds: string[] | undefined;
    if (authorization.user.role === 'MANUFACTURER') {
      const products = await db.product.findMany({
        where: { manufacturerId: authorization.user.id },
        select: { id: true },
      });
      productIds = products.map(({ id }) => id);
    }
    const blocks = await db.block.findMany({
      where: productIds
        ? { OR: [{ productId: 'genesis' }, { productId: { in: productIds } }] }
        : undefined,
      orderBy: { index: 'asc' },
    });
    return NextResponse.json(blocks, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch {
    console.error('Blockchain block request failed');
    return NextResponse.json(
      { error: 'Unable to retrieve blockchain blocks' },
      { status: 500 }
    );
  }
}
