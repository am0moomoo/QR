# 03 — Domain model and Prisma notes

## Core modeling decisions

1. `QRCode` is the root aggregate.
2. `QRContent` stores type-specific JSON payload.
3. `QRDesign` stores rendering options independent from content.
4. `QRAsset` stores generated downloads and uploaded logos/files.
5. `ScanEvent` is raw event data.
6. `ScanAggregateDaily` is dashboard-friendly summarized data.
7. `Folder`, `FolderShare`, `Workspace`, and `WorkspaceMember` support collaboration.
8. `Subscription`, `Invoice`, `ApiKey`, `CustomDomain`, and `NotificationRule` support monetization and enterprise use.

## Why JSON payload for content

The source analysis recommends avoiding 47 separate tables for 47 QR types. Use a stable core entity plus type-specific JSON payload validated by schema. This keeps CRUD uniform and makes it easier to add types later.

## Core enums

- plan: free, lite, premium, enterprise
- qr status: active, inactive, archived, deleted
- folder role: view, edit
- workspace role: owner, admin, editor, viewer
- asset kind: qr_image, logo, uploaded_file, template_preview
- export format: png, svg, pdf, jpg, eps
- notification kind: email, webhook, push
- redirect outcome: redirected, landed, blocked, inactive, expired, password_required

## Retention policy

Raw and aggregate data are separate.

Suggested defaults:
- free raw scan events: 12 months
- paid raw scan events: 36 months
- aggregates: while QR exists unless user requests deletion
- IP anonymization job: configurable by region

## Quota model

Track at least:
- active QR count
- storage bytes
- monthly scans
- monthly API calls
- custom domains
- webhook endpoints
- team seats

## Content schemas

Create one JSON schema per QR type under future path:
`packages/types/src/qr-schemas/*`

Examples:
- link
- wifi
- vcard
- file
- event

## Prisma work items

- keep composite indexes on dashboard-heavy queries
- add unique constraints for slug, api key prefix, custom domains
- use soft delete where analytics retention matters
- add audit log table for compliance-sensitive mutations
