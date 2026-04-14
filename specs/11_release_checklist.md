# Release Checklist

## Before merge

- Build passes locally
- Lint passes locally
- Typecheck passes locally
- API integration smoke passes locally
- Dashboard browser smoke passes locally
- `specs/implementation-status.md` reflects only observed truth

## Before tagging a release

- Confirm the latest GitHub Actions `ci` run is green on the release commit
- Confirm migrations are committed and deployable
- Confirm `.env.example` is current
- Confirm OpenAPI and Prisma schema match implementation
- Confirm runbooks and smoke checklist still match the current product

## Operator handoff

- Share the release commit SHA
- Share the latest green CI run URL
- Call out any intentionally unverified provider paths
- Call out any customer-visible limitations still in effect

## Do not claim at release time unless observed

- Live Stripe-hosted billing
- Real S3/R2 bucket verification
- Staging verification
- Hosted worker separation
