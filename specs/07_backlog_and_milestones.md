# 07 — Backlog and milestones

## Phase 0 — Discovery and repo bootstrap
Outcome:
- repo scaffold
- shared tooling
- status tracker
- architecture and contracts frozen

Tasks:
- scaffold pnpm monorepo
- add Next.js app
- add NestJS app
- add Prisma
- add lint/test config
- add Docker Compose
- wire env loading
- create seed strategy

Estimate: 80–140 hours

## Phase 1 — Auth, workspace, folders
Outcome:
- login/register/google auth
- dashboard shell
- workspace and folder CRUD
- sharing basics

Tasks:
- user schema + migrations
- session/auth flows
- workspace/member model
- folder tree
- share invites
- audit logs

Estimate: 240–340 hours

## Phase 2 — QR generator MVP
Outcome:
- 15–20 QR types
- create/edit/delete
- preview
- PNG/SVG export
- saved templates

Tasks:
- content schemas
- generator UI
- render service
- object storage
- downloads
- scanability guard
- QR list/details page

Estimate: 380–520 hours

## Phase 3 — Scan service and analytics
Outcome:
- short-link redirect
- inactive/password states
- raw events
- daily aggregates
- analytics dashboard

Tasks:
- slug resolver
- Redis cache
- queue events
- aggregator worker
- analytics charts
- retention job

Estimate: 260–360 hours

## Phase 4 — Billing and quotas
Outcome:
- free/lite/premium
- Stripe checkout and portal
- feature gates
- invoice list

Tasks:
- entitlements service
- Stripe webhooks
- quota counters
- pricing page
- usage UI

Estimate: 160–260 hours

## Phase 5 — API v1 and webhooks
Outcome:
- public API for create/update/get
- API keys
- rate limits
- outbound webhooks

Tasks:
- API auth by key
- OpenAPI alignment
- docs page
- webhook retries
- usage metering

Estimate: 160–240 hours

## Phase 6 — Hardening
Outcome:
- production readiness

Tasks:
- observability
- load tests
- security pass
- backup scripts/runbook
- CI/CD polish

Estimate: 160–240 hours

## Differentiator backlog

### P0
- redirect rules by country/language/device/time
- scan event webhooks
- link/file safety checks
- white-label custom domains and branded landings

### P1
- landing page builder per QR
- template marketplace
- campaign analytics
- org RBAC and audit trail
- CSV / Sheets bulk import/export

### P2
- printable sheet packs
- smart error-correction auto-tuning
- consent mode for scan landings

## Definition of done for each feature
- schema finalized
- API contract added
- UI implemented
- tests added
- telemetry added
- docs updated
- implementation status updated
