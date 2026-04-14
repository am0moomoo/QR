# Runtime deployment foundation

This is a deployable runtime shape for the current product without claiming that a real staging or hosting target already exists.

## Runtime roles

- `web`: Next.js product UI
- `api`: NestJS REST API and authenticated download gateway
- `worker`: BullMQ consumer for render jobs, scan-event processing, and aggregate recomputation
- `migrate`: one-shot Prisma migration job
- `postgres`: primary data store
- `redis`: cache, rate limits, and queue transport
- `storage`: either a local volume or a private S3/R2 bucket

## Truth boundary

- `prepared` means the runtime shape, env templates, healthchecks, and docs exist in the repo
- `observed` means somebody actually booted a deployment target and collected evidence
- this document is only `prepared` truth right now

## Files

- compose: [docker-compose.runtime.yml](C:/Users/aziz0/Desktop/qr-platform-starter/deploy/runtime/docker-compose.runtime.yml)
- env template: [\.env.runtime.example](C:/Users/aziz0/Desktop/qr-platform-starter/deploy/runtime/.env.runtime.example)
- api image: [Dockerfile.api](C:/Users/aziz0/Desktop/qr-platform-starter/deploy/runtime/Dockerfile.api)
- web image: [Dockerfile.web](C:/Users/aziz0/Desktop/qr-platform-starter/deploy/runtime/Dockerfile.web)

## Boot the full stack

1. Copy [\.env.runtime.example](C:/Users/aziz0/Desktop/qr-platform-starter/deploy/runtime/.env.runtime.example) to `deploy/runtime/.env.runtime`.
2. Fill required secrets and URLs.
3. Boot the stack:

```bash
docker compose -f deploy/runtime/docker-compose.runtime.yml --env-file deploy/runtime/.env.runtime up --build -d
```

4. Check the one-shot migration job and long-lived services:

```bash
docker compose -f deploy/runtime/docker-compose.runtime.yml --env-file deploy/runtime/.env.runtime ps
docker compose -f deploy/runtime/docker-compose.runtime.yml --env-file deploy/runtime/.env.runtime logs migrate api worker web --tail=200
```

## Required env vars

### Shared app identity

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `API_URL`
- `NEXT_PUBLIC_API_URL`
- `SHORT_DOMAIN`
- `NODE_ENV=production`
- `LOG_LEVEL`

### Database and cache

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_KEY_PREFIX`

### Queue runtime

- `QUEUE_DRIVER=bullmq`
- `QUEUE_PREFIX`
- `QUEUE_ROLE=producer` for `api`
- `QUEUE_ROLE=both` for `worker`
- `WORKER_HEALTH_PATH`
- `WORKER_HEALTH_MAX_AGE_SECONDS`

### Auth and scan integrity

- `JWT_SECRET`
- `SESSION_TTL_HOURS`
- `IP_HASH_SALT`
- `RESET_TOKEN_TTL_MINUTES`
- `SCAN_RATE_LIMIT_WINDOW_SECONDS`
- `SCAN_RATE_LIMIT_MAX_REQUESTS`
- `SCAN_WRITE_SYNC`

### Storage

- `STORAGE_DRIVER=local|s3|r2`
- `STORAGE_LOCAL_ROOT` when using local storage
- `STORAGE_SIGNED_URL_TTL_SECONDS`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

### Optional hooks

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STRIPE_*`
- `RESEND_API_KEY`
- `WEBHOOK_SIGNING_SECRET`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_SERVICE_NAME`

## Healthchecks and startup order

- `postgres` must be healthy before `migrate`
- `redis` must be healthy before `migrate`, `api`, and `worker`
- `migrate` must finish successfully before `api` and `worker`
- `api` must be healthy before `web`
- `worker` publishes a heartbeat file and is checked through `pnpm --filter @qr/api health:worker`

## Storage modes

### Local

- default for first deploy rehearsals
- stores assets on the shared `storage_data` Docker volume
- easiest way to rehearse the full stack before bucket credentials exist

### S3 or R2

- keep the bucket private
- authenticated API download endpoints stay stable
- the API turns them into short-lived signed redirects
- object-store truth is still unobserved until a real bucket is exercised

## Verify product flows after boot

Use the API health endpoint first:

```bash
curl http://localhost:4000/api/v1/health
```

Then run the deployment smoke script against the deployed URLs:

```bash
API_URL=http://localhost:4000 APP_URL=http://localhost:3000 STAGING_SMOKE_WORKSPACE_ID=<workspace-id> node scripts/staging-smoke.mjs
```

The smoke covers:

- register
- login
- create QR
- render PNG/SVG
- download PNG/SVG
- scan slug
- analytics update
- profile update

## Backup and restore expectations

- PostgreSQL is the source of truth and needs regular dumps or volume snapshots
- Redis can be rebuilt from PostgreSQL and live traffic, but queue/rate-limit state will be lost during restore
- local-storage deploys need filesystem backups for `storage_data`
- S3/R2 deploys should rely on provider durability, bucket versioning when possible, and an operator-owned restore plan
- restore order should be: database, storage, app secrets, deploy stack, migrate, then smoke verification

## Not yet claimed

- no staging deployment is claimed from this document
- no real bucket verification is claimed from this document
- no hosting provider is claimed from this document
