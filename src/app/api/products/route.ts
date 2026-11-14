
import { requireRole } from '@/lib/authorization';
import { db } from '@/lib/db';
import {
  calculateProductFingerprint,
  generateQRCode,
  createProductBlock,
  createGenesisBlock,
  productManufacturerIdForRole,
  verifyChain,
} from '@/lib/blockchain';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const productInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(100),
  manufacturer: z.string().trim().min(1).max(150),
  batchNo: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
});

// GET /api/products - List all products
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    let where: Prisma.ProductWhereInput = {};
    if (session?.user?.id) {
      const currentUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isActive: true },
      });
      if (currentUser?.isActive && currentUser.role === 'MANUFACTURER') {
        where = { manufacturerId: session.user.id };
      }
    }
    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(products);
  } catch (error: unknown) {
    console.error('Failed to fetch products:', error);

    return NextResponse.json(
      { error: 'Unable to retrieve products' },
      { status: 500 }
    );
  }
}

// POST /api/products - Register a new product
export async function POST(request: NextRequest) {
  try {
    // Only administrators and manufacturers can register products
    const authorization = await requireRole([
      'ADMIN',
      'MANUFACTURER',
    ]);

    if (authorization instanceof NextResponse) {
      return authorization;
    }
    const body = await request.json().catch(() => null);
    const validation = productInputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid product details' },
        { status: 400 }
      );
    }
    const { name, category, manufacturer, batchNo, description } = validation.data;

    // Perform all database writes in one transaction
    const product = await db.$transaction(async (tx) => {
      // Check for duplicate batch number
      const existingBatch = await tx.product.findUnique({
        where: { batchNo },
      });

      if (existingBatch) {
        throw new Error('BATCH_ALREADY_REGISTERED');
      }

      // Generate a cryptographically random QR identifier
      const qrCode = generateQRCode();

      // Generate a deterministic SHA-256 product fingerprint
      const productFingerprint = {
        name,
        category,
        manufacturer,
        batchNo,
        description: description ?? null,
        qrCode,
      };

      const blockchainHash = calculateProductFingerprint(productFingerprint);

      // Refuse to extend a damaged ledger. The audit/repair path must resolve it first.
      const existingBlocks = await tx.block.findMany({ orderBy: { index: 'asc' } });
      if (existingBlocks.length > 0 && !verifyChain(existingBlocks).valid) {
        throw new Error('LEDGER_INTEGRITY_FAILED');
      }
      let latestBlock = existingBlocks[existingBlocks.length - 1];

      // Initialize the ledger if it is empty
      if (!latestBlock) {
        const genesis = createGenesisBlock();

        latestBlock = await tx.block.create({
          data: {
            index: genesis.index,
            timestamp: genesis.timestamp,
            productId: genesis.productId,
            productName: genesis.productName,
            hash: genesis.hash,
            previousHash: genesis.previousHash,
            nonce: genesis.nonce,
            data: genesis.data,
          },
        });
      }

      // Create product
      const createdProduct = await tx.product.create({
        data: {
          name,
          category,
          manufacturer,
          batchNo,
          description,
          qrCode,
          blockchainHash,
          manufacturerId: productManufacturerIdForRole(
            authorization.user.role,
            authorization.user.id
          ),
        },
      });

      // Create its corresponding ledger block
      const block = createProductBlock(createdProduct, latestBlock);

      await tx.block.create({
        data: {
          index: block.index,
          timestamp: block.timestamp,
          productId: block.productId,
          productName: block.productName,
          hash: block.hash,
          previousHash: block.previousHash,
          nonce: block.nonce,
          data: block.data,
        },
      });

      return createdProduct;
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'LEDGER_INTEGRITY_FAILED') {
      return NextResponse.json(
        { error: 'Existing ledger is invalid; product registration was not changed' },
        { status: 409 }
      );
    }

    if (error instanceof Error &&
        error.message === 'BATCH_ALREADY_REGISTERED') {
      return NextResponse.json(
        { error: 'Batch number already registered' },
        { status: 409 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'A product with this unique information already exists' },
        { status: 409 }
      );
    }

    console.error('Product registration failed:', error);

    return NextResponse.json(
      { error: 'Unable to register product. Please try again.' },
      { status: 500 }
    );
  }
}
