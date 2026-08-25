# New Monday production cutover trigger — 2026-08-25

This branch exists only to execute the guarded production cutover from the already-deployed `main` revision without causing a concurrent Render deploy.

Safety requirements enforced by the runner:
- Monday API is query-only; GraphQL mutations are rejected.
- Production collections must be empty before preparation and again before promotion.
- Baseline must match 17 workspaces / 103 boards / 55 visible boards / 48 internal boards / 1230 items / 413 subitems.
- Fingerprint audit must be fully green.
- Promotion preview must contain zero conflicts and zero planned deletes.
- Final production count must be 17 workspaces / 103 boards / 1643 Item documents.

Final controlled execution requested at 2026-08-25 after the user explicitly authorized publication. The workflow records its own outcome in `docs/PRODUCTION_CUTOVER_RESULT.md`.
