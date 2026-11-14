const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const root = process.cwd();
const livePath = path.resolve(process.argv[2] || 'db/custom.db');
const backupPath = path.resolve(process.argv[3] || 'db/custom_pre_reattestation_20261114.db');
const snapshotPath = path.resolve(process.argv[4] || 'db/ledger_reattestation_audit_snapshot_20261114.json');
const reportPath = path.resolve(process.argv[5] || 'db/ledger_reattestation_dry_run_20261114.json');
for (const target of [livePath, backupPath, snapshotPath, reportPath]) {
  if (!fs.existsSync(target)) throw new Error(`Required repair-plan file not found: ${target}`);
}
if (livePath === backupPath) throw new Error('Live database and backup paths must be different.');

const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
const databaseUrlMatch = envText.match(/^\s*DATABASE_URL\s*=\s*['"]?(.*?)['"]?\s*$/m);
if (!databaseUrlMatch || !databaseUrlMatch[1].startsWith('file:')) {
  throw new Error('Could not confirm a SQLite DATABASE_URL in .env.');
}
const configuredPath = databaseUrlMatch[1].slice(5).split('?')[0];
if (path.resolve(root, 'prisma', configuredPath) !== livePath) {
  throw new Error('The requested live database does not match the project DATABASE_URL.');
}

const {
  calculateBlockHash,
  calculateProductFingerprint,
  createGenesisBlock,
  verifyChain,
  verifyProductBlock,
} = require('../src/lib/blockchain.ts');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
if (path.resolve(snapshot.sourceBackup) !== backupPath) {
  throw new Error('Audit snapshot refers to a different backup.');
}
if (!report.plan.postRepairChainValid || !report.plan.postRepairProductLinksValid) {
  throw new Error('Dry-run report does not confirm valid repaired integrity.');
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function allTableDigests(database) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  const result = {};
  for (const name of tables) {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    const columns = database.prepare(`PRAGMA table_info(${quoted})`).all().map((row) => row.name);
    const rows = database.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all();
    const tuples = rows.map((row) => columns.map((column) => row[column]));
    result[name] = {
      count: rows.length,
      digest: createHash('sha256').update(stable(tuples), 'utf8').digest('hex'),
    };
  }
  return result;
}

function readSnapshotRows(database) {
  return {
    products: database.prepare('SELECT id,name,category,manufacturer,batchNo,description,qrCode,blockchainHash,isVerified,verifiedCount,createdAt,updatedAt,manufacturerId FROM Product ORDER BY id').all(),
    blocks: database.prepare('SELECT id,"index",timestamp,productId,productName,hash,previousHash,nonce,data,createdAt FROM Block ORDER BY "index"').all(),
    verifications: database.prepare('SELECT id,productId,qrCode,isAuthentic,result,createdAt FROM Verification ORDER BY id').all(),
  };
}

function assertSnapshotMatches(rows) {
  for (const table of ['products', 'blocks', 'verifications']) {
    if (stable(rows[table]) !== stable(snapshot[table])) {
      throw new Error(`Live ${table} rows differ from the preserved audit snapshot.`);
    }
  }
}

function constructRepairedRows(rows) {
  const productById = new Map(rows.products.map((product) => [product.id, product]));
  const productTargets = new Map();
  for (const product of rows.products) {
    productTargets.set(product.id, {
      ...product,
      blockchainHash: calculateProductFingerprint(product),
    });
  }
  const ordered = [...rows.blocks].sort((a, b) => a.index - b.index);
  if (ordered.length !== rows.products.length + 1 || !ordered.every((block, i) => block.index === i)) {
    throw new Error('Live block/product counts or sequential indexes differ from the approved plan.');
  }
  const canonicalGenesisData = JSON.parse(createGenesisBlock().data);
  let previousHash = '0'.repeat(64);
  const blocks = ordered.map((oldBlock, position) => {
    const genesis = position === 0;
    const product = genesis ? null : productTargets.get(oldBlock.productId);
    if (!genesis && (!product || !productById.has(oldBlock.productId))) {
      throw new Error(`Block ${oldBlock.index} does not reference an existing product.`);
    }
    const payload = genesis
      ? canonicalGenesisData
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
    const next = {
      id: oldBlock.id,
      index: oldBlock.index,
      timestamp: oldBlock.timestamp,
      productId: genesis ? 'genesis' : product.id,
      productName: genesis ? 'Genesis Block - Chain Origin' : product.name,
      previousHash,
      nonce: oldBlock.nonce,
      data: JSON.stringify(payload),
    };
    next.hash = calculateBlockHash(next);
    previousHash = next.hash;
    return next;
  });
  return { productTargets, blocks };
}

function checkDryRun(rows, targets) {
  const plannedProducts = new Map(report.productChanges.map((item) => [item.id, item]));
  for (const product of rows.products) {
    const target = targets.productTargets.get(product.id);
    const change = plannedProducts.get(product.id);
    if (target.blockchainHash !== product.blockchainHash) {
      if (!change || change.fields.blockchainHash.from !== product.blockchainHash || change.fields.blockchainHash.to !== target.blockchainHash) {
        throw new Error(`Product ${product.id} no longer matches the approved dry-run.`);
      }
    } else if (change) {
      throw new Error(`Unexpected Product change listed for ${product.id}.`);
    }
  }
  const plannedBlocks = new Map(report.blockChanges.map((item) => [item.id, item]));
  for (let i = 0; i < rows.blocks.length; i += 1) {
    const before = rows.blocks[i];
    const after = targets.blocks[i];
    const change = plannedBlocks.get(before.id);
    const allowedFields = ['data', 'hash', 'previousHash'];
    const expectedFields = allowedFields.filter((field) => before[field] !== after[field]);
    if (stable(expectedFields.sort()) !== stable(Object.keys(change?.fields || {}).sort())) {
      throw new Error(`Block ${before.id} changed fields differ from the approved dry-run.`);
    }
    for (const field of expectedFields) {
      const planned = change.fields[field];
      if (planned.from !== before[field] || planned.to !== after[field]) {
        throw new Error(`Block ${before.id}.${field} differs from the approved dry-run.`);
      }
    }
  }
}

function integrityChecks(database) {
  const chainRows = database.prepare('SELECT "index",timestamp,productId,productName,hash,previousHash,nonce,data FROM Block ORDER BY "index"').all();
  const chain = verifyChain(chainRows);
  if (!chain.valid) throw new Error(`Full ledger validation failed at block ${chain.brokenAt}: ${chain.reason}`);
  const productRows = database.prepare('SELECT id,name,category,manufacturer,batchNo,description,qrCode,blockchainHash FROM Product ORDER BY id').all();
  const blockByProduct = new Map(chainRows.map((block) => [block.productId, block]));
  for (const product of productRows) {
    const block = blockByProduct.get(product.id);
    if (!block || !verifyProductBlock(product, block)) {
      throw new Error(`Product-to-ledger validation failed for ${product.id}.`);
    }
  }
  const sqliteIntegrity = database.prepare('PRAGMA integrity_check').get().integrity_check;
  if (sqliteIntegrity !== 'ok') throw new Error(`SQLite integrity_check failed: ${sqliteIntegrity}`);
  const foreignKeyIssues = database.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeyIssues.length) throw new Error(`SQLite foreign_key_check found ${foreignKeyIssues.length} violation(s).`);
  return { chainValid: true, productLinksValid: true, sqliteIntegrity, foreignKeyViolations: 0 };
}

const live = new DatabaseSync(livePath, { enableForeignKeyConstraints: true });
const backup = new DatabaseSync(backupPath, { readOnly: true });
let transactionOpen = false;
try {
  live.exec('PRAGMA busy_timeout = 10000');
  const liveDigests = allTableDigests(live);
  const backupDigests = allTableDigests(backup);
  if (stable(liveDigests) !== stable(backupDigests)) {
    throw new Error('Live database no longer matches the verified backup; stopping before writes.');
  }
  const beforeRows = readSnapshotRows(live);
  assertSnapshotMatches(beforeRows);
  const targets = constructRepairedRows(beforeRows);
  checkDryRun(beforeRows, targets);
  const beforeVerificationRows = live.prepare('SELECT * FROM Verification ORDER BY id').all();

  live.exec('BEGIN IMMEDIATE');
  transactionOpen = true;
  const lockedRows = readSnapshotRows(live);
  assertSnapshotMatches(lockedRows);
  checkDryRun(lockedRows, constructRepairedRows(lockedRows));

  const productUpdate = live.prepare('UPDATE Product SET blockchainHash = ? WHERE id = ? AND blockchainHash = ?');
  let productsUpdated = 0;
  for (const change of report.productChanges) {
    const result = productUpdate.run(change.fields.blockchainHash.to, change.id, change.fields.blockchainHash.from);
    if (Number(result.changes) !== 1) throw new Error(`Product update guard failed for ${change.id}.`);
    productsUpdated += Number(result.changes);
  }

  const blockUpdate = live.prepare('UPDATE Block SET data = ?, previousHash = ?, hash = ? WHERE id = ? AND "index" = ? AND hash = ? AND previousHash = ? AND data = ?');
  let blocksUpdated = 0;
  for (const change of report.blockChanges) {
    const old = lockedRows.blocks.find((block) => block.id === change.id);
    const next = targets.blocks.find((block) => block.id === change.id);
    const result = blockUpdate.run(
      next.data,
      next.previousHash,
      next.hash,
      old.id,
      old.index,
      old.hash,
      old.previousHash,
      old.data
    );
    if (Number(result.changes) !== 1) throw new Error(`Block update guard failed for ${change.id}.`);
    blocksUpdated += Number(result.changes);
  }

  const expectedProducts = lockedRows.products.map((product) => ({
    ...product,
    blockchainHash: targets.productTargets.get(product.id).blockchainHash,
  }));
  const expectedBlocks = lockedRows.blocks.map((block) => {
    const next = targets.blocks.find((candidate) => candidate.id === block.id);
    return { ...block, data: next.data, previousHash: next.previousHash, hash: next.hash };
  });
  const updatedRows = readSnapshotRows(live);
  if (stable(updatedRows.products) !== stable(expectedProducts)) throw new Error('Unexpected Product field changed inside transaction.');
  if (stable(updatedRows.blocks) !== stable(expectedBlocks)) throw new Error('Unexpected Block field changed inside transaction.');
  if (stable(live.prepare('SELECT * FROM Verification ORDER BY id').all()) !== stable(beforeVerificationRows)) {
    throw new Error('Verification history changed inside transaction.');
  }
  const checks = integrityChecks(live);
  live.exec('COMMIT');
  transactionOpen = false;

  const afterChecks = integrityChecks(live);
  const finalRows = readSnapshotRows(live);
  if (stable(finalRows.products) !== stable(expectedProducts) || stable(finalRows.blocks) !== stable(expectedBlocks)) {
    throw new Error('Post-commit records differ from the validated transaction result.');
  }
  if (stable(live.prepare('SELECT * FROM Verification ORDER BY id').all()) !== stable(beforeVerificationRows)) {
    throw new Error('Post-commit verification history differs from its pre-repair state.');
  }
  console.log(JSON.stringify({
    result: 'committed',
    productsUpdated,
    blocksUpdated,
    verificationsUpdated: 0,
    preserved: {
      productIds: true,
      qrCodes: true,
      manufacturerOwnership: true,
      blockIds: true,
      blockIndexes: true,
      timestamps: true,
      verificationIdsAndRelationships: true,
      productAndBlockCounts: true,
    },
    preCommitChecks: checks,
    postCommitChecks: afterChecks,
  }, null, 2));
} catch (error) {
  if (transactionOpen) {
    try { live.exec('ROLLBACK'); } catch { /* retain original failure */ }
  }
  console.error('Repair aborted:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally {
  backup.close();
  live.close();
}
