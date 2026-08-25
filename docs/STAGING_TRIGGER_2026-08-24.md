# STAGING execution trigger — 2026-08-24

This file records explicit isolated STAGING execution requests for New Monday v2.

Safety conditions:
- Monday remains strictly read-only; GraphQL mutations are forbidden.
- STAGING must use `MONGODB_STAGING_URI` and must not target the production database.
- No promotion to production is performed by this workflow.
- The execution must match the accepted source baseline and fingerprint audit.

Previous retries validated the isolated database and exposed two source-read edge cases: transient non-JSON responses and API throttling. The read-only client now retries transient failures, and the explicit STAGING job allows a bounded server-requested wait of up to 90 seconds while refusing long daily-limit waits.

Retry requested again at 2026-08-25T10:04+01:00 after the overnight cooldown. Acceptance remains exact: 17 workspaces / 103 boards / 55 visible / 48 internal / 1230 items / 413 subitems, 103/103 schema fingerprints and 55/55 data fingerprints, with Monday mutations = 0 and production writes = 0.

This marker exists only to provide an explicit, auditable trigger commit for the isolated STAGING workflow.
