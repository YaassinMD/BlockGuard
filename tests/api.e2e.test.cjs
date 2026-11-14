const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createServer } = require('node:net');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const testDatabaseName = `blockguard_e2e_${process.pid}_${Date.now()}.db`;
const testDatabasePath = path.join(root, 'db', testDatabaseName);
const testDatabaseUrl = `file:../db/${testDatabaseName}`;
const runtimeParent = path.join(root, '.e2e-runtime');
const runtimeDir = path.join(runtimeParent, `run-${process.pid}-${Date.now()}`);
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const testPassword = 'E2E-Test-Password-2026!';

let prisma;
let nextProcess;
let baseUrl;
let serverOutput = '';
let users;
let sessions;
let createdProducts;

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function cookiePairs(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
  return setCookies.map((value) => value.split(';', 1)[0]);
}

async function signIn(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrfResponse.status, 200, 'NextAuth CSRF endpoint should be available');
  const csrf = await csrfResponse.json();
  const csrfCookies = cookiePairs(csrfResponse);
  const form = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/`,
    json: 'true',
  });
  const callback = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookies.join('; '),
    },
    body: form,
  });
  const cookieJar = [...csrfCookies, ...cookiePairs(callback)];
  const sessionCookie = cookieJar.find((cookie) => /(?:__Secure-)?next-auth\.session-token=/.test(cookie));
  assert.ok(sessionCookie, `NextAuth should issue a session cookie; response=${callback.status} output=${serverOutput.slice(-1500)}`);
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookieJar.join('; ') },
  });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.equal(session.user?.email, email);
  return cookieJar.join('; ');
}

async function api(route, { cookie, method = 'GET', body, rawBody } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let requestBody;
  if (rawBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = rawBody;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${route}`, { method, headers, body: requestBody });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function startApplication() {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  nextProcess = spawn(process.execPath, [nextCli, 'dev', runtimeDir, '--port', String(port)], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: testDatabaseUrl,
      NEXTAUTH_URL: baseUrl,
      NEXTAUTH_SECRET: randomBytes(32).toString('hex'),
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform === 'win32',
  });
  nextProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-12000); });
  nextProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-12000); });

  const deadline = Date.now() + 90000;
  let lastError;
  while (Date.now() < deadline) {
    if (nextProcess.exitCode !== null) throw new Error(`Next.js exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`);
      if (response.status === 200) return;
      lastError = new Error(`Readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message}\n${serverOutput}`);
}

async function stopApplication() {
  if (!nextProcess) return;
  if (process.platform === 'win32' && nextProcess.pid) {
    // Stop only the process tree created for this isolated test server.
    spawnSync('taskkill.exe', ['/PID', String(nextProcess.pid), '/T', '/F'], { windowsHide: true });
  }
  if (nextProcess.exitCode !== null) return;
  const exited = new Promise((resolve) => nextProcess.once('exit', resolve));
  if (process.platform !== 'win32') nextProcess.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (nextProcess.exitCode === null) nextProcess.kill('SIGKILL');
}

