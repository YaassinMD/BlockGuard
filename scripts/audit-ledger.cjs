const fs = require('node:fs');
const path = require('node:path');
const testTs = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = testTs.transpileModule(source, {
    compilerOptions: { module: testTs.ModuleKind.CommonJS, target: testTs.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const entry = fs.readFileSync(envPath, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/m);
    if (entry) process.env.DATABASE_URL = entry[1].replace(/^['"]|['"]$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const { calculateBlockHash, verifyChain, verifyProductBlock } = require('../src/lib/blockchain.ts');
const prisma = new PrismaClient();

async function main() {
  const [storedBlocks, products] = await Promise.all([
    prisma.block.findMany({ orderBy: { index: 'asc' } }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        manufacturer: true,
        batchNo: true,
        description: true,
        qrCode: true,
        blockchainHash: true,
      },
    }),
  ]);

  const blocks = storedBlocks.map((block) => ({
    index: block.index,
    timestamp: block.timestamp,
    productId: block.productId,
    productName: block.productName,
    hash: block.hash,
    previousHash: block.previousHash,
    nonce: block.nonce,
    data: block.data,
  }));
  const chain = verifyChain(blocks);
  const blockByProductId = new Map(blocks.map((block) => [block.productId, block]));
  const blockIssues = [];
  const productIssues = [];

  for (let position = 0; position < blocks.length; position += 1) {
    const block = blocks[position];
    if (block.index !== position) {
      blockIssues.push({ index: block.index, issue: `expected sequential index ${position}` });
    }
    if (Number.isNaN(Date.parse(block.timestamp))) {
      blockIssues.push({ index: block.index, issue: 'invalid timestamp' });
    }
    const expectedPreviousHash = position === 0 ? '0'.repeat(64) : blocks[position - 1].hash;
    if (block.previousHash !== expectedPreviousHash) {
      blockIssues.push({ index: block.index, issue: 'previous hash does not match preceding block' });
    }
    if (calculateBlockHash(block) !== block.hash) {
      blockIssues.push({ index: block.index, issue: 'stored hash differs from calculated SHA-256' });
    }
  }

  for (const product of products) {
    const block = blockByProductId.get(product.id);
    if (!block) {
      productIssues.push({ batchNo: product.batchNo, issue: 'missing ledger block' });
    } else if (!verifyProductBlock(product, block)) {
      productIssues.push({ batchNo: product.batchNo, index: block.index, issue: 'product data or fingerprint mismatch' });
    }
  }

  const report = {
    products: products.length,
    blocks: blocks.length,
    chainValid: chain.valid,
    firstChainFailure: chain.valid ? null : { index: chain.brokenAt, reason: chain.reason },
    blockIssues,
    productIssues,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!chain.valid || blockIssues.length > 0 || productIssues.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Ledger audit failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
