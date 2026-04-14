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
- [x] Docker local services

## Auth and users
- [x] register/login
- [ ] Google OAuth
- [x] session handling
- [x] forgot/reset password
- [x] profile settings

## Workspace and folders
- [x] workspaces
- [ ] members
- [x] folders
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
- [x] sign-in/session UX
- [x] generator create flow
- [x] QR list page
- [x] QR details page
- [x] analytics page
- [x] profile/settings page
- [x] QR management actions
- [x] workspace and folder management
- [x] custom domain management
- [x] bulk import/export
- [x] dashboard e2e smoke

## Billing
- [x] plans
- [x] Stripe checkout
- [x] Stripe webhooks
- [x] entitlements
- [x] quotas
- [x] invoices UI

## API and integrations
- [ ] API keys
- [~] API v1 create/update/get
- [ ] webhook endpoints
- [ ] safety checks
- [x] custom domains

## Ops
- [~] CI/CD
- [~] staging deployment target
- [~] staging smoke workflow
- [x] structured logs
- [ ] metrics
- [ ] traces
- [ ] backups
- [ ] load tests
- [~] security review

## Docs and runbooks
- [x] local runbook
- [x] env/setup guide
- [x] smoke-test checklist
- [x] release checklist
- [x] known limitations

## Deployment foundation
- [x] runtime roles defined
- [x] runtime env template
- [x] runtime compose shape
- [x] operator deployment docs
- [x] local deployment rehearsal

## Production readiness
- [~] local + S3/R2 storage abstraction
- [x] queued render processing
- [x] queued scan-event processing
- [x] render/scan idempotency + retries
- [!] notification delivery/jobs
- [x] worker separation from API runtime

