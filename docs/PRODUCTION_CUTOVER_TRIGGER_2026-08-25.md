# Production cutover trigger — 2026-08-25

Authorized publication of New Monday v2.

This marker exists only to trigger the guarded GitHub Actions cutover workflow after the v2 deployment is live.

Safety invariants:
- Monday is read-only.
- Monday mutations: 0.
- Production deletes: 0.
- Promotion is allowed only after a fresh green audit and exact baseline validation.