async function removeIsolatedDatabaseFiles() {
  const expectedDirectory = path.resolve(root, 'db');
  const resolvedDatabasePath = path.resolve(testDatabasePath);
  const relativeDatabasePath = path.relative(expectedDirectory, resolvedDatabasePath);
  if (
    path.dirname(resolvedDatabasePath) !== expectedDirectory ||
    !/^blockguard_e2e_\d+_\d+\.db$/.test(path.basename(resolvedDatabasePath)) ||
    relativeDatabasePath.startsWith('..') ||
    path.isAbsolute(relativeDatabasePath)
  ) {
    throw new Error('Refusing to remove a database outside the isolated E2E database path.');
  }

  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${resolvedDatabasePath}${suffix}`;
    for (let attempt = 0; attempt < 20 && fs.existsSync(file); attempt += 1) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        if (!['EBUSY', 'EPERM'].includes(error.code) || attempt === 19) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
}

describe('BlockGuard isolated API end-to-end', { concurrency: 1 }, () => {
before(async () => {
  assert.notEqual(path.resolve(testDatabasePath), path.resolve(root, 'db', 'custom.db'), 'E2E must never target the live database');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'db'), { recursive: true });
  for (const entry of ['src', 'prisma', 'public']) {
    fs.cpSync(path.join(root, entry), path.join(runtimeDir, entry), { recursive: true });
  }
  for (const file of ['package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'tailwind.config.ts']) {
    fs.copyFileSync(path.join(root, file), path.join(runtimeDir, file));
  }
  const testDb = new DatabaseSync(testDatabasePath, { enableForeignKeyConstraints: true });
  testDb.exec(fs.readFileSync(path.join(root, 'prisma', 'migrations', '0_init', 'migration.sql'), 'utf8'));
  testDb.exec(fs.readFileSync(path.join(root, 'prisma', 'migrations', '20261113183000_add_user_manufacturer_ownership', 'migration.sql'), 'utf8'));
  const foreignKeyIssues = testDb.prepare('PRAGMA foreign_key_check').all();
  assert.equal(foreignKeyIssues.length, 0, 'isolated migrated database must satisfy foreign keys');
  testDb.close();
  process.env.DATABASE_URL = testDatabaseUrl;
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(testPassword, 4);
  users = {};
  for (const role of ['ADMIN', 'CUSTOMER', 'MANUFACTURER_A', 'MANUFACTURER_B']) {
    const actualRole = role.startsWith('MANUFACTURER') ? 'MANUFACTURER' : role;
    users[role] = await prisma.user.create({
      data: {
        name: `E2E ${role}`,
        email: `${role.toLowerCase()}-${process.pid}@example.test`,
        passwordHash,
        role: actualRole,
        isActive: true,
      },
    });
  }
  await startApplication();
  sessions = {};
  for (const key of Object.keys(users)) sessions[key] = await signIn(users[key].email, testPassword);
  createdProducts = {};
});

after(async () => {
  await stopApplication();
  if (prisma) await prisma.$disconnect();
  await removeIsolatedDatabaseFiles();
  if (fs.existsSync(runtimeDir)) {
    const relativeRuntime = path.relative(runtimeParent, runtimeDir);
    if (relativeRuntime === '' || relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
      throw new Error('Refusing to remove an E2E runtime outside its temporary test directory.');
    }
    fs.rmSync(runtimeDir, { recursive: true, force: false });
  }
});

it('authentication and role authorization protect registration and management APIs', { timeout: 30000 }, async () => {
  const input = { name: 'Authorization Test', category: 'Electronics', manufacturer: 'Test Co', batchNo: 'AUTH-001' };
  assert.equal((await api('/api/products', { method: 'POST', body: input })).status, 401);
  assert.equal((await api('/api/products', { method: 'POST', cookie: sessions.CUSTOMER, body: { ...input, batchNo: 'AUTH-002' } })).status, 403);

  for (const route of ['/api/admin/stats', '/api/admin/manufacturers']) {
    assert.equal((await api(route)).status, 401, `${route} rejects unauthenticated users`);
    assert.equal((await api(route, { cookie: sessions.CUSTOMER })).status, 403, `${route} rejects customers`);
    assert.equal((await api(route, { cookie: sessions.MANUFACTURER_A })).status, 403, `${route} rejects manufacturers`);
    assert.equal((await api(route, { cookie: sessions.ADMIN })).status, 200, `${route} allows admins`);
  }
  assert.equal((await api('/api/manufacturer/dashboard')).status, 401);
  assert.equal((await api('/api/manufacturer/dashboard', { cookie: sessions.CUSTOMER })).status, 403);
  assert.equal((await api('/api/manufacturer/dashboard', { cookie: sessions.ADMIN })).status, 403);
});

it('registration assigns manufacturer ownership from the session and scopes manufacturer listings', { timeout: 30000 }, async () => {
  const register = async (cookie, batchNo, extra = {}) => api('/api/products', {
    method: 'POST', cookie,
    body: {
      name: `Product ${batchNo}`,
      category: 'Electronics',
      manufacturer: 'E2E Manufacturer',
      batchNo,
      ...extra,
    },
  });

  const a = await register(sessions.MANUFACTURER_A, 'E2E-MA-001', { manufacturerId: users.MANUFACTURER_B.id });
  const b = await register(sessions.MANUFACTURER_B, 'E2E-MB-001');
  const admin = await register(sessions.ADMIN, 'E2E-ADMIN-001');
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(admin.status, 201);
  createdProducts.A = a.data;
  createdProducts.B = b.data;
  createdProducts.ADMIN = admin.data;

  const [productA, productB, adminProduct] = await Promise.all([
    prisma.product.findUnique({ where: { id: a.data.id } }),
    prisma.product.findUnique({ where: { id: b.data.id } }),
    prisma.product.findUnique({ where: { id: admin.data.id } }),
  ]);
  assert.equal(productA.manufacturerId, users.MANUFACTURER_A.id, 'frontend manufacturerId is ignored');
  assert.equal(productB.manufacturerId, users.MANUFACTURER_B.id);
  assert.equal(adminProduct.manufacturerId, null);
  assert.match(productA.qrCode, /^BPC-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);

  const dashboardA = await api('/api/manufacturer/dashboard', { cookie: sessions.MANUFACTURER_A });
  const dashboardB = await api('/api/manufacturer/dashboard', { cookie: sessions.MANUFACTURER_B });
  assert.deepEqual(dashboardA.data.products.map((product) => product.id), [productA.id]);
  assert.deepEqual(dashboardB.data.products.map((product) => product.id), [productB.id]);
  const listA = await api('/api/products', { cookie: sessions.MANUFACTURER_A });
  assert.deepEqual(listA.data.map((product) => product.id), [productA.id]);
  assert.ok(!dashboardB.data.products.some((product) => product.id === productA.id));
});

it('verification returns AUTHENTIC for registered QR and FAKE for unknown or malformed input', { timeout: 30000 }, async () => {
  const genuine = await api('/api/verify', { method: 'POST', body: { qrCode: createdProducts.A.qrCode } });
  assert.equal(genuine.status, 200);
  assert.equal(genuine.data.isAuthentic, true);
  assert.equal(genuine.data.product.id, createdProducts.A.id);

  const unknown = await api('/api/verify', { method: 'POST', body: { qrCode: 'BPC-ZZZZ-YYYY-XXXX-WWWW' } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.isAuthentic, false);
  assert.equal(unknown.data.product, null);

  const malformedJson = await api('/api/verify', { method: 'POST', rawBody: '{' });
  assert.equal(malformedJson.status, 400);
  const malformedField = await api('/api/verify', { method: 'POST', body: { qrCode: 42 } });
  assert.equal(malformedField.status, 400);
  const tooLong = await api('/api/verify', { method: 'POST', body: { qrCode: 'X'.repeat(31) } });
  assert.equal(tooLong.status, 400);
});

it('product and ledger tampering, missing blocks, and duplicate indexes are rejected', { timeout: 45000 }, async () => {
  const product = await prisma.product.findUnique({ where: { id: createdProducts.A.id } });
  const block = await prisma.block.findFirst({ where: { productId: product.id } });
  const verify = async () => api('/api/verify', { method: 'POST', body: { qrCode: product.qrCode } });
  assert.equal((await verify()).data.isAuthentic, true);

  const mutateProduct = async (field, value, original) => {
    try {
      await prisma.product.update({ where: { id: product.id }, data: { [field]: value } });
      assert.equal((await verify()).data.isAuthentic, false, `tampered ${field} must be rejected`);
    } finally {
      await prisma.product.update({ where: { id: product.id }, data: { [field]: original } });
    }
  };
  await mutateProduct('name', `${product.name} changed`, product.name);
  await mutateProduct('batchNo', 'E2E-TAMPERED-BATCH', product.batchNo);
  await mutateProduct('blockchainHash', 'f'.repeat(64), product.blockchainHash);

  try {
    await prisma.block.update({ where: { id: block.id }, data: { hash: 'e'.repeat(64) } });
    assert.equal((await verify()).data.isAuthentic, false, 'tampered block hash must be rejected');
  } finally {
    await prisma.block.update({ where: { id: block.id }, data: { hash: block.hash } });
  }
  try {
    await prisma.block.update({ where: { id: block.id }, data: { previousHash: 'd'.repeat(64) } });
    assert.equal((await verify()).data.isAuthentic, false, 'tampered previousHash must be rejected');
  } finally {
    await prisma.block.update({ where: { id: block.id }, data: { previousHash: block.previousHash } });
  }

  try {
    await prisma.block.delete({ where: { id: block.id } });
    assert.equal((await verify()).data.isAuthentic, false, 'missing block must be rejected');
  } finally {
    await prisma.block.create({ data: block });
  }
  await assert.rejects(
    prisma.block.create({ data: { ...block, id: `duplicate-${randomBytes(5).toString('hex')}` } }),
    (error) => error.code === 'P2002',
    'duplicate block indexes must be rejected by the database constraint'
  );
  assert.equal((await verify()).data.isAuthentic, true, 'restored isolated fixture should verify');
});
});
