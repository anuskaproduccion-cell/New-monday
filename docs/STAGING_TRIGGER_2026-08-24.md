# STAGING execution trigger — 2026-08-24

This file records explicit isolated STAGING execution requests for New Monday v2.

Safety conditions:
- Monday remains strictly read-only; GraphQL mutations are forbidden.
- STAGING must use `MONGODB_STAGING_URI` and must not target the production database.
- No promotion to production is performed by this workflow.
- The execution must match the accepted source baseline and fingerprint audit.

Retry requested at 2026-08-24T17:03+01:00 after correcting `MONGODB_STAGING_URI`.

This marker exists only to provide an explicit, auditable trigger commit for the isolated STAGING workflow.
