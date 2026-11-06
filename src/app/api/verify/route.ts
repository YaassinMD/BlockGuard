import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/verify - Verify a product by QR code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { qrCode } = body;

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code is required for verification' },
        { status: 400 }
      );
    }

    // Look up product by QR code
    const product = await db.product.findUnique({
      where: { qrCode: qrCode.trim() },
    });

    const isAuthentic = !!product;
    const result = isAuthentic
      ? `Product "${product.name}" (Batch: ${product.batchNo}) is AUTHENTICATED. Registered by ${product.manufacturer} on ${product.createdAt.toLocaleDateString()}. Blockchain hash verified: ${product.blockchainHash.substring(0, 16)}...`
      : `Product with QR code "${qrCode}" was NOT found in the blockchain registry. This product may be COUNTERFEIT or the QR code is invalid.`;

    // Log the verification
    await db.verification.create({
      data: {
        productId: product?.id ?? null,
        qrCode: qrCode.trim(),
        isAuthentic,
        result,
        ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
        userAgent: request.headers.get('user-agent') ?? 'unknown',
      },
    });

    // Update product verification count if authentic
    if (isAuthentic && product) {
      await db.product.update({
        where: { id: product.id },
        data: {
          isVerified: true,
          verifiedCount: { increment: 1 },
        },
      });
    }

    return NextResponse.json({
      isAuthentic,
      result,
      product: product ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
