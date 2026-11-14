import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// GET /api/blocks - Get all blockchain blocks
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    let productIds: string[] | undefined;
    if (session?.user?.id) {
      const currentUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isActive: true },
      });
      if (currentUser?.isActive && currentUser.role === 'MANUFACTURER') {
        const products = await db.product.findMany({
          where: { manufacturerId: session.user.id },
          select: { id: true },
        });
        productIds = products.map(({ id }) => id);
      }
    }
    const blocks = await db.block.findMany({
      where: productIds ? { OR: [{ productId: 'genesis' }, { productId: { in: productIds } }] } : undefined,
      orderBy: { index: 'asc' },
    });
    return NextResponse.json(blocks);
  } catch {
    console.error('Blockchain block request failed');
    return NextResponse.json(
      { error: 'Unable to retrieve blockchain blocks' },
      { status: 500 }
    );
  }
}
