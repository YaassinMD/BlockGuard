import { db } from '@/lib/db';
import { simpleHash, generateQRCode, createGenesisBlock } from '@/lib/blockchain';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/seed - Seed database with demo data
export async function POST() {
  try {
    // Check if data already exists
    const existingProducts = await db.product.count();
    if (existingProducts > 0) {
      return NextResponse.json({ message: 'Database already seeded', count: existingProducts });
    }

    // Create genesis block
    const genesis = createGenesisBlock();
    await db.block.create({
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

    // Sample products
    const products = [
      {
        name: 'Premium Smartwatch Pro X1',
        category: 'Electronics',
        manufacturer: 'TechCorp Industries',
        batchNo: 'TC-2024-001',
        description: 'High-end smartwatch with health monitoring, GPS, and 7-day battery life. Manufactured in certified facility.',
      },
      {
        name: 'Organic Green Tea Supreme',
        category: 'Food & Beverages',
        manufacturer: 'Natural Harvest Co.',
        batchNo: 'NH-2024-088',
        description: 'Premium organic green tea sourced from certified plantations. Lab-tested for purity and authenticity.',
      },
      {
        name: 'Leather Executive Briefcase',
        category: 'Fashion & Accessories',
        manufacturer: 'Italian Craft Ltd.',
        batchNo: 'IC-2024-205',
        description: 'Hand-crafted genuine Italian leather briefcase with RFID protection. Certificate of authenticity included.',
      },
      {
        name: 'Pharmaceutical Supplement VitaPlus',
        category: 'Health & Medicine',
        manufacturer: 'MediSafe Pharmaceuticals',
        batchNo: 'MS-2024-442',
        description: 'FDA-approved dietary supplement with verified active ingredients. Quality tested in ISO-certified labs.',
      },
      {
        name: 'Signature Perfume Essence',
        category: 'Cosmetics',
        manufacturer: 'Luxe Fragrance House',
        batchNo: 'LF-2024-117',
        description: 'Premium signature perfume with authenticated ingredients. Each bottle has unique tracking identifier.',
      },
      {
        name: 'Wireless Noise-Cancelling Headphones',
        category: 'Electronics',
        manufacturer: 'SoundWave Audio',
        batchNo: 'SW-2024-330',
        description: 'Active noise-cancelling headphones with 30-hour battery. Authenticated through blockchain verification.',
      },
    ];

    let previousHash = genesis.hash;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const qrCode = generateQRCode();
      const blockchainHash = simpleHash(
        `${product.name}${product.batchNo}${product.manufacturer}${Date.now()}`
      );

      // Create product
      const createdProduct = await db.product.create({
        data: {
          ...product,
          qrCode,
          blockchainHash,
        },
      });

      // Create block
      const { createBlock } = await import('@/lib/blockchain');
      const block = createBlock(
        i + 1,
        previousHash,
        createdProduct.id,
        product.name,
        {
          qrCode,
          batchNo: product.batchNo,
          manufacturer: product.manufacturer,
          category: product.category,
          blockchainHash,
        }
      );

      await db.block.create({
        data: {
          index: block.index,
          timestamp: block.timestamp,
          productId: createdProduct.id,
          productName: block.productName,
          hash: block.hash,
          previousHash: block.previousHash,
          nonce: block.nonce,
          data: block.data,
        },
      });

      previousHash = block.hash;
    }

    // Add some fake/counterfeit verifications
    await db.verification.createMany({
      data: [
        { qrCode: 'FAKE-XXXX-YYYY-ZZZZ', isAuthentic: false, result: 'Product not found in blockchain registry. Possible counterfeit.', ipAddress: '192.168.1.45' },
        { qrCode: 'FAKE-AAAA-BBBB-CCCC', isAuthentic: false, result: 'Hash mismatch detected. Product may be tampered with or counterfeit.', ipAddress: '10.0.0.12' },
        { qrCode: 'FAKE-1111-2222-3333', isAuthentic: false, result: 'QR code format invalid. This is not a registered blockchain product code.', ipAddress: '172.16.0.88' },
      ],
    });

    const totalProducts = await db.product.count();
    const totalBlocks = await db.block.count();

    return NextResponse.json({
      message: 'Database seeded successfully',
      products: totalProducts,
      blocks: totalBlocks,
      genesisHash: genesis.hash,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
