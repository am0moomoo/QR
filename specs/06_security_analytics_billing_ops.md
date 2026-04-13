# 06 — Security, analytics, billing, operations

## Security

### Upload security
- allowlist mime types
- size limits by plan and type
- strip EXIF
- reject zip bombs / decompression bombs
- antivirus or malware scan hook for uploaded files

### Redirect safety
- validate target URLs
- optional denylist / reputation scan
- prevent open redirect abuse through malformed payloads

### Abuse controls
- auth rate limits
- API rate limits
- scan rate limits
- bot heuristics for scan spam
- moderation pipeline for malicious content

### Secrets
- never store API keys in plaintext
- hash user-visible API keys
- rotate webhook secrets
- use separate env vars per app and per environment

## Privacy and compliance

The source analysis highlights that scan analytics imply collection of scanner data like IP, timestamp, UA, language, network, and approximate geolocation. Treat this seriously.

### Requirements
- privacy policy and scan privacy policy
- controller/processor model defined
- configurable IP anonymization
- retention jobs for raw events
- user deletion workflow
- export/delete subject request workflow for enterprise tiers
- consent mode when scan landing includes analytics or ads cookies

## Analytics model

### Raw event fields
- qrCodeId
- scannedAt
- ipHash
- userAgent
- deviceType
- os
- browser
- language
- country / region / city
- referrer
- utm
- outcome
- openedOk

### Aggregate dimensions
- day
- scans
- unique scans
- devices
- browsers
- OS
- countries
- referrers
- campaign params

### Dashboard KPIs
- total scans
- unique scans
- successful opens
- last scan time
- top country
- top device type

## Billing and entitlements

### Stripe events to support
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed

### Entitlement checks
- API access
- custom domains
- storage quota
- analytics retention
- team seats
- number of webhooks
- ads disabled

### Billing rules
- webhook is source of truth
- idempotency required
- keep billing ledger and audit logs
- do not unlock premium from frontend redirect alone

## CI/CD

### Minimum pipelines
- install
- lint
- typecheck
- test
- prisma validate
- openapi lint
- build web
- build api

### Deployment lanes
- dev
- staging
- prod

### Release checks
- migrations forward tested
- rollback plan
- smoke tests for:
  - login
  - create QR
  - render asset
  - scan redirect
  - analytics visible
  - upgrade billing

## Observability

### Metrics
- scan latency
- API latency
- render queue depth
- render failure rate
- webhook failure rate
- aggregate lag
- storage growth
- scan outcome distribution

### Logging
- structured JSON logs
- request IDs
- separate scan log channel
- security event channel

### Tracing
- OpenTelemetry recommended
- propagate request IDs from edge through scan service to workers

## Backup and recovery

- daily logical DB backup
- PITR on managed PostgreSQL
- object storage versioning if cost allows
- restore drill every quarter

## Cost notes

The source analysis warns that cost can jump with scan traffic, egress, and event storage. Track:
- storage bytes
- CDN egress
- render compute minutes
- queue volume
- DB IOPS
