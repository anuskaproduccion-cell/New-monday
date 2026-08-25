# Guarded production cutover retry — 2026-08-25 10:49 UTC

The production cutover false-negative caused by reloading a stale top-level Mongoose Mixed `sourceCounts` snapshot has been fixed and deployed. The immutable audited source-count snapshot remains the canonical completed-audit count. All original safety gates remain enabled.

Safety invariants:
- Monday read-only.
- exact validated baseline required.
- fingerprint audit required.
- zero planned deletes.
- zero conflicts.
- production collections must remain empty before promotion.