## Verification truth
- locally verified:
  - observed in this session for the product-finish pass: `pnpm.cmd build`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd --filter @qr/api test:integration`, and `pnpm.cmd test:dashboard:e2e`
  - exact product-finish browser flow observed green in this session: `register -> logout -> login -> create workspace -> create folder -> connect and verify custom domain -> create QR in the generator -> generator download SVG -> export JSON -> export CSV -> import CSV batch -> refresh restores session -> QR list search/sort -> QR details download PNG -> analytics -> billing free-limit block -> checkout return auto-refresh -> premium create unlocked -> duplicate from details -> archive -> delete -> profile update -> custom domain removal -> logout -> protected route returns to auth form`
  - observed in this session that the main product surfaces now use production-like copy and connected actions instead of starter shell text: auth, generator, dashboard list, QR details, analytics, billing, profile/settings, workspaces/folders, custom domains, import/export, and the public pricing page
  - observed in this session that dashboard and settings mutations now refresh workspace-scoped state after create/import/archive/delete/domain changes, and billing now auto-refreshes after checkout return instead of requiring a manual reload
  - observed in this session for the growth-features pass: `pnpm lint`, `pnpm --filter @qr/web build`, `pnpm --filter @qr/web typecheck`, `pnpm --filter @qr/api test:integration`, and `pnpm test:dashboard:e2e`
  - exact growth API flow observed green in this session: `register -> create workspace -> create folder -> attach custom domain -> verify custom domain -> create link QR in workspace/folder -> get QR with workspace/folder/customDomain metadata -> download PNG/SVG -> export workspace QR codes as JSON/CSV -> import QR codes from CSV -> list workspace QR codes -> resolve branded short-link host`
  - exact growth browser flow observed green in this session: `sign in -> create workspace -> create folder -> connect and verify custom domain -> create QR in generator -> dashboard list shows workspace/folder metadata -> export JSON -> import CSV -> list search/filter/sort -> details -> analytics -> billing workspace selector + free-plan limit block -> premium upgrade test-mode flow -> profile update -> duplicate -> archive -> delete -> logout`
  - observed in this session that the billing page now exposes a workspace selector and the generator, dashboard list, details page, settings custom-domain view, and bulk import/export flow all operate on live workspace-scoped API data
  - observed in this session for the security/resilience pass: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:dashboard:e2e`
  - exact security/resilience API flow observed green in this session: `unauthenticated /me -> logout invalidates bearer session -> unsafe QR payload with embedded credentials rejected -> unsafe avatar URL rejected -> billing success/cancel open-redirect rejected -> create QR -> corrupted PNG asset repaired on download -> render queue failure returns user-safe 503 with request ID -> invalid webhook signature rejected -> duplicate webhook delivery stays idempotent`
  - exact security/resilience browser flow still observed green in this session after the hardening changes: `sign in -> create QR -> list/details/download/analytics -> billing/test-mode flow -> quota block -> profile update -> duplicate -> archive -> delete -> logout`
  - observed in this session that API/runtime hardening now adds secret redaction in structured logs, safe 503 user messages, same-origin billing return URL enforcement, http/https-only URL validation without embedded credentials, public-scan redirect target validation, download self-repair for missing/corrupt locally stored QR assets, and inline fallbacks when aggregate/scan-event queue dispatch fails
  - observed in this session for the launch-readiness pass: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @qr/api test:integration`, and `pnpm test:dashboard:e2e`
  - exact support/readiness API flow observed green in this session: `request-id middleware -> sanitized 403 API error body with matching X-Request-Id -> friendly invalid public scan 404 HTML -> friendly inactive public scan 410 HTML -> full existing auth/QR/billing/reset/profile integration smoke`
  - exact support/readiness browser flow observed green in this session: `sign in -> empty QR list -> create link QR -> refresh restores session -> QR details -> analytics -> billing -> quota block surfaced without raw internals -> profile update -> duplicate -> archive -> delete -> logout -> protected route returns to auth form`
  - deploy-foundation prep also passed local verification in this session: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @qr/api test:integration`, `pnpm test:dashboard:e2e`, and a manual `pnpm.cmd --filter @qr/api health:worker` check against a live local worker process
  - repo-level operator docs added and checked into the tree in this session: [README.md](C:/Users/aziz0/Desktop/qr-platform-starter/README.md), [08_local_runbook.md](C:/Users/aziz0/Desktop/qr-platform-starter/specs/08_local_runbook.md), [09_env_setup_guide.md](C:/Users/aziz0/Desktop/qr-platform-starter/specs/09_env_setup_guide.md), [10_smoke_test_checklist.md](C:/Users/aziz0/Desktop/qr-platform-starter/specs/10_smoke_test_checklist.md), [11_release_checklist.md](C:/Users/aziz0/Desktop/qr-platform-starter/specs/11_release_checklist.md), and [12_known_limitations.md](C:/Users/aziz0/Desktop/qr-platform-starter/specs/12_known_limitations.md)
  - exact API billing/quota smoke observed green in deterministic test mode: `register -> login -> create QR -> render PNG/SVG -> download -> billing summary on free -> ads-off gate denied on free -> free QR limit denied at 3/3 -> checkout session creation -> signed webhook sync -> premium plan applied -> invoice synced -> premium ads-off QR allowed -> storage quota denied -> forgot/reset password -> profile update`
  - exact browser billing/product smoke observed green in deterministic test mode: `sign in -> empty QR list -> create link QR -> list/details/download/analytics -> billing page shows Free 3/3 -> free-limit create blocked -> checkout return -> signed webhook sync -> billing page shows Premium + invoice -> premium create unlocked -> profile update -> duplicate -> archive -> delete -> logout`
