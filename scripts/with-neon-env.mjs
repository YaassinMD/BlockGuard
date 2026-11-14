import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [environment = 'production', tool, ...args] = process.argv.slice(2);
const envFiles = {
  production: '.env.neon.local',
  test: '.env.neon.test.local',
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
  // Parse this file directly so inherited PG_* values cannot select another branch.
  const fileEnv = parseEnv(readFileSync(neonEnvPath, 'utf8'));
  process.env.PG_DATABASE_URL = fileEnv.PG_DATABASE_URL;
  process.env.PG_DIRECT_URL = fileEnv.PG_DIRECT_URL;
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

// Override any inherited DATABASE_URL (including SQLite) before Next or Prisma starts.
process.env.DATABASE_URL = pooledUrl;
process.env.DIRECT_URL = directUrl;

if (tool === 'check') {
  console.log('Neon local configuration is valid; pooled and direct URLs are mapped without displaying credentials.');
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
