# 00 — Product overview

## Product name placeholder

Use working name `qrflow` until branding is defined.

## Goal

Build a scalable QR platform with:
- dynamic and static QR generation
- deep design customization
- downloadable print-ready assets
- short-link routing for dynamic codes
- analytics and notifications
- plans, API access, and team collaboration

## Clean-room position

This product should aim for functional parity with a leading QR platform, not a literal clone. The original analysis explicitly warns that exact copying creates legal and product risk; the safer target is parity in scenarios plus differentiated UX, integrations, and analytics.

## Marketable value proposition

- faster scan delivery
- cleaner UX than ad-heavy free products
- stronger B2B analytics
- team collaboration
- brand-safe and white-label options
- extensible API and webhooks

## Business model

### Free
- limited number of active QR codes
- dynamic QR allowed with limited analytics retention
- scan landing may include internal upgrade prompt
- storage quota: 100 MB
- analytics retention: 12 months
- no API access
- limited notifications

### Lite
- no third-party ads on scans
- more active QRs
- storage quota: 500 MB
- analytics retention: 36 months
- custom domains
- folders and sharing
- email notifications

### Premium
- all Lite features
- API access
- webhook events
- white-label options
- advanced analytics
- higher quotas and team features

## Product scope

### MVP
- 15–20 QR types
- PNG + SVG export
- dashboard
- folders
- basic analytics
- Stripe billing
- email notifications
- API v1

### Full parity / v2+
- 47 types
- PDF/JPG/EPS
- custom domains
- webhooks
- bulk import/export
- advanced analytics
- templates marketplace
- organization RBAC
- landing page builder

## Initial QR content types

### MVP P0
1. link
2. text
3. phone
4. sms
5. email
6. wifi
7. vcard
8. geo
9. event
10. file
11. image
12. pdf
13. app-store / deep-link
14. whatsapp
15. telegram
16. menu / catalog pdf
17. coupon / promo
18. social profile

### Later
- payments
- crypto wallet
- feedback form
- multi-link mini-page
- reviews
- restaurant menu builder
- calendar invite variants
- survey / lead form

## Core product principles

1. Dynamic QR uses short URL on our domain.
2. QR image must remain stable while target/content can change.
3. Scan path is separated from management path.
4. Design power cannot break scanability without warnings.
5. Raw scan logs and aggregates have separate lifecycles.
6. Every plan feature must map to a quota or gate.
7. White-label and analytics are the strongest B2B upsell.

## Differentiators to prioritize

The source analysis says simple “more QR types” will not differentiate, because the reference platform already has bulk generation, notifications, custom domains, folders, sharing, and GA UTM. Prioritize:
- redirect rules by country/language/device/time
- scan-event webhooks and CRM integrations
- link/file safety scanning
- branded domains and landing pages
- campaign analytics
- org RBAC and audit trail

## Success metrics

### Product
- activation rate: created + downloaded first QR
- successful open rate after scan
- day-7 return to dashboard
- free-to-paid conversion
- share of QRs with at least one repeat edit

### Technical
- scan redirect p95 latency
- scan event drop rate
- aggregate freshness lag
- export render error rate
- infra cost per 1,000 scans