- CI-verified:
  - GitHub Actions run `ci #35` (`24416148656`) succeeded on commit `cf3540f227ed1b0169c190b4e3a712a991ef1e80`
  - passed jobs on `ci #35`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #35`: `verify-staging-smoke`, `verify-real-bucket`
  - observed `verify` step success on `ci #35` for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
  - exact growth API flow observed green on `ci #35`: `register -> create workspace -> create folder -> attach custom domain -> verify custom domain -> create link QR in workspace/folder -> get QR with workspace/folder/customDomain metadata -> download PNG/SVG -> export workspace QR codes as JSON/CSV -> import QR codes from CSV -> list workspace QR codes -> resolve branded short-link host`
  - exact growth browser flow observed green on `ci #35`: `sign in -> create workspace -> create folder -> connect and verify custom domain -> create QR in generator -> dashboard list shows workspace/folder metadata -> export JSON -> import CSV -> list search/filter/sort -> details -> analytics -> billing workspace selector + free-plan limit block -> premium upgrade test-mode flow -> profile update -> duplicate -> archive -> delete -> logout`
  - GitHub Actions run `ci #34` (`24401092755`) succeeded on commit `30ec499ea66fa1a77168b1d7f96ca7184a5d3577`
  - passed jobs on `ci #34`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #34`: `verify-real-bucket`, `verify-staging-smoke`
  - observed `verify` step success on `ci #34` for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
  - exact security/resilience API flow observed green on `ci #34`: `unauthenticated /me -> logout invalidates bearer session -> unsafe QR payload with embedded credentials rejected -> unsafe avatar URL rejected -> billing success/cancel open-redirect rejected -> create QR -> corrupted PNG asset repaired on download -> render queue failure returns user-safe 503 with request ID -> invalid webhook signature rejected -> duplicate webhook delivery stays idempotent`
  - exact security/resilience browser flow observed green on `ci #34`: `sign in -> create QR -> list/details/download/analytics -> billing/test-mode flow -> quota block -> profile update -> duplicate -> archive -> delete -> logout`
  - GitHub Actions run `ci #32` (`24387454663`) succeeded on commit `ba8695348054ea8c2cf376039f9d3582bcf0c6a0`
  - passed jobs on `ci #32`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #32`: `verify-real-bucket`, `verify-staging-smoke`
  - observed `verify` step success on `ci #32` for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
  - exact current-head CI product flow observed green on `ci #32`: `register -> login -> create QR -> render PNG/SVG -> download -> scan slug -> analytics update -> billing/test-mode gating -> forgot/reset password -> profile update -> sign in -> dashboard list/details/analytics/billing/profile -> duplicate -> archive -> delete -> logout`
  - GitHub Actions run `ci #31` (`24386920537`) succeeded on commit `3db607eaf18641f6e8c9764446fe418583bb8170`
  - passed jobs on `ci #31`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #31`: `verify-real-bucket`, `verify-staging-smoke`
  - observed `verify` step success on `ci #31` for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
  - exact launch-readiness CI flow observed green on `ci #31`: `request-id middleware -> sanitized API failures -> friendly public scan invalid/inactive states -> register -> login -> create QR -> render PNG/SVG -> download -> billing/test-mode flow -> profile update -> dashboard browser smoke`
  - GitHub Actions run `ci #29` (`24384899553`) succeeded on commit `15560cd378054e25dc353c8d279b651f860774e4`
  - passed jobs on `ci #29`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #29`: `verify-real-bucket`, `verify-staging-smoke`
  - observed `verify` step success on `ci #29` for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
  - exact API billing/quota flow observed green on `ci #29` in deterministic test mode: `register -> login -> create QR -> render PNG/SVG -> download -> billing summary on free -> ads-off gate denied on free -> free QR limit denied at 3/3 -> checkout session creation -> signed webhook sync -> premium plan applied -> invoice synced -> premium ads-off QR allowed -> storage quota denied -> forgot/reset password -> profile update`
  - exact browser billing/product flow observed green on `ci #29` in deterministic test mode: `sign in -> empty QR list -> create link QR -> list/details/download/analytics -> billing page shows Free 3/3 -> free-limit create blocked -> checkout return -> signed webhook sync -> billing page shows Premium + invoice -> premium create unlocked -> profile update -> duplicate -> archive -> delete -> logout`
  - GitHub Actions run `ci #28` (`24362078223`) succeeded on commit `e63c9ced7978fd2a338830c2c8523d04b2b27218`
  - passed jobs on `ci #28`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #28`: `verify-real-bucket`, `verify-staging-smoke`
  - observed `verify` step success on `ci #28` for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, and `Dashboard end-to-end smoke`
  - exact usable-product UI flow observed green on `ci #28`: `sign in -> empty QR list -> create link QR from generator -> QR appears in dashboard list -> refresh restores session -> QR details -> PNG download -> analytics -> profile update -> duplicate -> archive -> delete -> logout -> protected route returns to auth form`
  - GitHub Actions run `ci #26` (`24360011778`) succeeded on commit `a301422f3f32e25618509896f6c84bd4520f2774`
  - passed jobs on `ci #26`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #26`: `verify-staging-smoke`, `verify-real-bucket`
  - exact create-flow/dashboard smoke observed green on `ci #26`: `register -> login -> create link QR -> render PNG/SVG -> download -> truthful empty dashboard state -> generator create -> dashboard list row -> search/filter/sort -> QR details -> analytics -> profile/settings`
  - GitHub Actions run `ci #21` (`24332531431`) succeeded on commit `f4b44467fdce50ca8b05f1c949da7a92eec10447`
  - passed jobs: `verify`, `verify-bullmq-runtime`
  - `verify` observed green for `Build`, `Lint`, `Typecheck`, `Apply migrations`, `Seed database`, `API unit tests`, `API integration smoke`, `Install Playwright browser`, `Dashboard end-to-end smoke`
  - `verify-bullmq-runtime` observed green for `Apply migrations`, `Seed database`, and real Redis/BullMQ runtime verification
  - exact API/dashboard smoke flow observed green: `register -> login -> create QR -> render PNG/SVG -> download -> scan slug -> persist raw scan event -> update daily aggregate -> forgot/reset password -> update profile`, plus dashboard `QR list -> QR details -> analytics -> profile/settings`
  - exact BullMQ runtime flow observed green: queue-backed `create QR -> render job retry -> concurrent render dedupe -> scan-event job retry -> requestId idempotency -> aggregate job retry -> daily aggregate recompute`
  - GitHub Actions run `ci #24` (`24334027215`) succeeded on commit `ea02b7e3ae833f48bdc355edd1a9fe47f8f96c8e`
  - passed jobs on `ci #24`: `detect-optional-verifiers`, `verify`, `verify-bullmq-runtime`
  - observed skipped jobs on `ci #24`: `verify-real-bucket`, `verify-staging-smoke`
