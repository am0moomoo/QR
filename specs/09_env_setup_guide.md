# Environment Setup Guide

## Required local environment flow

1. Copy `.env.example` to `.env`
2. Keep local values deterministic unless you are explicitly testing another provider
3. Regenerate Prisma client after schema changes with `pnpm db:generate`

## Core application variables

- `API_URL`
- `APP_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_URL`
- `JWT_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `SHORT_DOMAIN`

## Local/default provider choices

- Storage: `STORAGE_DRIVER=local`
- Queue runtime for normal app/dashboard smoke: `QUEUE_DRIVER=inline`
- Billing verification in current local and CI truth: deterministic Stripe-compatible mock mode
  - `STRIPE_SECRET_KEY=sk_test_mock`
  - `STRIPE_WEBHOOK_SECRET=whsec_mock`
  - `STRIPE_PRICE_LITE=price_lite_test`
  - `STRIPE_PRICE_PREMIUM=price_premium_test`

## When to change provider settings

- Switch `QUEUE_DRIVER=bullmq` only when you are intentionally verifying queue runtime
- Switch `STORAGE_DRIVER=s3` or `r2` only when you have real bucket credentials and are verifying object storage behavior
- Switch Stripe values away from mock only when you are intentionally testing live Stripe-hosted test mode

## Notes for developers

- Keep any new environment variable documented in `.env.example`
- Keep current product truth explicit in `specs/implementation-status.md`
- Do not mark a provider path as verified unless it was actually exercised
