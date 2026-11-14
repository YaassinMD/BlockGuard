# Production readiness and PostgreSQL migration plan

## Audit findings

- The active Prisma schema and migration history are SQLite-specific. A local
  `db/custom.db` file is not a durable shared database for Vercel serverless
  instances, so the live app is not ready to deploy with persistent data yet.
- The previous Next.js build configuration suppressed TypeScript build errors
  and used shell-specific standalone-copy commands. The build now runs Prisma
  Client generation followed by the normal Next.js production build.
- Prisma query logging was enabled for all environments. It is now restricted
  to development; deployed environments log warnings and errors only.
- The app had no baseline browser security headers. Safe framing, MIME sniffing,
  referrer, and unused-device-permission headers are now configured.
- Existing credentials use NextAuth's JWT sessions and bcrypt password hashes.
  `NEXTAUTH_SECRET` and `NEXTAUTH_URL` must be configured in deployment secrets.
  No auth architecture or role behavior was changed.
- Existing admin and manufacturer API handlers enforce roles server-side and
  select safe response fields. The ledger audit remains the authority for
  chain correctness.
- No GitHub Actions or Vercel project configuration was present. A custom
  `vercel.json` is not required for a standard Next.js deployment.

## Prepared database target

`prisma/postgresql/schema.prisma` mirrors the active models and relations using
PostgreSQL. It is a draft and is not selected by the application, Prisma Client
generation, or migration scripts. Existing SQLite migration files remain
untouched. SQLite-specific features in the active schema are limited to the
provider and its migration history; model fields, nullable values, CUID string
IDs, booleans, dates, uniqueness, and the manufacturer relation map directly.

The active `.env.example` keeps a local SQLite URL. Commented Neon URL examples
show the expected runtime pooled `DATABASE_URL` and direct `DIRECT_URL`; these
must only be enabled after approval and schema cutover.

## Migration plan (not executed)

1. Provision a Neon project/database and obtain pooled and direct connection
   strings. Keep both secrets out of source control.
2. Create a fresh, independently verified backup of the current live SQLite
   database and an audit snapshot. The earlier pre-reattestation backup is not
   a current migration backup because legitimate verification history changed
   afterward.
3. Freeze writes for the copy window, take a transaction-consistent SQLite
   export, and record row counts and IDs for User, Product, Block, and
   Verification. Preserve every stored scalar value, including timestamps,
   nullable descriptions, IDs, QR codes, ledger payloads/hashes, manufacturer
   links, and verification history.
4. Generate a new PostgreSQL baseline migration under
   `prisma/postgresql/migrations/`. Do not apply SQLite migration SQL to Neon;
   retain the SQLite `_prisma_migrations` history with the source backup as
   provenance, and establish a separate PostgreSQL migration history.
5. Apply the PostgreSQL baseline only to a new, empty target database, then
   copy records without regenerating or re-attesting any values. Do not point
   migration tooling at the live SQLite database.
6. Compare table counts, primary IDs, unique QR/batch/hash values, timestamps,
   nullable descriptions, manufacturer relationships, and verification
   history. Run the full ledger audit against both source snapshot and target.
7. Exercise isolated API tests against the PostgreSQL target, then present the
   comparison and cutover plan for approval before changing production
   connection settings.

No migration, live database write, reset, seed, or deployment is part of this
phase. `npm run db:deploy:postgres` targets only the separate PostgreSQL schema
and migration history; do not run it until the migration plan has been
approved and the target Neon database is provisioned.

## Deployment requirements

- Confirm the project qualifies for Vercel Hobby before using it: Hobby is
  limited to personal, non-commercial usage. Commercial BlockGuard use requires
  an eligible plan under Vercel's current terms.
- Set `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and the approved persistent database
  URLs as encrypted Vercel environment variables.
- Keep the build command at `npm run build`. Configure the migration step as a
  deliberate deployment operation after approval; do not seed on build.
- GitHub source control can use the normal Vercel Next.js integration. No
  workflow or repository change is required for the current local phase.

Provider limits and terms change over time; recheck before account setup. As
checked 2026-11-14, Neon Free lists 100 CU-hours per project/month, 1 GB storage
per project, and 5 GB public network transfer per project/month. Vercel Hobby
includes monthly function/build resources but is restricted to non-commercial
personal use. These are provider limits, not a production availability or
backup guarantee.