- locally deployment-rehearsed:
  - observed on this machine that `pnpm.cmd deploy:up` successfully booted the production-like runtime compose stack with `postgres`, `redis`, one-shot `migrate`, one-shot `seed`, `api`, `worker`, and `web`
  - observed on this machine that `migrate` applied `20260413000100_initial` and `20260413000200_scan_event_request_id_unique` successfully before app services started
  - observed on this machine that `seed` completed successfully and logged seeded demo data for `demo@qrflow.local`, workspace slug `demo-owner`, and QR slug `demo-link`
  - observed on this machine that `docker compose ... ps` reported healthy `postgres`, `redis`, `api`, `worker`, and `web` services after startup
  - observed on this machine that the runtime compose smoke succeeded via `API_URL=http://localhost:4000 APP_URL=http://localhost:3000 pnpm.cmd deploy:smoke`
  - exact runtime compose smoke flow observed green on this machine: `register -> login -> create QR -> render PNG/SVG -> download PNG/SVG -> scan slug -> analytics update -> profile update -> forgot-password request`
  - observed on this machine that runtime-local storage needed to be mounted and resolved at `/app/storage`, seed had to be part of the compose startup path, nested workspace `node_modules` and `.next` needed to be excluded from Docker context, and the smoke flow had to poll asset readiness while BullMQ workers finished async render jobs
- staging-verified:
  - none yet
  - staging deployment files, healthchecked compose services, manual workflow, and smoke script are prepared, but no staging URL and no observed staging smoke run were available in this session
  - GitHub Actions job `verify-staging-smoke` was observed as `skipped` on `ci #24` because the repository did not expose `STAGING_API_URL`, `STAGING_APP_URL`, and `STAGING_WORKSPACE_ID`
- real-bucket-verified:
  - none yet
  - the real-bucket smoke path now exists in `apps/api/src/integration/real-bucket.spec.ts` and the repository CI can attempt it through job `verify-real-bucket`
  - GitHub Actions job `verify-real-bucket` was observed as `skipped` on `ci #32`, `ci #31`, and `ci #24` because the repository did not expose the required `REAL_BUCKET_STORAGE_DRIVER` variable and live S3/R2 secrets together
- MVP-only or not yet live-verified beyond CI:
  - the new deploy foundation in `deploy/runtime/` is prepared in-repo and CI-compatible, but it is not staging-verified or hosting-verified
  - remote S3/R2 object storage lifecycle, signed-download redirects, and orphan cleanup against a live bucket
  - orphan cleanup as an operator-run maintenance task instead of scheduled retention automation
  - dedicated deployed worker container/process observed in staging
  - forgot/reset password in a production-like staging environment with real email delivery or a smoke mailbox
  - metrics, traces, dead-letter handling, notification jobs, backup strategy, and security review
