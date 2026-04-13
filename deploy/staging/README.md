# Staging deployment

This target is the production-truth candidate for the current MVP. It keeps the queue worker separate from the API process, runs Prisma migrations before long-lived services, and is designed to use a private S3-compatible bucket such as AWS S3 or Cloudflare R2.

## Topology

- `web`: Next.js dashboard application
- `api`: NestJS REST API for auth, dashboard CRUD, analytics reads, and short-link ingress
- `worker`: BullMQ worker process for QR renders, raw scan-event processing, and aggregate recomputation
- `migrate`: one-shot Prisma migration job that must complete before `api` and `worker`
- `postgres`: primary application database
- `redis`: cache, rate-limit state, and BullMQ transport
- `storage`: external private S3 or R2 bucket

## Truth boundary

- `prepared`: the deployment artifacts, smoke scripts, and CI hooks exist
- `observed`: a real deployment or real bucket was actually exercised and produced logs or workflow evidence
- do not mark staging or bucket truth complete from configuration alone

## Deployment prerequisites

- one Linux VM or container host with Docker Engine and Docker Compose
- DNS for:
  - `APP_URL`, for example `https://staging.example.com`
  - `API_URL`, for example `https://api-staging.example.com`
  - `SHORT_DOMAIN`, which can point at the API host for the current MVP
- TLS termination in front of `web:3000` and `api:4000`
- a PostgreSQL 16 data volume
- a Redis 7 data volume
- a private S3-compatible bucket with access key and secret

## Required env and secrets

Copy [deploy/staging/.env.staging.example](/C:/Users/aziz0/Desktop/qr-platform-starter/deploy/staging/.env.staging.example) to `deploy/staging/.env.staging` and fill all required values.

### App URLs

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `API_URL`
- `NEXT_PUBLIC_API_URL`
- `SHORT_DOMAIN`

### Database

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

### Redis and queues

- `REDIS_URL`
- `REDIS_KEY_PREFIX`
- `QUEUE_DRIVER=bullmq`
- `QUEUE_PREFIX`
- `QUEUE_ROLE=producer` for the API process
- `QUEUE_ROLE=both` for the worker process
- `SCAN_WRITE_SYNC=true`

### Auth and scan integrity

- `JWT_SECRET`
- `SESSION_TTL_HOURS`
- `IP_HASH_SALT`
- `RESET_TOKEN_TTL_MINUTES`

### Storage

- `STORAGE_DRIVER=s3` or `STORAGE_DRIVER=r2`
- `STORAGE_SIGNED_URL_TTL_SECONDS`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

### Rate limits

- `SCAN_RATE_LIMIT_WINDOW_SECONDS`
- `SCAN_RATE_LIMIT_MAX_REQUESTS`

### Optional integrations that are still not production-ready

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STRIPE_*`
- `RESEND_API_KEY`
- `WEBHOOK_SIGNING_SECRET`

## Deploy procedure

1. Provision the host and install Docker Engine with Compose.
2. Copy this repo to the host.
3. Create `deploy/staging/.env.staging` from the example file.
4. Fill the real secrets, especially database, Redis, JWT, and S3/R2 credentials.
5. Start the stack:

```bash
docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging up --build -d
```

6. Confirm `migrate` exited successfully. It must run `prisma migrate deploy` before the API and worker remain up.
7. Confirm `api` health:

```bash
docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging ps
docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging logs migrate api worker --tail=200
```

8. Seed demo data only when you explicitly want non-empty staging:

```bash
docker compose -f deploy/staging/docker-compose.staging.yml --env-file deploy/staging/.env.staging run --rm api pnpm db:seed
```

## Compose behavior

- `migrate` is a one-shot job and does not publish ports
- `api` publishes `4000`, exposes `/api/v1/health`, and waits for successful migrations
- `worker` is a separate long-lived process and should stay up independently from `api`
- `web` publishes `3000` and waits for a healthy API

## Storage policy

- Buckets should stay private
- authenticated download links stay stable at `/api/v1/qr-codes/{id}/downloads?format=png|svg`
- when `STORAGE_DRIVER=s3` or `STORAGE_DRIVER=r2`, the API turns those authenticated requests into short-lived signed redirects
- `STORAGE_SIGNED_URL_TTL_SECONDS` controls signed URL lifetime

## Real-bucket verification

The repository now supports a dedicated real-bucket smoke path using live S3 or R2 credentials.

What it verifies:

- QR render uploads real PNG and SVG assets into the bucket
- authenticated download endpoints return signed redirects
- signed URLs download real bytes
- unsigned object access is denied for a private bucket
- QR deletion removes generated assets from the bucket
- orphan cleanup dry-run detects orphaned objects
- orphan cleanup delete removes orphaned objects

### GitHub Actions contract for real-bucket verification

Optional CI job `verify-real-bucket` runs automatically on push only when these repo-level inputs exist:

- repository variable `REAL_BUCKET_STORAGE_DRIVER`
- optional repository variables `REAL_BUCKET_S3_REGION`, `REAL_BUCKET_S3_FORCE_PATH_STYLE`
- repository secrets `REAL_BUCKET_S3_ENDPOINT`, `REAL_BUCKET_S3_BUCKET`, `REAL_BUCKET_S3_ACCESS_KEY_ID`, `REAL_BUCKET_S3_SECRET_ACCESS_KEY`

If those are absent, the job is skipped and bucket truth remains unobserved.

## Staging smoke verification

Use the staging smoke script after a live deployment exists:

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
- render PNG/SVG through the deployed API path
- authenticated QR download endpoint
- signed redirect behavior when remote object storage is enabled
- short-link scan redirect
- analytics aggregate eventually reflecting the scan
- profile/settings update
- forgot-password request acceptance

Reset-password completion stays opt-in until staging has a real smoke mailbox or a temporary operator-supplied reset token path.

### GitHub Actions contract for staging smoke

Optional CI job `verify-staging-smoke` runs automatically on push only when these repo variables exist:

- `STAGING_API_URL`
- `STAGING_APP_URL`
- `STAGING_WORKSPACE_ID`
- optional `STAGING_EXPECT_STORAGE_REDIRECT`
- optional `STAGING_VERIFY_RESET_PASSWORD`

Optional secret:

- `STAGING_SMOKE_RESET_TOKEN`

If the staging URL variables are absent, the job is skipped and staging truth remains unobserved.

The repository also includes [staging-smoke.yml](/C:/Users/aziz0/Desktop/qr-platform-starter/.github/workflows/staging-smoke.yml) as a manual workflow for rerunning the smoke flow against a deployed target.

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

This is still an operator-run maintenance task. Automated retention scheduling remains a production blocker.

## Remaining production blockers after staging prep

- no observed live staging deployment yet from this machine
- no observed live S3/R2 verification yet unless the optional CI job actually runs green
- forgot/reset password still lacks a production-like smoke mailbox flow
- metrics, traces, notification jobs, DLQ handling, backups, and security review are still open
