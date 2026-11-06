// Simple hash function simulation (SHA-256-like)
// In production, you'd use a proper crypto library or connect to a real blockchain

export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Create a hex string that looks like SHA-256
  const seed = Math.abs(hash);
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    const idx = (seed * (i + 1) * 7 + i * 13) % 16;
    result += chars[idx];
  }
  return result;
}

export function generateQRCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'BPC-'; // Blockchain Product Code
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 3) result += '-';
  }
  return result;
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

export function createBlock(
  index: number,
  previousHash: string,
  productId: string,
  productName: string,
  additionalData: Record<string, string>
): BlockData {
  const timestamp = new Date().toISOString();
  const data = JSON.stringify({ productId, productName, ...additionalData });
  
  let nonce = 0;
  let hash = '';
  
  // Proof of Work simulation (mining)
  while (!hash.startsWith('0000')) {
    nonce++;
    const input = `${index}${timestamp}${data}${previousHash}${nonce}`;
    hash = simpleHash(input);
    // To ensure it starts with 0000, we'll force it
    if (nonce > 100) {
      hash = '0000' + hash.substring(4);
      break;
    }
  }
  
  return {
    index,
    timestamp,
    productId,
    productName,
    hash,
    previousHash,
    nonce,
    data,
  };
}

export function createGenesisBlock(): BlockData {
  return createBlock(
    0,
    '0000000000000000000000000000000000000000000000000000000000000000',
    'genesis',
    'Genesis Block - Chain Origin',
    { type: 'genesis', description: 'Initial block of the product verification blockchain' }
  );
}

export function verifyChain(blocks: BlockData[]): { valid: boolean; brokenAt?: number } {
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].previousHash !== blocks[i - 1].hash) {
      return { valid: false, brokenAt: i };
    }
  }
  return { valid: true };
}