- top remaining production blockers:
  - no observed staging deployment yet for `web`, `api`, `worker`, `postgres`, `redis`, and storage together
  - no observed S3/R2 verification yet for upload/download/render lifecycle, signed URL policy, or orphan cleanup against a real bucket
  - the repo still needs real staging variables and real bucket secrets configured before GitHub Actions can move those optional jobs from `skipped` to observed execution
  - the current runtime compose rehearsal is observed only on local Docker Desktop with local-volume storage; it is not yet staging-verified or hosting-verified
  - billing is now verified only in deterministic mock/test mode; a live Stripe test account, hosted checkout, and externally delivered webhook run are still unobserved
  - production-only private-host blocking for redirect/avatar-style URLs is coded behind `NODE_ENV=production` or `ALLOW_PRIVATE_TARGET_URLS=false`, but that exact branch is not yet observed in a deployed environment

## Billing gaps
- live Stripe test-mode checkout and webhook delivery against Stripe-hosted infrastructure are still unverified; current billing truth uses the deterministic mock Stripe-compatible mode
- downgrade scheduling, proration, failed-payment recovery, and cancel-at-period-end UX are not yet covered by browser smoke
- enterprise plan handling and non-self-serve sales flow are still placeholders
- quota coverage is currently observed for `ads off`, QR-count limits, and storage limits only; API-access quotas and retention enforcement remain incomplete

## UI shipped vs backend-capable
- shipped in UI: sign in, registration, session restore across refresh, logout, generator create flow, QR list, QR details, analytics, profile/settings, pricing overview, QR management actions (`download`, `duplicate`, `archive`, `delete`), workspace creation/selection, folder creation/filtering, custom-domain connect/verify/remove management, bulk QR import/export, billing page with workspace-scoped plan summary/quota usage/invoice history, and upgrade/downgrade entry points in deterministic test mode
- backend-capable only: Google OAuth, API keys, webhooks
- intentionally not started in UI: notification rules, billing polish beyond current deterministic test-mode flow, and visual polish

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
- 2026-04-14: local deployment rehearsal now succeeds on this machine through `pnpm.cmd deploy:up` with Docker Desktop, runtime compose healthchecks, one-shot `migrate` + `seed`, separate `api` and `worker` roles, and `pnpm.cmd deploy:smoke` against the composed stack
- 2026-04-14: workspaces, folders, custom domains, and workspace-scoped bulk QR import/export are now implemented in the API and dashboard UI; `openapi/openapi.yaml` was extended to cover the shipped workspace endpoints and QR response metadata
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
- 2026-04-13: observed locally in this session with `pnpm.cmd build`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, and `pnpm.cmd test:dashboard:e2e` that the usable-product UI flow now works on live web+api servers: `sign in -> empty QR list -> create link QR from generator -> QR appears in dashboard list -> refresh restores session -> QR details -> PNG download -> analytics -> profile update -> duplicate -> archive -> delete -> logout -> protected route returns to auth form`
- 2026-04-13: `scripts/run-dashboard-e2e.mjs` now truthfully refuses occupied test ports and supports Windows process spawning, so local dashboard smoke no longer piggybacks on stale listeners or fails before browser startup
- 2026-04-14: launch-readiness pass added a shared API bootstrap helper so runtime middleware/filter behavior now matches integration tests, including request IDs, sanitized API errors, CORS, global validation, and public-route exclusions
- 2026-04-14: launch-readiness pass improved support/admin readiness with request IDs on API failures, friendlier user-facing error copy in the web app, no internal stack details in UI responses, and public invalid/inactive/password/rate-limited scan pages that render product-facing HTML states instead of raw failures
- 2026-04-14: launch-readiness pass added repo-level operator docs for local setup, verification, release checks, and known limitations under `specs/08_*` through `specs/12_*` plus README links
- 2026-04-14: observed locally in this session with `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @qr/api test:integration`, and `pnpm test:dashboard:e2e` that the support/readiness improvements hold on live app runs, including sanitized 4xx API responses with `X-Request-Id`, friendly invalid public scan 404 HTML, friendly inactive public scan 410 HTML, and the existing usable dashboard/billing browser flow
