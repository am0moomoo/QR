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
pnpm dev
```

## Expected local URLs

- web: `http://localhost:3000`
- api: `http://localhost:4000`
- swagger: `http://localhost:4000/api`
- pgadmin/redis commander are not included; keep infra minimal.

## Implementation rule

Use `prompts/codex-master-prompt.md` first, then phase prompts one by one. Keep `specs/implementation-status.md` updated after each meaningful block of work.

## Important

Do not try to reproduce trademarked branding, exact copy text, or visual assets from the analyzed platform. Build original UX on equivalent product requirements.
