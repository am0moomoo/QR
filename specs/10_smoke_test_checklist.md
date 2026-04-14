# Smoke Test Checklist

## Local developer smoke

Run before shipping a meaningful product change:

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm --filter @qr/api test:integration`
- `pnpm test:dashboard:e2e`

## Manual product smoke

Verify this end-to-end in the browser:

1. Sign in or create an account
2. Confirm the empty QR list state is understandable
3. Create a link QR from `/generator`
4. Confirm the QR appears in `/dashboard`
5. Open QR details
6. Download PNG and SVG
7. Open analytics and confirm scan summary loads
8. Open billing and confirm current plan + usage load
9. If using deterministic billing mode, verify upgrade return + webhook sync path
10. Update profile/settings
11. Duplicate, archive, and delete a QR
12. Log out and confirm protected routes return to auth

## Public scan smoke

Verify the short-link states:

1. Active QR redirects correctly
2. Invalid slug shows a friendly not-found page
3. Inactive or expired QR shows an inactive page
4. Password-protected QR prompts for a password
5. Rate-limited QR shows a retry message

## Support/debugging smoke

1. Confirm API responses include `X-Request-Id`
2. Confirm user-facing API errors stay readable
3. Confirm raw stack traces are not shown in the browser UI
4. Confirm the request ID can be found in API logs
