# Local Runbook

## Purpose

Use this runbook to boot the product locally, verify the main user workflow, and troubleshoot common issues without relying on CI logs.

## Prerequisites

- Node.js 22+
- pnpm 10
- Docker Desktop with Compose support
- A free `localhost:3000`, `localhost:4000`, `localhost:5432`, and `localhost:6379`

## First-time setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

## Daily startup

1. Start infrastructure:

```bash
docker compose up -d
```

2. Start the product:

```bash
pnpm dev
```

3. Open the product:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Health: `http://localhost:4000/api/v1/health`
- OpenAPI UI: `http://localhost:4000/api/reference`

## Local verification commands

Run these before handing work off:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm --filter @qr/api test:integration
pnpm test:dashboard:e2e
```

## Where to look during support/debugging

- API structured logs: terminal running `@qr/api`
- Web runtime output: terminal running `@qr/web`
- Browser smoke artifacts after failure:
  - `playwright-report/`
  - `test-results/`
- Product status truth: `specs/implementation-status.md`

## Request IDs

- Every API response should include `X-Request-Id`
- User-facing API errors surface a support reference when available
- When debugging a customer issue, start with the request ID from the UI or API response and find the matching API log line

## Safe recovery steps

If local data becomes confusing:

```bash
docker compose down -v
docker compose up -d
pnpm db:migrate:deploy
pnpm db:seed
```

If dashboard smoke says a port is occupied, stop the stale local process before rerunning `pnpm test:dashboard:e2e`.
