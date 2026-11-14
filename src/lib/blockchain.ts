
import { createHash, randomInt } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);
const QR_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate a real SHA-256 hash.
 */
export function simpleHash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Generate a cryptographically random product QR identifier.
 */
export function generateQRCode(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from(
      { length: 4 },
      () => QR_CHARACTERS[randomInt(QR_CHARACTERS.length)]
    ).join('')
  );

  return `BPC-${groups.join('-')}`;
}

export interface BlockData {
  index: number;
  timestamp: string;
  productId: string;
  productName: string;
  hash: string;
  previousHash: string;
  nonce: number;
  data: string;
}

export interface ProductFingerprintFields {
  name: string;
  category: string;
  manufacturer: string;
  batchNo: string;
  description: string | null;
  qrCode: string;
}

export interface ProductLedgerFields extends ProductFingerprintFields {
  id: string;
  blockchainHash: string;
}

/** Keep product fingerprint fields and their serialization order identical at write and verify time. */
export function canonicalProductFingerprint(product: ProductFingerprintFields): string {
  return JSON.stringify({
    name: product.name,
    category: product.category,
    manufacturer: product.manufacturer,
    batchNo: product.batchNo,
    description: product.description ?? null,
    qrCode: product.qrCode,
  });
}

export function calculateProductFingerprint(product: ProductFingerprintFields): string {
  return simpleHash(canonicalProductFingerprint(product));
}

/** Check that a ledger block commits to every current product field. */
export function verifyProductBlock(
  product: ProductLedgerFields,
  block: BlockData
): boolean {
  try {
    const data: unknown = JSON.parse(block.data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const payload = data as Record<string, unknown>;
    return payload.productId === product.id &&
      payload.productName === product.name &&
      payload.qrCode === product.qrCode &&
      payload.batchNo === product.batchNo &&
      payload.manufacturer === product.manufacturer &&
      payload.category === product.category &&
      payload.description === (product.description ?? null) &&
      payload.blockchainHash === product.blockchainHash &&
      product.blockchainHash === calculateProductFingerprint(product);
  } catch {
    return false;
  }
}

export function isAuthenticProductRecord(
  product: ProductLedgerFields | null,
  block: BlockData | null,
  chainValid: boolean
): boolean {
  return chainValid && product !== null && block !== null && verifyProductBlock(product, block);
}

export function productManufacturerIdForRole(role: string, userId: string): string | null {
  return role === 'MANUFACTURER' ? userId : null;
}

export function createProductBlock(
  product: ProductLedgerFields,
  previous: Pick<BlockData, 'index' | 'hash'>
): BlockData {
  return createBlock(
    previous.index + 1,
    previous.hash,
    product.id,
    product.name,
    {
      productId: product.id,
      productName: product.name,
      qrCode: product.qrCode,
      batchNo: product.batchNo,
      manufacturer: product.manufacturer,
      category: product.category,
      description: product.description ?? null,
      blockchainHash: product.blockchainHash,
    }
  );
}

/**
 * Calculate a block hash from its contents.
 * The hash field itself is deliberately excluded.
 */
export function calculateBlockHash(block: Omit<BlockData, 'hash'> | BlockData): string {
  const payload = JSON.stringify({
    index: block.index,
    timestamp: block.timestamp,
    productId: block.productId,
    productName: block.productName,
    previousHash: block.previousHash,
    nonce: block.nonce,
    data: block.data,
  });

  return simpleHash(payload);
}

/**
 * Create a block and calculate its SHA-256 hash.
 *
 * This centralized ledger does not use Proof of Work.
 * The nonce is retained for compatibility and future use.
 */
export function createBlock(
  index: number,
  previousHash: string,
  productId: string,
  productName: string,
  additionalData: Record<string, string | null>
): BlockData {
  const timestamp = new Date().toISOString();
  const data = JSON.stringify({
    productId,
    productName,
    ...additionalData,
  });

  const blockWithoutHash = {
    index,
    timestamp,
    productId,
    productName,
    previousHash,
    nonce: 0,
    data,
  };

  return {
    ...blockWithoutHash,
    hash: calculateBlockHash(blockWithoutHash),
  };
}

/**
 * Create the first block in the ledger.
 */
export function createGenesisBlock(): BlockData {
  return createBlock(
    0,
    ZERO_HASH,
    'genesis',
    'Genesis Block - Chain Origin',
    {
      type: 'genesis',
      description: 'Initial block of the product verification ledger',
    }
  );
}

/**
 * Validate the entire ledger.
 *
 * Checks:
 * - Sequential block indexes
 * - Valid timestamps
 * - Genesis block structure
 * - Previous-hash links
 * - Recalculated SHA-256 hashes
 */
export function verifyChain(
  blocks: BlockData[]
): { valid: boolean; brokenAt?: number; reason?: string } {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return {
      valid: false,
      brokenAt: 0,
      reason: 'Ledger is empty',
    };
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (!block || typeof block !== 'object') {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Invalid block structure',
      };
    }

    if (
      !Number.isSafeInteger(block.index) ||
      block.index !== i
    ) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Invalid block index',
      };
    }

    if (
      typeof block.timestamp !== 'string' ||
      Number.isNaN(Date.parse(block.timestamp))
    ) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Invalid block timestamp',
      };
    }

    if (
      typeof block.productId !== 'string' ||
      typeof block.productName !== 'string' ||
      typeof block.data !== 'string' ||
      !Number.isSafeInteger(block.nonce) ||
      block.nonce < 0
    ) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Invalid block fields',
      };
    }

    if (!/^[a-f0-9]{64}$/.test(block.hash)) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Invalid block hash format',
      };
    }

    if (!/^[a-f0-9]{64}$/.test(block.previousHash)) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Invalid previous hash format',
      };
    }

    if (i === 0) {
      if (
        block.previousHash !== ZERO_HASH ||
        block.productId !== 'genesis' ||
        block.productName !== 'Genesis Block - Chain Origin'
      ) {
        return {
          valid: false,
          brokenAt: i,
          reason: 'Invalid genesis block',
        };
      }
    } else if (block.previousHash !== blocks[i - 1].hash) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Previous hash does not match the preceding block',
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(block.data);
    } catch {
      return { valid: false, brokenAt: i, reason: 'Block data is not valid JSON' };
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, brokenAt: i, reason: 'Invalid block data structure' };
    }
    const data = payload as Record<string, unknown>;
    if (data.productId !== block.productId || data.productName !== block.productName) {
      return { valid: false, brokenAt: i, reason: 'Block data identity does not match block fields' };
    }
    if (i === 0) {
      if (data.type !== 'genesis') {
        return { valid: false, brokenAt: i, reason: 'Invalid genesis payload' };
      }
    } else if (
      typeof data.qrCode !== 'string' ||
      typeof data.batchNo !== 'string' ||
      typeof data.manufacturer !== 'string' ||
      typeof data.category !== 'string' ||
      !(typeof data.description === 'string' || data.description === null) ||
      typeof data.blockchainHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.blockchainHash)
    ) {
      return { valid: false, brokenAt: i, reason: 'Invalid product block payload' };
    }

    const expectedHash = calculateBlockHash(block);

    if (block.hash !== expectedHash) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'Block data has been modified or its hash is invalid',
      };
    }
  }

  return { valid: true };
}
