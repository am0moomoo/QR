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
- [~] raw scan events
- [~] daily aggregates
- [ ] analytics dashboard
- [ ] CSV export
- [ ] retention jobs

## Billing
- [ ] plans
- [ ] Stripe checkout
- [ ] Stripe webhooks
- [ ] entitlements
- [ ] quotas
- [ ] invoices UI

## API and integrations
- [ ] API keys
- [ ] API v1 create/update/get
- [ ] webhook endpoints
- [ ] safety checks
- [ ] custom domains

## Ops
- [~] CI/CD
- [ ] structured logs
- [ ] metrics
- [ ] traces
- [ ] backups
- [ ] load tests
- [ ] security review

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
- 2026-04-13: CI configuration is present but not yet observed passing from this session; the workflow was authored here, but GitHub Actions itself was not executed locally
- 2026-04-13: verified blocker in this session: Docker is not installed, and `localhost:5432` / `localhost:6379` are closed, so `docker compose up`, `prisma migrate deploy`, Redis verification, seed execution, and true end-to-end integration runs remain blocked on local infrastructure
