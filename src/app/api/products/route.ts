import { db } from '@/lib/db';
import { simpleHash, generateQRCode } from '@/lib/blockchain';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/products - List all products
export async function GET() {
  try {
    const products = await db.product.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(products);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/products - Register a new product
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, manufacturer, batchNo, description } = body;

    if (!name || !category || !manufacturer || !batchNo) {
      return NextResponse.json(
        { error: 'Name, category, manufacturer, and batch number are required' },
        { status: 400 }
      );
    }

    // Check if batch number already exists
    const existingBatch = await db.product.findUnique({
      where: { batchNo },
    });
    if (existingBatch) {
      return NextResponse.json(
        { error: 'Batch number already registered' },
        { status: 409 }
      );
    }

    // Generate QR code and blockchain hash
    const qrCode = generateQRCode();
    const blockchainHash = simpleHash(
      `${name}${batchNo}${manufacturer}${Date.now()}`
    );

    // Get the latest block for chaining
    const latestBlock = await db.block.findFirst({
      orderBy: { index: 'desc' },
    });

    // Create product
    const product = await db.product.create({
      data: {
        name,
        category,
        manufacturer,
        batchNo,
        description,
        qrCode,
        blockchainHash,
      },
    });

    // Create new block
    const { createBlock } = await import('@/lib/blockchain');
    const block = createBlock(
      (latestBlock?.index ?? 0) + 1,
      latestBlock?.hash ?? '0000000000000000000000000000000000000000000000000000000000000000',
      product.id,
      name,
      { qrCode, batchNo, manufacturer, category, blockchainHash }
    );

    await db.block.create({
      data: {
        index: block.index,
        timestamp: block.timestamp,
        productId: product.id,
        productName: block.productName,
        hash: block.hash,
        previousHash: block.previousHash,
        nonce: block.nonce,
        data: block.data,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
