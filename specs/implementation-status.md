# Implementation status

Update this file after each major Codex pass.

## Legend
- [ ] not started
- [~] in progress
- [x] done
- [!] blocked / needs decision

## Repo bootstrap
- [x] pnpm workspace
- [x] Next.js app scaffolded
- [x] NestJS app scaffolded
- [~] Prisma wired
- [x] env loading
- [~] lint/typecheck/test setup
- [!] Docker local services

## Auth and users
- [x] register/login
- [ ] Google OAuth
- [x] session handling
- [x] forgot/reset password
- [x] profile settings

## Workspace and folders
- [~] workspaces
- [ ] members
- [ ] folders
- [ ] folder sharing
- [ ] audit logs

## QR management
- [x] QR CRUD
- [x] content schema validation
- [ ] design editor
- [ ] saved templates
- [x] PNG export
- [x] SVG export
- [ ] PDF export
- [ ] JPG export
- [ ] EPS export

## Scan path
- [x] short-link routing
- [x] inactive page
- [x] password gate
- [x] one-time scan logic
- [~] redirect rules
- [~] Redis cache
- [~] rate limiting

## Analytics
- [x] raw scan events
- [x] daily aggregates
- [x] analytics dashboard
- [ ] CSV export
- [ ] retention jobs

## Dashboard UI
- [x] bearer-auth dashboard shell
- [x] generator create flow
- [x] QR list page
- [x] QR details page
- [x] analytics page
- [x] profile/settings page
- [x] dashboard e2e smoke

## Billing
- [ ] plans
- [ ] Stripe checkout
- [ ] Stripe webhooks
- [ ] entitlements
- [ ] quotas
- [ ] invoices UI

## API and integrations
- [ ] API keys
- [~] API v1 create/update/get
- [ ] webhook endpoints
- [ ] safety checks
- [ ] custom domains

## Ops
- [~] CI/CD
- [~] staging deployment target
- [~] staging smoke workflow
- [~] structured logs
- [ ] metrics
- [ ] traces
- [ ] backups
- [ ] load tests
- [ ] security review

## Production readiness
- [~] local + S3/R2 storage abstraction
- [x] queued render processing
- [x] queued scan-event processing
- [x] render/scan idempotency + retries
- [!] notification delivery/jobs
- [~] worker separation from API runtime

## Verification truth
- CI-verified:
  - GitHub Actions run `ci #21` (`24332531431`) succeeded on commit `f4b44467fdce50ca8b05f1c949da7a92eec10447`
  - passed jobs: `verify`, `verify-bullmq-runtime`
  - `verify` observed green for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, `Dashboard end-to-end smoke`
  - `verify-bullmq-runtime` observed green for `Apply migrations`, `Seed database`, and real Redis/BullMQ runtime verification
  - exact API/dashboard smoke flow observed green: `register -> login -> create QR -> render PNG/SVG -> download -> scan slug -> persist raw scan event -> update daily aggregate -> forgot/reset password -> update profile`, plus dashboard `QR list -> QR details -> analytics -> profile/settings`
  - exact BullMQ runtime flow observed green: queue-backed `create QR -> render job retry -> concurrent render dedupe -> scan-event job retry -> requestId idempotency -> aggregate job retry -> daily aggregate recompute`
  - GitHub Actions run `ci #24` (`24334027215`) succeeded on commit `ea02b7e3ae833f48bdc355edd1a9fe47f8f96c8e`
  - passed jobs on `ci #24`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #24`: `verify-real-bucket`, `verify-staging-smoke`
- staging-verified:
  - none yet
  - staging deployment files, healthchecked compose services, manual workflow, and smoke script are prepared, but no staging URL and no observed staging smoke run were available in this session
  - GitHub Actions job `verify-staging-smoke` was observed as `skipped` on `ci #24` because the repository did not expose `STAGING_API_URL`, `STAGING_APP_URL`, and `STAGING_WORKSPACE_ID`
- real-bucket-verified:
  - none yet
  - the real-bucket smoke path now exists in `apps/api/src/integration/real-bucket.spec.ts` and the repository CI can attempt it through job `verify-real-bucket`
  - GitHub Actions job `verify-real-bucket` was observed as `skipped` on `ci #24` because the repository did not expose the required `REAL_BUCKET_STORAGE_DRIVER` variable and live S3/R2 secrets together
