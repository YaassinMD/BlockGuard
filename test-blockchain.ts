
import {
  createGenesisBlock,
  createBlock,
  verifyChain,
} from './src/lib/blockchain';

const genesis = createGenesisBlock();

const block1 = createBlock(
  1,
  genesis.hash,
  'product-001',
  'Test Product',
  {
    qrCode: 'BPC-TEST-1234',
    batchNo: 'TEST-001',
    manufacturer: 'Test Manufacturer',
    category: 'Electronics',
    blockchainHash: 'test-hash',
  }
);

const block2 = createBlock(
  2,
  block1.hash,
  'product-002',
  'Another Product',
  {
    qrCode: 'BPC-TEST-5678',
    batchNo: 'TEST-002',
    manufacturer: 'Test Manufacturer',
    category: 'Electronics',
    blockchainHash: 'test-hash-2',
  }
);

const validChain = [genesis, block1, block2];

console.log('Test 1: Valid chain');
console.log(verifyChain(validChain));

// Modify a block without updating its hash
const tamperedChain = validChain.map((block) => ({ ...block }));
tamperedChain[1].productName = 'Modified Product';

console.log('\nTest 2: Tampered block');
console.log(verifyChain(tamperedChain));

// Break the previous hash link
const brokenChain = validChain.map((block) => ({ ...block }));
brokenChain[2].previousHash = '0'.repeat(64);

console.log('\nTest 3: Broken chain link');
console.log(verifyChain(brokenChain));
