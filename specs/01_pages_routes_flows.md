# 01 — Pages, routes, flows

## Route map

### Public marketing
- `/` — home
- `/pricing`
- `/features`
- `/integrations`
- `/blog`
- `/docs`
- `/login`
- `/register`
- `/forgot-password`

### Generator
- `/qr-code-generator` — type catalog
- `/qr-code-generator/[type]` — type-specific form
- `/qr-code-generator/[type]/design` — design editor
- `/qr-code-generator/[id]/download` — export/download page

### Dashboard
- `/dashboard`
- `/dashboard/qr-codes`
- `/dashboard/qr-codes/[id]`
- `/dashboard/analytics`
- `/dashboard/folders`
- `/dashboard/templates`
- `/dashboard/api`
- `/dashboard/billing`
- `/dashboard/settings`
- `/dashboard/workspace`
- `/dashboard/custom-domains`
- `/dashboard/notifications`

### Public scan path
- `/r/[slug]` — dynamic QR redirect/landing endpoint
- `/inactive` — inactive or expired QR page
- `/password/[slug]` — password gate
- `/landing/[slug]` — landing page rendering for content types that need an HTML view

### API / docs
- `/api/reference`
- `/api/v1/...`

## User roles

### Guest
- browse marketing
- open generator
- create limited QR
- download QR
- limited save/persistence
- cannot manage team or advanced analytics

### Registered user
- manage QRs
- edit content without changing QR image
- folders
- analytics
- settings
- notifications

### Premium user
- API
- no scan ads
- higher quotas
- custom domains
- advanced analytics
- webhooks

## Key user flows

## Flow A — Create QR
1. Visit generator catalog
2. Choose type
3. Fill content-specific form
4. Generate preview
5. Customize frame, pattern, colors, logo, template
6. Validate scanability
7. Download PNG/SVG
8. Optionally save to account

### Acceptance criteria
- each type has its own form schema
- preview updates under 500 ms for simple changes
- invalid content blocks generation
- scanability guard appears on destructive design changes
- download links resolve to generated assets

## Flow B — Dynamic edit without changing QR image
1. User opens QR details
2. Edits target/content
3. Saves changes
4. Existing short slug stays unchanged
5. Subsequent scans resolve to new content

### Acceptance criteria
- slug remains stable
- QR image checksum remains stable unless design changes
- version history logs content update

## Flow C — Scan and redirect
1. Scanner hits `/r/{slug}`
2. system resolves slug
3. checks status, expiry, password, rules
4. emits event asynchronously
5. returns redirect or landing page
6. owner sees analytics later

### Acceptance criteria
- inactive QR returns clear inactive screen
- one-time QR deactivates after first successful open when configured
- redirect path does not wait for aggregate updates

## Flow D — Folder share
1. Owner creates folder
2. Invites user by email
3. Assigns role: view or edit
4. Invitee accepts
5. Shared QRs appear in invitee workspace

### Acceptance criteria
- viewers cannot delete
- editors can edit but not transfer ownership
- all share actions create audit log entries

## Flow E — Billing upgrade
1. User opens pricing or billing settings
2. Starts Stripe checkout
3. webhook confirms subscription
4. features and quotas unlock
5. downgrade or cancel handled through portal or internal page

### Acceptance criteria
- billing state driven by webhook, not redirect alone
- feature gates update idempotently
- invoices visible in dashboard

## Page-level requirements

## Home
Components:
- hero
- value grid
- 3-step explanation
- type carousel or catalog teaser
- feature highlights
- FAQ
- CTA strip
- cookie consent

## Type catalog
Components:
- search
- filters
- type cards
- “popular” grouping
- comparison table or use-case hints

## Type page
Components:
- breadcrumbs
- content form
- sample preview
- contextual help
- sticky generate CTA

## Design editor
Components:
- live preview
- frame selector
- shape editor
- color controls
- logo upload
- saved templates
- scanability warnings
- export panel

## QR list
Components:
- table/grid toggle
- search
- filters by type/status/folder
- sort by created/updated/last scan
- bulk actions

## QR details
Components:
- summary header
- editable content
- design tab
- downloads tab
- analytics tab
- rules tab
- notifications tab
- API info
- audit trail summary

## Analytics
Components:
- date range picker
- KPI cards
- time series
- geography
- device/browser/OS splits
- top referrers
- success vs failed opens
- campaign dimensions
- CSV export

## Inactive page
Components:
- inactive message
- owner CTA to dashboard
- generic viewer-safe copy
- support contact link

## Error states
- not found
- password required
- expired
- blocked for abuse
- render failed
- quota exceeded
- unsupported file

## Localization
Must support at least:
- EN
- RU
Later: add locale packs and route localization.