- MVP-only or not yet live-verified beyond CI:
  - remote S3/R2 object storage lifecycle, signed-download redirects, and orphan cleanup against a live bucket
  - orphan cleanup as an operator-run maintenance task instead of scheduled retention automation
  - dedicated deployed worker container/process observed in staging
  - forgot/reset password in a production-like staging environment with real email delivery or a smoke mailbox
  - metrics, traces, dead-letter handling, notification jobs, backup strategy, and security review
- top remaining production blockers:
  - no observed staging deployment yet for `web`, `api`, `worker`, `postgres`, `redis`, and storage together
  - no observed S3/R2 verification yet for upload/download/render lifecycle, signed URL policy, or orphan cleanup against a real bucket
  - the repo still needs real staging variables and real bucket secrets configured before GitHub Actions can move those optional jobs from `skipped` to observed execution
  - staging smoke currently requires an explicit `STAGING_SMOKE_WORKSPACE_ID` because workspace listing/management is intentionally still out of scope
  - billing, quotas, and Stripe flows remain intentionally untouched until staging truth exists

## UI shipped vs backend-capable
- shipped in UI: generator create flow, QR list, QR details, analytics, profile/settings
- backend-capable only: Google OAuth, billing, API keys, webhooks, custom domains, folders/workspaces
- intentionally not started in UI: billing polish, bulk import, folders/workspaces, custom domains, visual polish

