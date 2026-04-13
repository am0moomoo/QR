# 04 — API contracts

Base path: `/api/v1`

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/oauth/google`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /me`

## Workspaces and folders
- `GET /workspaces`
- `POST /workspaces`
- `GET /workspaces/:id`
- `PATCH /workspaces/:id`
- `GET /folders`
- `POST /folders`
- `PATCH /folders/:id`
- `DELETE /folders/:id`
- `POST /folders/:id/shares`
- `PATCH /folder-shares/:id`
- `DELETE /folder-shares/:id`

## QR codes
- `GET /qr-codes`
- `POST /qr-codes`
- `GET /qr-codes/:id`
- `PATCH /qr-codes/:id`
- `DELETE /qr-codes/:id`
- `POST /qr-codes/:id/duplicate`
- `POST /qr-codes/:id/activate`
- `POST /qr-codes/:id/deactivate`
- `POST /qr-codes/:id/archive`
- `POST /qr-codes/:id/render`
- `GET /qr-codes/:id/downloads`
- `POST /qr-codes/:id/notifications`
- `POST /qr-codes/:id/redirect-rules`
- `POST /qr-codes/:id/safety-check`

## Templates
- `GET /templates`
- `POST /templates`
- `PATCH /templates/:id`
- `DELETE /templates/:id`

## Analytics
- `GET /analytics/summary`
- `GET /analytics/qr-codes/:id/timeseries`
- `GET /analytics/qr-codes/:id/dimensions`
- `GET /analytics/qr-codes/:id/export`

## Billing
- `GET /billing/summary`
- `POST /billing/checkout-session`
- `POST /billing/portal-session`
- `POST /billing/webhooks/stripe`

## API keys and webhooks
- `GET /api-keys`
- `POST /api-keys`
- `POST /api-keys/:id/rotate`
- `DELETE /api-keys/:id`
- `GET /webhooks`
- `POST /webhooks`
- `PATCH /webhooks/:id`
- `DELETE /webhooks/:id`

## Custom domains
- `GET /custom-domains`
- `POST /custom-domains`
- `POST /custom-domains/:id/verify`
- `DELETE /custom-domains/:id`

## Public scan endpoints
- `GET /public/r/:slug`
- `POST /public/r/:slug/password`
- `GET /public/inactive`
- `GET /public/landing/:slug`

## Canonical create request

```json
{
  "workspaceId": "uuid",
  "folderId": "uuid | null",
  "title": "Summer promo",
  "type": "link",
  "content": {
    "link": "https://example.com/campaign"
  },
  "design": {
    "sizePx": 512,
    "pattern": "square",
    "patternColor": "#111111",
    "backgroundColor": "#ffffff",
    "cornersInner": "square",
    "cornersInnerColor": "#111111",
    "cornersOuter": "square",
    "cornersOuterColor": "#111111",
    "logoAssetId": null,
    "logoHideBg": true,
    "errorCorrection": "M",
    "quietZoneModules": 4
  },
  "settings": {
    "adsEnabled": true,
    "doNotIndex": false,
    "password": null,
    "isOneTime": false,
    "maxScans": null,
    "expiresAt": null
  },
  "exports": ["png", "svg"]
}
```

## Canonical create response

```json
{
  "id": "uuid",
  "slug": "a1B2c3D4",
  "shortUrl": "https://qrflow.app/r/a1B2c3D4",
  "status": "ACTIVE",
  "downloads": [
    {
      "format": "PNG",
      "url": "https://cdn.example.com/..."
    },
    {
      "format": "SVG",
      "url": "https://cdn.example.com/..."
    }
  ]
}
```

## Notes

- Keep create/update payload shape stable across QR types.
- Type-specific content goes only into `content`.
- Validation is schema-driven by `type`.
- Public scan endpoint must be safe to cache for slug resolution but not for per-request event writes.
