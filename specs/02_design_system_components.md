# 02 — Design system and component inventory

## Principles

- Keep visual design original.
- Prefer clarity over ornament.
- All design controls must preserve scanability.
- Use a predictable dashboard pattern.

## Global components

### Header
- logo
- nav links
- locale switcher
- auth controls
- primary CTA

### Footer
- legal
- docs
- pricing
- integrations
- support
- social links

### Cookie consent
Categories:
- strict
- analytics
- functional
- ads

## Generator components

### TypePicker
- card grid
- icon
- title
- short description
- popular badge
- search keywords

### ContentForm
Type-dependent dynamic form fed by schema.

Required features:
- server-safe validation
- client-side inline validation
- default examples
- conditional fields
- auto-save draft for logged-in users

### QRPreview
- live preview canvas/svg
- size toggle
- dark/light background preview
- print preview checker

### DesignEditor
Subcomponents:
- `FrameSelector`
- `ShapeAndColorEditor`
- `CornerStyleEditor`
- `LogoUploader`
- `TemplateSelector`
- `QuietZoneIndicator`
- `ErrorCorrectionSelector` with smart default
- `ScanabilityGuard`

### DownloadPanel
- format selector: png, svg, pdf, jpg, eps
- size selector
- resolution selector
- transparent background toggle where applicable
- download CTA
- save template CTA

## Dashboard components

### QRListTable
- pagination
- search
- filters
- bulk selection
- row quick actions

### FolderTree
- nested or flat folders
- share modal
- move QR action

### QRDetailsDrawer or page
- status chips
- content summary
- domain
- slug
- UTM
- password protected flag
- one-time flag
- expiry flag
- copy short URL action

### AnalyticsDashboard
- KPI cards
- charts
- dimensions
- compare period
- export

### NotificationRules
- email after each scan
- digest
- webhook
- push placeholder for later

### BillingSettings
- current plan
- quota usage
- invoices
- upgrade/downgrade
- cancel subscription

### APIKeyManager
- create key
- rotate key
- revoke key
- masked display
- scopes

## Accessibility

- keyboard navigable controls
- AA contrast minimum
- chart tables fallback
- locale-aware formatting
- form labels and errors announced for screen readers

## UX rules Codex must preserve

1. Never silently break scanability.
2. Never bury download action after generation.
3. Keep design controls grouped by outcome, not by internal implementation.
4. Show upgrade prompts only when a feature is genuinely gated.
5. Analytics should degrade gracefully when data is sparse.
