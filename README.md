# QR Platform Starter

This is a codex-ready starter repo for a QR platform functionally comparable to the analyzed reference product, but intentionally built as a clean-room analogue.

## Included

- full spec pack in `specs/`
- codex task prompts in `prompts/`
- Prisma schema in `prisma/schema.prisma`
- OpenAPI draft in `openapi/openapi.yaml`
- starter monorepo:
  - `apps/web` — Next.js marketing site + generator + dashboard shell
  - `apps/api` — NestJS API shell
  - `packages/ui` — shared UI primitives
  - `packages/types` — shared types

## Quick start

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

## Expected local URLs

- web: `http://localhost:3000`
- api: `http://localhost:4000`
- swagger: `http://localhost:4000/api`
- pgadmin/redis commander are not included; keep infra minimal.

## Implementation rule

Use `prompts/codex-master-prompt.md` first, then phase prompts one by one. Keep `specs/implementation-status.md` updated after each meaningful block of work.

## Product runbooks

- Local runbook: `specs/08_local_runbook.md`
- Environment setup guide: `specs/09_env_setup_guide.md`
- Smoke checklist: `specs/10_smoke_test_checklist.md`
- Release checklist: `specs/11_release_checklist.md`
- Known limitations: `specs/12_known_limitations.md`
- Runtime deployment foundation: `deploy/runtime/README.md`

## Core verification commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm --filter @qr/api test:integration
pnpm test:dashboard:e2e
```

## Important

Do not try to reproduce trademarked branding, exact copy text, or visual assets from the analyzed platform. Build original UX on equivalent product requirements.
