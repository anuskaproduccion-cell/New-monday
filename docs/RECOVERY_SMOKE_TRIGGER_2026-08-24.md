# Excel recovery smoke trigger — 2026-08-24

This commit explicitly requests the extended isolated New Monday Excel recovery smoke test after fixing the legacy Formula=0 false-positive found by the previous run.

Safety conditions:
- The test may write only to `MONGODB_STAGING_URI`, whose database name must contain staging/test/sandbox.
- The test creates uniquely named temporary local records and deletes them in cleanup.
- It does not call Monday and performs zero Monday mutations.
- It does not promote or write to production.

Extended acceptance path:
1. Generate a real New Monday emergency workbook.
2. Edit Status, Timeline, Text, Numbers and Dropdown offline.
3. Create an item and a subitem offline and recover their parent link.
4. Apply explicit `ARCHIVAR` and `PAPELERA` actions.
5. Confirm a Formula edit is rejected as a read-only recovery conflict, while untouched missing Formula values remain blank.
6. Preview and apply valid recovery using explicit confirmation.
7. Verify a concurrent New Monday edit blocks the corresponding Excel recovery.
8. Verify restored values and lifecycle state inside isolated MongoDB.
9. Cleanup every temporary record and recovery run.
