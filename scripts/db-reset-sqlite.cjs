const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const envFiles = [path.join(root, '.env'), path.join(root, 'prisma', '.env')];
const fileValues = [];

for (const envFile of envFiles) {
  if (!fs.existsSync(envFile)) continue;
  const contents = fs.readFileSync(envFile, 'utf8');
  for (const match of contents.matchAll(/^\s*(DATABASE_URL|DIRECT_URL)\s*=\s*(.*?)\s*$/gm)) {
    fileValues.push({ key: match[1], value: match[2].replace(/^['"]|['"]$/g, '') });
  }
}

const databaseUrl = process.env.DATABASE_URL ??
  fileValues.find(({ key }) => key === 'DATABASE_URL')?.value;
const connectionValues = [
  process.env.DATABASE_URL,
  process.env.DIRECT_URL,
  ...fileValues.map(({ value }) => value),
].filter(Boolean);

if (process.env.ALLOW_SQLITE_RESET !== 'YES') {
  console.error('SQLite reset blocked. Set ALLOW_SQLITE_RESET=YES only for an intentional local SQLite reset.');
  process.exit(1);
}

if (!databaseUrl || !/^file:/i.test(databaseUrl)) {
  console.error('SQLite reset blocked: the effective DATABASE_URL is not a SQLite file URL.');
  process.exit(1);
}

if (connectionValues.some((value) => /^postgres(?:ql)?:/i.test(value))) {
  console.error('SQLite reset blocked: a PostgreSQL connection URL is configured.');
  process.exit(1);
}

const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
if (!fs.existsSync(prismaCli)) {
  console.error('SQLite reset failed: Prisma CLI was not found in this project.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  prismaCli,
  'migrate',
  'reset',
  '--schema',
  path.join(root, 'prisma', 'schema.prisma'),
], { cwd: root, env: process.env, stdio: 'inherit' });

if (result.error) {
  console.error('SQLite reset failed to start.');
  process.exit(1);
}
process.exit(result.status ?? 1);
