const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

// Load the production TypeScript helper without a test runner dependency.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const {
  calculateProductFingerprint,
  createGenesisBlock,
  createProductBlock,
  calculateBlockHash,
  generateQRCode,
  isAuthenticProductRecord,
  productManufacturerIdForRole,
  verifyChain,
} = require('../src/lib/blockchain.ts');

function makeProduct(overrides = {}) {
  const base = {
    id: 'product-1',
    name: 'Test Product',
    category: 'Electronics',
    manufacturer: 'Example Co',
    batchNo: 'EX-001',
    description: 'Test description',
    qrCode: 'BPC-AAAA-BBBB-CCCC-DDDD',
  };
  return { ...base, ...overrides, blockchainHash: calculateProductFingerprint({ ...base, ...overrides }) };
}

function appendProduct(previous, product) {
  return createProductBlock(product, previous);
}

test('genesis block has a valid zero-hash origin and validates', () => {
  const genesis = createGenesisBlock();
  assert.equal(genesis.index, 0);
  assert.equal(genesis.previousHash, '0'.repeat(64));
  assert.equal(verifyChain([genesis]).valid, true);
});

test('valid chain and multiple sequential product blocks validate', () => {
  const genesis = createGenesisBlock();
  const first = makeProduct();
  const second = makeProduct({ id: 'product-2', batchNo: 'EX-002', qrCode: 'BPC-EEEE-FFFF-GGGG-HHHH' });
  const firstBlock = appendProduct(genesis, first);
  const secondBlock = appendProduct(firstBlock, second);
  assert.deepEqual([genesis.index, firstBlock.index, secondBlock.index], [0, 1, 2]);
  assert.equal(secondBlock.previousHash, firstBlock.hash);
  assert.equal(verifyChain([genesis, firstBlock, secondBlock]).valid, true);
});

test('modified block data is rejected', () => {
  const genesis = createGenesisBlock();
  const block = appendProduct(genesis, makeProduct());
  const tampered = { ...block, data: block.data.replace('Test Product', 'Changed Product') };
  assert.equal(verifyChain([genesis, tampered]).valid, false);
});

test('modified previous hash is rejected', () => {
  const genesis = createGenesisBlock();
  const first = appendProduct(genesis, makeProduct());
  const second = appendProduct(first, makeProduct({ id: 'product-2', batchNo: 'EX-002' }));
  assert.equal(verifyChain([genesis, first, { ...second, previousHash: 'f'.repeat(64) }]).valid, false);
});

test('missing, gapped, and duplicate block indexes are rejected', () => {
  assert.equal(verifyChain([]).valid, false);
  const genesis = createGenesisBlock();
  const block = appendProduct(genesis, makeProduct());
  assert.equal(verifyChain([genesis, { ...block, index: 2 }]).valid, false);
  assert.equal(verifyChain([genesis, { ...block, index: 0 }]).valid, false);
});

test('invalid timestamp and malformed block payload are rejected', () => {
  const genesis = createGenesisBlock();
  assert.equal(verifyChain([{ ...genesis, timestamp: 'not-a-date' }]).valid, false);
  assert.equal(verifyChain([{ ...genesis, data: '{bad json' }]).valid, false);
});

test('genuine product matches its ledger record and changed product fields do not', () => {
  const genesis = createGenesisBlock();
  const product = makeProduct();
  const block = appendProduct(genesis, product);
  assert.equal(isAuthenticProductRecord(product, block, verifyChain([genesis, block]).valid), true);
  assert.equal(isAuthenticProductRecord({ ...product, name: 'Modified Product' }, block, true), false);
  assert.equal(isAuthenticProductRecord({ ...product, description: 'Modified description' }, block, true), false);
});

test('tampered ledger product data cannot authenticate even if its block hash is recalculated', () => {
  const genesis = createGenesisBlock();
  const product = makeProduct();
  const original = appendProduct(genesis, product);
  const changedData = original.data.replace('Test Product', 'Changed Product');
  const tampered = { ...original, productName: 'Changed Product', data: changedData };
  tampered.hash = calculateBlockHash(tampered);
  assert.equal(verifyChain([genesis, tampered]).valid, true);
  assert.equal(isAuthenticProductRecord(product, tampered, true), false);
});

test('unknown QR lookup and a missing product block cannot authenticate', () => {
  assert.equal(isAuthenticProductRecord(null, null, true), false);
  const genesis = createGenesisBlock();
  assert.equal(isAuthenticProductRecord(makeProduct(), null, verifyChain([genesis]).valid), false);
});

test('nullable descriptions use one canonical fingerprint and ledger representation', () => {
  const genesis = createGenesisBlock();
  const product = makeProduct({ description: null });
  const block = appendProduct(genesis, product);
  assert.equal(JSON.parse(block.data).description, null);
  assert.equal(isAuthenticProductRecord(product, block, verifyChain([genesis, block]).valid), true);
});

test('ADMIN products are unassigned and MANUFACTURER products use the authenticated user id', () => {
  assert.equal(productManufacturerIdForRole('ADMIN', 'admin-id'), null);
  assert.equal(productManufacturerIdForRole('MANUFACTURER', 'manufacturer-id'), 'manufacturer-id');
});

test('ADMIN and MANUFACTURER registrations both create valid product blocks', () => {
  const genesis = createGenesisBlock();
  for (const [role, userId, expectedOwner] of [
    ['ADMIN', 'admin-id', null],
    ['MANUFACTURER', 'manufacturer-id', 'manufacturer-id'],
  ]) {
    const product = makeProduct({
      id: `product-${role.toLowerCase()}`,
      batchNo: `EX-${role}`,
      qrCode: generateQRCode(),
      description: null,
      manufacturerId: productManufacturerIdForRole(role, userId),
    });
    assert.equal(product.manufacturerId, expectedOwner);
    const block = appendProduct(genesis, product);
    assert.equal(verifyChain([genesis, block]).valid, true);
    assert.equal(isAuthenticProductRecord(product, block, true), true);
  }
});

test('QR codes use the expected format and are unique across generated samples', () => {
  const codes = new Set(Array.from({ length: 100 }, generateQRCode));
  assert.equal(codes.size, 100);
  for (const code of codes) assert.match(code, /^BPC-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
});
