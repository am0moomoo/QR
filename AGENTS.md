# AGENTS.md

You are working inside a clean-room repo for a dynamic QR platform.

## Mission

Build a production-oriented web platform that is functionally comparable to a modern QR platform:
- create static and dynamic QR codes
- customize design
- download assets
- manage QR codes in a dashboard
- handle scans through short links
- collect analytics
- support plans, billing, teams, folders, and API access

Do not recreate any third-party brand, copyrighted marketing copy, screenshot-level UI, asset pack, or exact visual identity.

## Product rules

1. Functional parity is allowed; exact imitation is not.
2. Prefer better UX where the original appears weak.
3. Keep scan-path latency low and separate it from dashboard CRUD.
4. Dynamic QR must route through our short domain.
5. Analytics raw events and aggregates must be split.
6. Privacy defaults must be conservative.
7. Every major feature must ship with tests and telemetry.

## Stack and standards

- Web: Next.js, TypeScript, App Router
- API: NestJS, TypeScript
- ORM: Prisma
- DB: PostgreSQL
- Cache/queues: Redis + BullMQ
- Validation: Zod on web, class-validator or Zod on API boundary
- API style: REST first
- Auth: email/password + Google OAuth
- Billing: Stripe subscriptions + webhook handling
- Storage: S3-compatible object storage
- Observability: structured logs, metrics, traces
- Testing: unit + integration + e2e for critical flows

## Repo conventions

- Keep all env names in `.env.example`
- Keep API contracts in `openapi/openapi.yaml`
- Keep DB truth in `prisma/schema.prisma`
- Keep status in `specs/implementation-status.md`
- Keep feature docs under `specs/`
- Use conventional commits in generated PRs/commits if supported

## Implementation order

1. Scaffold monorepo and developer tooling
2. Implement Prisma schema and migrations
3. Implement auth, users, workspaces, folders
4. Implement QR CRUD + render service + downloads
5. Implement short-link scan service and event pipeline
6. Implement analytics pages and aggregations
7. Implement billing, quotas, and premium gates
8. Implement API keys, public API, webhooks
9. Harden security, rate limits, observability, CI/CD

## Quality gates

Before marking any phase complete:
- lint passes
- typecheck passes
- tests pass
- migrations run cleanly
- seed data works
- OpenAPI matches controllers
- implementation status updated

## Performance guardrails

- Scan redirect p95 target: under 300 ms, with edge/cache target under 100 ms when cached
- Dashboard pages should use pagination and indexed queries
- Rendering heavy exports must run async or be cached
- Never block scan redirects on non-essential writes

## Security guardrails

- Hash passwords with Argon2 or bcrypt with safe cost
- Use signed URLs for private assets where applicable
- Strip EXIF from uploads
- Validate redirect targets
- Prevent SSRF through URL previews or file ingestion
- Enforce rate limiting on auth, API, and scan routes
- Never log secrets or raw payment payloads

## Deliverable style

When implementing:
- create small, reviewable commits
- note assumptions explicitly
- flag any unresolved ambiguity
- propose safer alternatives when a requirement creates legal or privacy risk
