
import { db } from '@/lib/db';
import {
  verifyChain,
  isAuthenticProductRecord,
  type BlockData,
} from '@/lib/blockchain';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const qrCode =
      typeof body?.qrCode === 'string' ? body.qrCode.trim() : '';

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code is required for verification' },
        { status: 400 }
      );
    }

    if (qrCode.length > 30) {
      return NextResponse.json(
        { error: 'Invalid QR code format' },
        { status: 400 }
      );
    }

    const simulateTampering = body?.demoScenario === 'tampered';
    if (simulateTampering && process.env.BLOCKGUARD_DATABASE_ENV !== 'test') {
      return NextResponse.json({ error: 'Demo tampering simulation is available only on the testing database.' }, { status: 404 });
    }

    // Find the registered product
    const product = await db.product.findUnique({
      where: { qrCode },
    });

    let isAuthentic = false;
    let status: 'AUTHENTIC' | 'INVALID' | 'TAMPERED' = 'INVALID';
    let result = 'Product not found in the registration database.';

    if (product) {
      if (simulateTampering && !product.isDemo) {
        return NextResponse.json(
          { error: 'Tampering simulation only works with clearly marked demo products.' },
          { status: 400 }
        );
      }
      status = 'TAMPERED';
      // Retrieve the complete ledger in block order
      const storedBlocks = await db.block.findMany({
        orderBy: { index: 'asc' },
      });

      const blocks: BlockData[] = storedBlocks.map((block) => ({
        index: block.index,
        timestamp: block.timestamp,
        productId: block.productId,
        productName: block.productName,
        hash: block.hash,
        previousHash: block.previousHash,
        nonce: block.nonce,
        data: block.data,
      }));

      // Validate the entire blockchain ledger
      const chainResult = verifyChain(blocks);

      if (!chainResult.valid) {
        result = 'Ledger integrity validation failed. Product authenticity cannot be confirmed.';
      } else {
        // Find the block belonging to this product
        const productBlock = blocks.find(
          (block) => block.productId === product.id
        );

        if (!productBlock) {
          result = 'Product registration record is missing from the ledger.';
        } else {
          const checkedProduct = simulateTampering && product.isDemo
            ? { ...product, name: `${product.name} (tampered demo copy)` }
            : product;
          if (isAuthenticProductRecord(checkedProduct, productBlock, chainResult.valid)) {
            isAuthentic = true;
            status = 'AUTHENTIC';
            result = 'The QR code matches a product record stored in BlockGuard and its ledger. This confirms record consistency only; it does not prove brand partnership or the physical item’s origin.';
          } else {
            status = 'TAMPERED';
            result = simulateTampering && product.isDemo
              ? 'DEMO DATA: a tampered in-memory copy failed the record check. No product or ledger record was changed.'
              : 'Product information or registration fingerprint does not match its ledger record.';
          }
        }
      }
    }

    // Record verification and update product statistics atomically
    await db.$transaction(async (tx) => {
      await tx.verification.create({
        data: {
          productId: product?.id ?? null,
          qrCode,
          isAuthentic,
          result,
          ipAddress:
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            'unknown',
          userAgent: request.headers.get('user-agent') ?? 'unknown',
        },
      });

      if (isAuthentic && product) {
        await tx.product.update({
          where: { id: product.id },
          data: {
            isVerified: true,
            verifiedCount: { increment: 1 },
          },
        });
      }
    });

    return NextResponse.json({
      isAuthentic,
      status,
      result,
      product: isAuthentic && product ? {
        name: product.name,
        category: product.category,
        manufacturer: product.manufacturer,
        batchNo: product.batchNo,
        description: product.description,
        isDemo: product.isDemo,
      } : null,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    console.error('Product verification failed:', error);

    return NextResponse.json(
      { error: 'Unable to verify product. Please try again.' },
      { status: 500 }
    );
  }
}
