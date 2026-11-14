
import { db } from '@/lib/db';
import {
  calculateProductFingerprint,
  generateQRCode,
  createProductBlock,
  createGenesisBlock,
  verifyChain,
  type BlockData,
} from '@/lib/blockchain';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authorization';

const demoProducts = [
  {
    name: 'Premium Smartwatch Pro X1',
    category: 'Electronics',
    manufacturer: 'TechCorp Industries',
    batchNo: 'TC-2024-001',
    description:
      'High-end smartwatch with health monitoring, GPS, and 7-day battery life.',
  },
  {
    name: 'Organic Green Tea Supreme',
    category: 'Food & Beverages',
    manufacturer: 'Natural Harvest Co.',
    batchNo: 'NH-2024-088',
    description:
      'Premium organic green tea sourced from certified plantations.',
  },
  {
    name: 'Leather Executive Briefcase',
    category: 'Fashion & Accessories',
    manufacturer: 'Italian Craft Ltd.',
    batchNo: 'IC-2024-205',
    description:
      'Hand-crafted genuine Italian leather briefcase with RFID protection.',
  },
  {
    name: 'Pharmaceutical Supplement VitaPlus',
    category: 'Health & Medicine',
    manufacturer: 'MediSafe Pharmaceuticals',
    batchNo: 'MS-2024-442',
    description:
      'Quality-tested dietary supplement with verified active ingredients.',
  },
  {
    name: 'Signature Perfume Essence',
    category: 'Cosmetics',
    manufacturer: 'Luxe Fragrance House',
    batchNo: 'LF-2024-117',
    description:
      'Premium signature perfume with unique product tracking identifier.',
  },
  {
    name: 'Wireless Noise-Cancelling Headphones',
    category: 'Electronics',
    manufacturer: 'SoundWave Audio',
    batchNo: 'SW-2024-330',
    description:
      'Active noise-cancelling headphones with 30-hour battery life.',
  },
];

// POST /api/seed - Regenerate development demo data
export async function POST() {
  // Never allow this destructive endpoint in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Demo seeding is disabled in production' },
      { status: 404 }
    );
  }

  try {
    const authorization = await requireRole(['ADMIN']);
    if (authorization instanceof NextResponse) return authorization;

    const result = await db.$transaction(async (tx) => {
      let storedBlocks = await tx.block.findMany({ orderBy: { index: 'asc' } });
      if (storedBlocks.length === 0) {
        const genesis = createGenesisBlock();
        const storedGenesis = await tx.block.create({ data: genesis });
        storedBlocks = [storedGenesis];
      } else {
        const chain = verifyChain(storedBlocks as BlockData[]);
        if (!chain.valid) throw new Error('LEDGER_INTEGRITY_FAILED');
      }
      let previousBlock = storedBlocks[storedBlocks.length - 1];

      // Add missing demo products without replacing existing product or ledger rows.
      for (const item of demoProducts) {
        const existingProduct = await tx.product.findUnique({ where: { batchNo: item.batchNo } });
        if (existingProduct) continue;
        const qrCode = generateQRCode();

        const blockchainHash = calculateProductFingerprint({
            name: item.name,
            category: item.category,
            manufacturer: item.manufacturer,
            batchNo: item.batchNo,
            description: item.description ?? null,
            qrCode,
        });

        const product = await tx.product.create({
          data: {
            ...item,
            qrCode,
            blockchainHash,
          },
        });

        const block = createProductBlock(product, previousBlock);

        const storedBlock = await tx.block.create({
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
        previousBlock = storedBlock;
      }

      const demoVerificationCodes = [
        'FAKE-XXXX-YYYY-ZZZZ',
        'FAKE-AAAA-BBBB-CCCC',
        'FAKE-1111-2222-3333',
      ];
      const existingDemoVerifications = await tx.verification.findMany({
        where: { qrCode: { in: demoVerificationCodes } },
        select: { qrCode: true },
      });
      const existingCodes = new Set(existingDemoVerifications.map(({ qrCode }) => qrCode));
      const missingDemoVerifications = [
          {
            qrCode: 'FAKE-XXXX-YYYY-ZZZZ',
            isAuthentic: false,
            result: 'Product not found in the registration database.',
            ipAddress: '192.168.1.45',
          },
          {
            qrCode: 'FAKE-AAAA-BBBB-CCCC',
            isAuthentic: false,
            result: 'Product not found in the registration database.',
            ipAddress: '10.0.0.12',
          },
          {
            qrCode: 'FAKE-1111-2222-3333',
            isAuthentic: false,
            result: 'Invalid or unregistered QR code.',
            ipAddress: '172.16.0.88',
          },
        ].filter(({ qrCode }) => !existingCodes.has(qrCode));
      if (missingDemoVerifications.length) await tx.verification.createMany({ data: missingDemoVerifications });

      return {
        products: await tx.product.count(),
        blocks: await tx.block.count(),
        verifications: await tx.verification.count(),
        genesisHash: storedBlocks[0].hash,
      };
    });

    return NextResponse.json({
      message: 'Missing demo data added without replacing existing records',
      ...result,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'LEDGER_INTEGRITY_FAILED') {
      return NextResponse.json(
        { error: 'Existing ledger is invalid; demo data was not changed' },
        { status: 409 }
      );
    }

    console.error('Demo database seeding failed:', error);

    return NextResponse.json(
      { error: 'Unable to add demo data' },
      { status: 500 }
    );
  }
}
