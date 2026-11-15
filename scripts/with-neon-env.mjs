import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [environment = 'production', tool, ...args] = process.argv.slice(2);
const envFiles = {
  production: '.env',
  test: '.env.neon.local',
};
const envKeys = {
  production: { pooled: 'DATABASE_URL', direct: 'DIRECT_URL' },
  test: { pooled: 'PG_DATABASE_URL', direct: 'PG_DIRECT_URL' },
};
const neonEnvPath = envFiles[environment]
  ? path.join(projectRoot, envFiles[environment])
  : null;

if (!neonEnvPath || !['check', 'next', 'prisma'].includes(tool)) {
  console.error('Usage: node scripts/with-neon-env.mjs <production|test> <check|next|prisma> <arguments...>');
  process.exit(2);
}

if (!existsSync(neonEnvPath)) {
  console.error(`Missing ${envFiles[environment]} in the project root.`);
  process.exit(2);
}

if (typeof process.loadEnvFile !== 'function') {
  console.error('This local launcher requires Node.js 20.12 or newer.');
  process.exit(2);
}

try {
  // Read the selected file directly so inherited values cannot select another database.
  const fileEnv = parseEnv(readFileSync(neonEnvPath, 'utf8'));
  process.env.PG_DATABASE_URL = fileEnv[envKeys[environment].pooled];
  process.env.PG_DIRECT_URL = fileEnv[envKeys[environment].direct];
} catch {
  console.error(`Could not read ${envFiles[environment]}.`);
  process.exit(2);
}

const pooledUrl = process.env.PG_DATABASE_URL;
const directUrl = process.env.PG_DIRECT_URL;

function isPostgresUrl(value) {
  if (!value) return false;

  try {
    return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

if (!isPostgresUrl(pooledUrl) || !isPostgresUrl(directUrl)) {
  console.error(`PG_DATABASE_URL and PG_DIRECT_URL must both be valid PostgreSQL URLs in ${envFiles[environment]}.`);
  process.exit(2);
}

if (environment === 'test') {
  const isReadOnlyCommand =
    tool === 'check' ||
    (tool === 'prisma' &&
      ((args[0] === 'migrate' && args[1] === 'status') ||
        args[0] === 'validate' ||
        args[0] === 'generate'));
  let productionUrls = null;

  try {
    const productionEnv = parseEnv(readFileSync(path.join(projectRoot, envFiles.production), 'utf8'));
    if (isPostgresUrl(productionEnv.DATABASE_URL) && isPostgresUrl(productionEnv.DIRECT_URL)) {
      productionUrls = [productionEnv.DATABASE_URL, productionEnv.DIRECT_URL];
    }
  } catch {
    // Read-only checks can proceed when a local production configuration is unavailable.
  }

  if (!productionUrls && !isReadOnlyCommand) {
    console.error('Cannot verify a separate production endpoint; only read-only test commands are allowed.');
    process.exit(2);
  }

  if (!productionUrls) {
    console.log('Production endpoint is unavailable for comparison; test mode is restricted to read-only commands.');
  }

  if (productionUrls) {
    const branchHost = (value) => new URL(value).hostname.replace('-pooler', '');
    const testPooledHost = branchHost(pooledUrl);
    const testDirectHost = branchHost(directUrl);
    const productionPooledHost = branchHost(productionUrls[0]);
    const productionDirectHost = branchHost(productionUrls[1]);
    if (
      testPooledHost !== testDirectHost ||
      testPooledHost === productionPooledHost ||
      testPooledHost === productionDirectHost ||
      testDirectHost === productionPooledHost ||
      testDirectHost === productionDirectHost
    ) {
      console.error('Testing Neon URLs must target one branch that is separate from production.');
      process.exit(2);
    }
  }
}

// Override any inherited DATABASE_URL (including SQLite) before Next or Prisma starts.
process.env.DATABASE_URL = pooledUrl;
process.env.DIRECT_URL = directUrl;
process.env.BLOCKGUARD_DATABASE_ENV = environment;

if (tool === 'check') {
  console.log('Database configuration is valid; pooled and direct URLs were mapped without displaying credentials.');
  process.exit(0);
}

const entrypoints = {
  next: path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
  prisma: path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js'),
};

const child = spawn(process.execPath, [entrypoints[tool], ...args], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', () => {
  console.error(`Could not start the local ${tool} command.`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
