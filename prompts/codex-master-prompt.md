Read:
- `AGENTS.md`
- `README.md`
- everything under `specs/`
- `prisma/schema.prisma`
- `openapi/openapi.yaml`

Goal:
Build a clean-room QR platform MVP with strong foundations for scale. Do not copy any third-party brand, text, images, or exact design. Preserve only functional intent.

Execution rules:
1. Start by scaffolding the monorepo:
   - `apps/web` as Next.js
   - `apps/api` as NestJS
   - shared packages for UI/config/types
2. Implement Prisma and generate the initial migration from `prisma/schema.prisma`.
3. Implement auth, workspaces, folders, and sharing first.
4. Then implement QR CRUD, content schemas, render pipeline, and downloads.
5. Then implement the public scan path and analytics pipeline.
6. Then Stripe billing, quotas, API keys, and webhooks.
7. Keep all work incremental and test-backed.
8. Update `specs/implementation-status.md` after every major phase.

Non-negotiables:
- keep scan route fast
- keep raw events async
- protect privacy defaults
- add rate limiting
- keep API contracts aligned with `openapi/openapi.yaml`

Deliverables expected from you:
- scaffolded apps
- working local dev via Docker for db/redis
- migrations
- basic seed data
- tests for critical flows
- updated docs and status file
