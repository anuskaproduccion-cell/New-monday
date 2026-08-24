# STAGING execution trigger — 2026-08-24

This file records explicit isolated STAGING execution requests for New Monday v2.

Safety conditions:
- Monday remains strictly read-only; GraphQL mutations are forbidden.
- STAGING must use `MONGODB_STAGING_URI` and must not target the production database.
- No promotion to production is performed by this workflow.
- The execution must match the accepted source baseline and fingerprint audit.

Previous retries validated the isolated database and exposed two source-read edge cases: transient non-JSON responses and API throttling. The read-only client now retries transient failures, and the explicit STAGING job allows a bounded server-requested wait of up to 90 seconds while refusing long daily-limit waits.

This commit explicitly requests a new isolated STAGING run after those safeguards were validated by CI.

This marker exists only to provide an explicit, auditable trigger commit for the isolated STAGING workflow.
