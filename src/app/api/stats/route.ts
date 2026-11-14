import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifyChain } from '@/lib/blockchain';

// GET /api/stats - Return aggregate dashboard statistics only.
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

    // Read only the fields required to validate the ledger. Block records are
    // used internally and never included in this public response.
    const blocks = await db.block.findMany({
      orderBy: { index: 'asc' },
      select: {
        index: true,
        timestamp: true,
        productId: true,
        productName: true,
        hash: true,
        previousHash: true,
        nonce: true,
        data: true,
      },
    });

    return NextResponse.json({
      totalProducts,
      totalBlocks,
      totalVerifications,
      authenticVerifications,
      fakeVerifications,
      categories,
      chainIntegrity: verifyChain(blocks).valid,
    });
  } catch (error: unknown) {
    console.error('Dashboard statistics request failed');
    return NextResponse.json(
      { error: 'Unable to retrieve dashboard statistics' },
      { status: 500 }
    );
  }
}
