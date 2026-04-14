# Known Limitations

## Product limitations

- Billing truth is currently verified in deterministic Stripe-compatible mock mode, not against Stripe-hosted checkout or externally delivered webhooks
- Google OAuth is not implemented
- Only link QR flows are launch-ready
- Downloads currently cover PNG and SVG only
- Folder/workspace management is intentionally out of scope for the current launch slice

## Operational limitations

- Staging and hosting verification are intentionally postponed
- Real S3/R2 object storage is code-wired but not observed in this launch-readiness pass
- Metrics, traces, and backup strategy are still incomplete
- Dedicated deployed worker separation is not yet observed outside CI/runtime verification

## UX limitations

- Billing covers current plan, invoices, quotas, and upgrade entry points, but not proration or failed-payment recovery UX
- Analytics focuses on dashboard aggregates and recent events; export/reporting remains limited
- Public scan pages are improved for key states, but they are intentionally minimal and not a full branded marketing surface
