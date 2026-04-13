# Repo setup

## Local infra

Use the included `docker-compose.yml` for:

- PostgreSQL
- Redis

## Suggested next implementation order

1. Wire Prisma to the API app.
2. Implement auth and session model.
3. Add QR CRUD service with typed validators.
4. Add render job pipeline and storage adapter.
5. Split scan service from core API when traffic justifies it.
6. Add Stripe subscriptions and feature flags.
7. Add analytics aggregation jobs and dashboard queries.
