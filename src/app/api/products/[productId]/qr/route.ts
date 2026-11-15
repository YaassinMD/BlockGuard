import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/authorization';
import { createProductQrPng, createProductVerificationUrl, getPublicAppUrl } from '@/lib/product-qr';

type RouteContext = {
  params: Promise<{ productId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireRole(['MANUFACTURER']);
  if (authorization instanceof NextResponse) return authorization;

  const { productId } = await params;
  const product = await db.product.findFirst({
    where: { id: productId, manufacturerId: authorization.user.id },
    select: { qrCode: true },
  });

  if (!product) {
    return NextResponse.json(
      { error: 'Product not found' },
      {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
      }
    );
  }

  const verificationUrl = createProductVerificationUrl(product.qrCode, getPublicAppUrl());
  const image = await createProductQrPng(verificationUrl);
  return new NextResponse(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
