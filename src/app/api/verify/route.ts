
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

    // Find the registered product
    const product = await db.product.findUnique({
      where: { qrCode },
    });

    let isAuthentic = false;
    let result = 'Product not found in the registration database.';

    if (product) {
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
          if (isAuthenticProductRecord(product, productBlock, chainResult.valid)) {
            isAuthentic = true;

            result = `Product "${product.name}" (Batch: ${product.batchNo}) has been successfully authenticated. Its registration fingerprint and blockchain ledger are valid.`;
          } else {
            result =
              'Product information or registration fingerprint does not match its ledger record. Authenticity could not be confirmed.';
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
      result,
      product: isAuthentic ? product : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Product verification failed:', error);

    return NextResponse.json(
      { error: 'Unable to verify product. Please try again.' },
      { status: 500 }
    );
  }
}
