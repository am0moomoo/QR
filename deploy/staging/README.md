# Staging deployment

This target is the production-truth candidate for the current MVP. It keeps the queue worker separate from the API process, uses PostgreSQL + Redis, and is designed to run against a private S3-compatible bucket such as AWS S3 or Cloudflare R2.

## Topology

- `web`: Next.js dashboard application
- `api`: NestJS REST API handling auth, dashboard CRUD, and short-link ingress
- `worker`: BullMQ worker process for QR renders, scan-event processing, and aggregate recomputation
- `migrate`: one-shot Prisma migration job that must complete before `api` and `worker`
- `postgres`: primary application database
- `redis`: cache, rate-limit state, and BullMQ transport
- `storage`: external S3 or R2 bucket with private object access

## Storage policy

- Buckets should stay private.
- QR download links stay stable at `/api/v1/qr-codes/{id}/downloads?format=png|svg`.
- When `STORAGE_DRIVER=s3` or `STORAGE_DRIVER=r2`, the API now turns those authenticated download requests into short-lived signed redirects.
- `STORAGE_SIGNED_URL_TTL_SECONDS` controls signed URL lifetime.

## Local staging rehearsal

1. Copy [deploy/staging/.env.staging.example](/C:/Users/aziz0/Desktop/qr-platform-starter/deploy/staging/.env.staging.example) to `deploy/staging/.env.staging`.
2. Fill in Postgres, Redis, JWT, and S3/R2 secrets.
3. Start the stack:

```bash
docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging up --build
```

4. The `migrate` service runs `prisma migrate deploy` before the long-running services start.
5. If you need demo data after migrations, run:

```bash
docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging run --rm api pnpm db:seed
```

## Required env and secrets

- App URLs: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, `SHORT_DOMAIN`
- Database: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`
- Redis and queues: `REDIS_URL`, `REDIS_KEY_PREFIX`, `QUEUE_DRIVER`, `QUEUE_PREFIX`, `QUEUE_ROLE`, `SCAN_WRITE_SYNC`
- Auth and scan integrity: `JWT_SECRET`, `SESSION_TTL_HOURS`, `IP_HASH_SALT`, `RESET_TOKEN_TTL_MINUTES`
- Storage: `STORAGE_DRIVER`, `STORAGE_SIGNED_URL_TTL_SECONDS`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`
- Rate limits: `SCAN_RATE_LIMIT_WINDOW_SECONDS`, `SCAN_RATE_LIMIT_MAX_REQUESTS`
- Optional integrations not yet production-ready: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRIPE_*`, `RESEND_API_KEY`, `WEBHOOK_SIGNING_SECRET`

## Queue runtime truth

- `api` should run with `QUEUE_ROLE=producer`.
- `worker` should run with `QUEUE_ROLE=both`.
- The worker consumes render jobs, scan-event jobs, and aggregate jobs.
- Scan-event processing fans out into aggregate recomputation via BullMQ, so retries and idempotency should be observed with the worker online.

## Object-storage verification

Use the staging smoke script after deployment:

```bash
node scripts/staging-smoke.mjs
```

Recommended environment:

```bash
API_URL=https://api-staging.example.com
APP_URL=https://staging.example.com
STAGING_SMOKE_WORKSPACE_ID=<workspace-uuid>
STAGING_SMOKE_EXPECT_STORAGE_REDIRECT=true
STAGING_SMOKE_VERIFY_RESET_PASSWORD=false
```

What the smoke script verifies:

- API health
- web availability at `/dashboard`
- register -> login -> create QR
- render PNG/SVG through the queue-backed API path
- authenticated QR download endpoint
- signed redirect behavior when remote object storage is enabled
- short-link scan redirect
- analytics aggregate eventually reflecting the scan
- profile/settings update
- forgot-password request acceptance

Reset-password completion is only verified when staging provides a real reset token path, such as a dedicated smoke mailbox or a temporary operator-supplied token. The workflow intentionally leaves this opt-in so that production-like staging does not have to expose reset tokens in API responses.

Because workspace listing and management are still intentionally out of scope for the current MVP UI/API pass, the smoke flow expects `STAGING_SMOKE_WORKSPACE_ID` to be provided explicitly.

## Orphan cleanup strategy

The current implementation includes a diff-based cleanup command that compares `QRAsset.storageKey` rows to live bucket objects under the `qr/` prefix.

Dry-run:

```bash
pnpm --filter @qr/api storage:cleanup:dry-run
```

Delete confirmed orphaned objects:

```bash
pnpm --filter @qr/api storage:cleanup
```

This is currently an operator-run maintenance task. Automated retention scheduling is still a blocker for production hardening.

## GitHub workflow

The repository now includes [staging-smoke.yml](/C:/Users/aziz0/Desktop/qr-platform-starter/.github/workflows/staging-smoke.yml) as a manual workflow. It runs `scripts/staging-smoke.mjs` against a deployed target and records only what was actually exercised.

## Current truth boundary

- CI can truthfully verify inline-queue and BullMQ-runtime behavior inside service containers.
- This staging target is prepared but not yet observed from this machine until a real deployment and smoke run are executed against live URLs and live S3/R2 credentials.