## Notes
- starter monorepo scaffold added
- spec pack copied from analysis-based codex pack
- 2026-04-13: prisma schema checked and extended with `Session`; webhook secret storage renamed to hashed form in schema
- 2026-04-13: `openapi/openapi.yaml` aligned to implemented auth, QR CRUD, billing plans, and public scan routes
- 2026-04-13: auth now supports register, login, logout, bearer session lookup, and default workspace provisioning
- 2026-04-13: QR CRUD now persists content/design/settings, stable slugs, placeholder download assets, and status transitions
- 2026-04-13: public scan flow now serves `/r/:slug` and `/api/v1/public/r/:slug` with inactive/password/landing handling and async raw scan-event writes
- 2026-04-13: local verification completed for `pnpm lint`, `pnpm typecheck`, `pnpm test`, `@qr/web` production build, and API boot on `/api/v1/health`
- 2026-04-13: docker-compose now defines PostgreSQL + Redis with healthchecks, Prisma migration files were generated under `prisma/migrations/`, and `prisma/seed.ts` was added for deterministic demo data
- 2026-04-13: QR downloads now use a real render pipeline for PNG/SVG, persist binary files into local storage, and stream working assets from `/api/v1/qr-codes/{id}/downloads?format=png|svg`
- 2026-04-13: scan flow now uses Redis-backed cache/rate-limit services with in-process fallback, persists raw scan events through `AnalyticsService`, and computes daily aggregates plus `/api/v1/qr-codes/{id}/analytics`
- 2026-04-13: auth now also supports forgot/reset password and `PATCH /api/v1/me` profile settings
- 2026-04-13: `.github/workflows/ci.yml` now provisions PostgreSQL and Redis service containers, runs `pnpm build`, `pnpm lint`, `pnpm typecheck`, `prisma migrate deploy`, `db:seed`, API unit tests, and a hard-failing API integration smoke flow
- 2026-04-13: CI smoke verification now exercises `register -> login -> create QR -> render PNG/SVG -> download -> scan slug -> persist raw scan event -> update daily aggregate -> forgot/reset password -> update profile`; it refuses to silently skip when `CI=true` or `REQUIRE_INTEGRATION_DB=true`
- 2026-04-13: locally observed green in this session: `pnpm lint`, `pnpm build`, `pnpm typecheck` (after build generates Next route types), `pnpm test`, `@qr/api test:unit`, `@qr/api build`, and `@qr/api test:integration` skip-mode without live DB/Redis
- 2026-04-13: observed GitHub Actions run `ci #1` (`24322690831`) fail on commit `a95c3f262b0550bb418679c5a22a344625ebaab7` at step `Run pnpm/action-setup@v4`; the branch was fixed by removing the explicit `version: 10` input from `.github/workflows/ci.yml`
- 2026-04-13: observed GitHub Actions run `ci #2` (`24322804861`) succeed on commit `37ee22106e7e41f8c8ae26ab4ad656d591acf133`; passed job: `verify`
- 2026-04-13: observed `verify` step success in GitHub Actions for `Install dependencies`, `Generate Prisma client`, `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, and `API integration smoke`
- 2026-04-13: exact end-to-end smoke flow verified green in GitHub Actions on `37ee22106e7e41f8c8ae26ab4ad656d591acf133`: `register -> login -> create QR -> render PNG/SVG -> download -> scan slug -> persist raw scan event -> update daily aggregate -> forgot/reset password -> update profile`
- 2026-04-13: verified blocker in this session: Docker is not installed, and `localhost:5432` / `localhost:6379` are closed, so `docker compose up`, `prisma migrate deploy`, Redis verification, seed execution, and true end-to-end integration runs remain blocked on local infrastructure
- 2026-04-13: dashboard UI now ships real bearer-authenticated pages for QR list, QR details, analytics, and profile/settings on top of `/me`, `/qr-codes`, `/qr-codes/{id}`, `/qr-codes/{id}/downloads`, and `/qr-codes/{id}/analytics`
- 2026-04-13: dashboard UI now exposes a real link-QR generator flow on top of the live backend; folders/workspaces, billing polish, custom domains, bulk import, and visual polish remain intentionally out of scope
- 2026-04-13: local verification for the dashboard pass completed with `pnpm build`, `pnpm typecheck`, `pnpm lint`, `@qr/api test:unit`, `@qr/api test:integration` skip-mode, `node --check scripts/run-dashboard-e2e.mjs`, and `pnpm exec playwright test apps/web/e2e/dashboard.spec.ts --list`
- 2026-04-13: dashboard e2e smoke is now wired into CI to cover list -> details -> analytics -> profile/settings against live web+api servers
- 2026-04-13: observed GitHub Actions run `ci #5` (`24323889571`) succeed on commit `9b0d5c2ac771ad4e006234447a1743361be95e4f`; passed job: `verify`
- 2026-04-13: observed `verify` step success in GitHub Actions for `Install dependencies`, `Generate Prisma client`, `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
- 2026-04-13: exact end-to-end dashboard smoke flow verified green in GitHub Actions on `9b0d5c2ac771ad4e006234447a1743361be95e4f`: `register -> login -> create QR -> render PNG/SVG -> download availability -> scan slug -> QR list search/filter/sort -> QR details -> analytics -> profile/settings update`
- 2026-04-13: dashboard-shell refactor completed; the oversized client shell is now split into focused dashboard components, a session hook, shared view state helpers, and smaller page-specific modules without changing dashboard routes or selectors
- 2026-04-13: local verification for the maintainability pass completed with `@qr/web` typecheck/build, root `pnpm build`, root `pnpm lint`, root `pnpm typecheck`, `@qr/api build`, and `@qr/api test:unit`; `@qr/api test:integration` still honestly skips on this machine without live PostgreSQL/Redis
- 2026-04-13: storage now goes through a driver abstraction that supports `local`, `s3`, and `r2` modes; only local storage is live-verified in this session, while S3/R2 remain code-wired but not yet exercised against a real bucket
- 2026-04-13: QR asset rendering and scan-event persistence now run through queue-oriented services with Redis/BullMQ when available and inline fallbacks when Redis is absent; request-id idempotency is enforced for scan-event writes via the new `ScanEvent.requestId` unique index
- 2026-04-13: observed GitHub Actions run `ci #7` (`24324827821`) fail on commit `7f729404ad227a32c758603dc02d7bfe8aa2bc3e`; the first Node 24 workflow pass still broke in `Build`
- 2026-04-13: observed GitHub Actions run `ci #8` (`24324874515`) fail on commit `b1ca00be70f7a689c83b77d456f4a1e6279282c1`; the Node 24 workflow itself was fixed, but `Build` still failed before lint/typecheck/test
- 2026-04-13: observed GitHub Actions run `ci #9` (`24325042532`) fail on commit `eee5c505afea1c29536af71017ee05cb663f4a49`; failure annotations exposed the true cause: `apps/api/src/common/storage/*` source files were being ignored by `.gitignore`
- 2026-04-13: observed GitHub Actions run `ci #12` (`24325439997`) succeed on commit `1a8a52d3022b8c33bf366e7d40d2947c38ca2ad7`; passed job: `verify`
- 2026-04-13: observed `verify` step success in GitHub Actions for `Run actions/checkout@v5`, `Run actions/setup-node@v6`, `Enable Corepack`, `Install dependencies`, `Generate Prisma client`, `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
- 2026-04-13: exact end-to-end smoke flows verified green in GitHub Actions on `1a8a52d3022b8c33bf366e7d40d2947c38ca2ad7`: backend `register -> login -> create QR -> render PNG/SVG -> download -> scan slug -> persist raw scan event -> update daily aggregate -> forgot/reset password -> update profile`, plus dashboard `register -> login -> create QR -> render PNG/SVG -> download availability -> scan slug -> QR list search/filter/sort -> QR details -> analytics -> profile/settings update`
- 2026-04-13: the main `verify` CI job stays pinned to `QUEUE_DRIVER=inline` for deterministic app/dashboard smoke, while the dedicated `verify-bullmq-runtime` job now truthfully exercises the BullMQ path with real PostgreSQL + Redis service containers
- 2026-04-13: storage now supports signed-download redirects for private `s3`/`r2` buckets while keeping stable authenticated `/api/v1/qr-codes/{id}/downloads?format=png|svg` URLs; only the local-storage path is observed on this machine
- 2026-04-13: staging deployment scaffolding was added under `deploy/staging/` with separate `api`, `worker`, and `migrate` services plus a manual `staging-smoke` GitHub workflow and `scripts/staging-smoke.mjs`; this staging path is prepared but not yet observed against a live target
- 2026-04-13: observed GitHub Actions run `ci #21` (`24332531431`) succeed on commit `f4b44467fdce50ca8b05f1c949da7a92eec10447`; passed jobs: `verify`, `verify-bullmq-runtime`
- 2026-04-13: observed `verify-bullmq-runtime` job success in GitHub Actions for `Apply migrations`, `Seed database`, and `Queue runtime integration truth` after sanitizing BullMQ queue names and separating smoke teardown concerns
- 2026-04-13: exact BullMQ runtime flow verified green in GitHub Actions on `f4b44467fdce50ca8b05f1c949da7a92eec10447`: queue-backed `create QR -> render retry -> concurrent render dedupe -> raw scan-event retry -> requestId idempotency -> aggregate retry -> daily aggregate recompute`
- 2026-04-13: remaining production blockers after this pass: staging is still unverified, real S3/R2 verification is still unobserved, worker separation is prepared but not yet seen in a deployed environment, forgot/reset password still lacks a production-like smoke mailbox path, and metrics/traces/notification jobs/backups/security review are still missing
- 2026-04-13: staging compose hardening now treats `migrate` as a one-shot job with no published port, adds API/web healthchecks, and makes the web service wait for a healthy API before starting
- 2026-04-13: real S3/R2 verification is now codified in `apps/api/src/integration/real-bucket.spec.ts`; the flow checks render upload, signed download redirects, unsigned access denial, QR asset deletion, and orphan cleanup, but it still honestly skips without live bucket credentials
- 2026-04-13: observed GitHub Actions run `ci #23` (`24333928557`) fail on commit `5786ab6a625a14dcbad7e497b8aaab9f6fd1a4e2` before jobs were created because optional verifier gating was wired in an invalid workflow shape
- 2026-04-13: observed GitHub Actions run `ci #24` (`24334027215`) succeed on commit `ea02b7e3ae833f48bdc355edd1a9fe47f8f96c8e`; passed jobs: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`; observed skipped jobs: `verify-real-bucket`, `verify-staging-smoke`
- 2026-04-13: local verification for the staging-prep pass completed with `pnpm.cmd build`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd --filter @qr/api test:unit`, `pnpm.cmd --filter @qr/api test:integration` skip-mode without live DB/Redis, and `pnpm.cmd --filter @qr/api test:integration:real-bucket` skip-mode without live bucket credentials
- 2026-04-13: observed locally in this session that compiled API runtime `POST /api/v1/qr-codes` now returns `201 Created` for a valid `link` payload, persists the QR, generates PNG/SVG assets, and returns working download metadata in both source-test and built-server execution paths
- 2026-04-13: root cause for the broken create flow was reproduced and fixed: Nest `ValidationPipe` was stripping DTO-typed QR request bodies because the controller used Swagger DTO classes without `class-validator` rules; create/update endpoints now keep runtime bodies as `unknown` for Zod validation while still exposing DTO-backed editable Swagger request bodies
- 2026-04-13: observed locally in this session with `pnpm.cmd test:dashboard:e2e` that the browser flow now works end to end on live web+api servers: `register -> login -> truthful empty dashboard state -> generator create link QR -> dashboard list row appears -> search/filter/sort -> QR details -> analytics -> profile/settings`
- 2026-04-13: `scripts/run-dashboard-e2e.mjs` now truthfully refuses occupied test ports and supports Windows process spawning, so local dashboard smoke no longer piggybacks on stale listeners or fails before browser startup
