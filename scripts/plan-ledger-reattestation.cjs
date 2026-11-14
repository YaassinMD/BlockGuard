const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const snapshotPath = path.resolve(process.argv[2] || 'db/ledger_reattestation_audit_snapshot_20261114.json');
const reportPath = path.resolve(process.argv[3] || 'db/ledger_reattestation_dry_run_20261114.json');
if (!fs.existsSync(snapshotPath)) throw new Error(`Audit snapshot not found: ${snapshotPath}`);
if (fs.existsSync(reportPath)) throw new Error(`Refusing to overwrite dry-run report: ${reportPath}`);

const {
  calculateBlockHash,
  calculateProductFingerprint,
  createGenesisBlock,
  verifyChain,
  verifyProductBlock,
} = require('../src/lib/blockchain.ts');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const products = snapshot.products;
const originalBlocks = [...snapshot.blocks].sort((a, b) => a.index - b.index);
if (originalBlocks.length !== products.length + 1) {
  throw new Error('Dry run stopped: expected exactly one genesis block plus one block per product.');
}
if (!originalBlocks.every((block, position) => block.index === position)) {
  throw new Error('Dry run stopped: existing block indexes are not sequential.');
}
const productsById = new Map(products.map((product) => [product.id, product]));
const originalByProductId = new Map(originalBlocks.map((block) => [block.productId, block]));
for (const product of products) {
  if (!originalByProductId.has(product.id)) {
    throw new Error(`Dry run stopped: product ${product.id} has no ledger block.`);
  }
}

const productChanges = [];
const updatedProducts = products.map((product) => {
  const blockchainHash = calculateProductFingerprint(product);
  if (blockchainHash !== product.blockchainHash) {
    productChanges.push({
      id: product.id,
      batchNo: product.batchNo,
      fields: { blockchainHash: { from: product.blockchainHash, to: blockchainHash } },
    });
  }
  return { ...product, blockchainHash };
});
const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));

const genesisData = JSON.parse(createGenesisBlock().data);
let previousHash = '0'.repeat(64);
const plannedBlocks = originalBlocks.map((original, position) => {
  const isGenesis = position === 0;
  const product = isGenesis ? null : updatedById.get(original.productId);
  if (!isGenesis && !product) {
    throw new Error(`Dry run stopped: block ${original.index} does not reference a known product.`);
  }
  const payload = isGenesis
    ? genesisData
    : {
        productId: product.id,
        productName: product.name,
        qrCode: product.qrCode,
        batchNo: product.batchNo,
        manufacturer: product.manufacturer,
        category: product.category,
        description: product.description ?? null,
        blockchainHash: product.blockchainHash,
      };
  const block = {
    id: original.id,
    index: original.index,
    timestamp: original.timestamp,
    productId: isGenesis ? 'genesis' : product.id,
    productName: isGenesis ? 'Genesis Block - Chain Origin' : product.name,
    previousHash,
    nonce: original.nonce,
    data: JSON.stringify(payload),
  };
  block.hash = calculateBlockHash(block);
  previousHash = block.hash;
  return block;
});

const blockChanges = [];
const blockFields = ['productId', 'productName', 'previousHash', 'nonce', 'data', 'hash'];
for (let position = 0; position < originalBlocks.length; position += 1) {
  const before = originalBlocks[position];
  const after = plannedBlocks[position];
  const fields = {};
  for (const field of blockFields) {
    if (before[field] !== after[field]) fields[field] = { from: before[field], to: after[field] };
  }
  if (Object.keys(fields).length) blockChanges.push({ id: before.id, index: before.index, fields });
}

const integrity = verifyChain(plannedBlocks);
const productLinksValid = updatedProducts.every((product) => {
  const block = plannedBlocks.find((candidate) => candidate.productId === product.id);
  return block && verifyProductBlock(product, block);
});
if (!integrity.valid || !productLinksValid) {
  throw new Error(`Dry run validation failed: ${integrity.reason || 'product-to-ledger mismatch'}`);
}

const report = {
  mode: 'dry-run only; no database connection or writes performed',
  sourceBackup: snapshot.sourceBackup,
  auditSnapshot: snapshotPath,
  plan: {
    productsTotal: products.length,
    productRowsChanged: productChanges.length,
    blocksTotal: originalBlocks.length,
    blockRowsChanged: blockChanges.length,
    verificationsTotal: snapshot.verifications.length,
    verificationRowsChanged: 0,
    qrCodesChanged: 0,
    productIdsChanged: 0,
    blockIdsChanged: 0,
    blockIndexesChanged: 0,
    timestampsChanged: 0,
    manufacturerOwnershipFieldsChanged: 0,
    verificationIdsOrRelationshipsChanged: 0,
    postRepairChainValid: integrity.valid,
    postRepairProductLinksValid: productLinksValid,
  },
  productChanges,
  blockChanges,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(reportPath, serialized, { flag: 'wx' });
console.log(JSON.stringify({ reportPath, plan: report.plan }, null, 2));
