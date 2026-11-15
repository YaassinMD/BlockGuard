import { db } from '@/lib/db';
import {
  calculateProductFingerprint,
  createGenesisBlock,
  createProductBlock,
  generateQRCode,
  verifyChain,
  type BlockData,
} from '@/lib/blockchain';
import { requireRole } from '@/lib/authorization';
import { NextResponse } from 'next/server';

const showcaseCompany = 'Demo Manufacturer — BlockGuard Showcase';
const demoProducts = [
  {
    name: "Nike Air Force 1 '07",
    category: 'Fashion & Accessories',
    batchNo: 'DEMO-BG-NIKE-AF1',
    description: 'DEMO DATA. Illustrative record only; no Nike partnership or authorization is claimed.',
  },
  {
    name: 'Samsung Galaxy S25',
    category: 'Electronics',
    batchNo: 'DEMO-BG-SAMSUNG-S25',
    description: 'DEMO DATA. Illustrative record only; no Samsung partnership or authorization is claimed.',
  },
  {
    name: 'Apple iPhone 16',
    category: 'Electronics',
    batchNo: 'DEMO-BG-APPLE-I16',
    description: 'DEMO DATA. Illustrative record only; no Apple partnership or authorization is claimed.',
  },
];

export async function POST() {
  // Local development may point at production Neon. NODE_ENV alone is not a
  // safe signal; this route is enabled only by the explicit test launcher.
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.BLOCKGUARD_DATABASE_ENV !== 'test'
  ) {
    return NextResponse.json({ error: 'Demo setup is available only on the testing database.' }, { status: 404 });
  }

  try {
    const authorization = await requireRole(['ADMIN']);
    if (authorization instanceof NextResponse) return authorization;

    const manufacturer = await db.user.findFirst({
      where: { role: 'MANUFACTURER', companyName: showcaseCompany, isActive: true },
      select: { id: true },
    });
    if (!manufacturer) {
      return NextResponse.json(
        { error: `Create an active ${showcaseCompany} manufacturer account first.` },
        { status: 409 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      let blocks = await tx.block.findMany({ orderBy: { index: 'asc' } });
      if (blocks.length === 0) {
        const genesis = createGenesisBlock();
        blocks = [await tx.block.create({ data: genesis })];
      } else if (!verifyChain(blocks as BlockData[]).valid) {
        throw new Error('LEDGER_INTEGRITY_FAILED');
      }

      let previousBlock = blocks[blocks.length - 1];
      const addedProducts: Array<{ name: string; batchNo: string; qrCode: string }> = [];
      for (const item of demoProducts) {
        const existing = await tx.product.findUnique({ where: { batchNo: item.batchNo } });
        if (existing) {
          if (!existing.isDemo || existing.manufacturerId !== manufacturer.id) {
            throw new Error('DEMO_BATCH_CONFLICT');
          }
          continue;
        }

        const qrCode = generateQRCode();
        const fingerprint = {
          ...item,
          manufacturer: showcaseCompany,
          qrCode,
          description: item.description,
        };
        const blockchainHash = calculateProductFingerprint(fingerprint);
        const product = await tx.product.create({
          data: {
            ...item,
            manufacturer: showcaseCompany,
            qrCode,
            blockchainHash,
            manufacturerId: manufacturer.id,
            isDemo: true,
          },
        });
        const block = createProductBlock(product, previousBlock);
        previousBlock = await tx.block.create({
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
        addedProducts.push({ name: product.name, batchNo: product.batchNo, qrCode: product.qrCode });
      }

      return { addedProducts, ledgerIntegrity: verifyChain(await tx.block.findMany({ orderBy: { index: 'asc' } })).valid };
    });

    return NextResponse.json({
      message: 'Demo products are illustrative records, not brand-authorized registrations.',
      ...result,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'LEDGER_INTEGRITY_FAILED') {
      return NextResponse.json({ error: 'The existing ledger is invalid; demo data was not changed.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'DEMO_BATCH_CONFLICT') {
      return NextResponse.json({ error: 'A demo batch identifier is already used by a non-demo product.' }, { status: 409 });
    }
    console.error('Demo setup failed');
    return NextResponse.json({ error: 'Unable to prepare demo data.' }, { status: 500 });
  }
}
