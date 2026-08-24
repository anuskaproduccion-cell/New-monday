# Excel recovery smoke trigger — 2026-08-24

This commit explicitly requests the isolated New Monday Excel recovery smoke test.

Safety conditions:
- The test may write only to `MONGODB_STAGING_URI`, whose database name must contain staging/test/sandbox.
- The test creates uniquely named temporary local records and deletes them in cleanup.
- It does not call Monday and performs zero Monday mutations.
- It does not promote or write to production.

Acceptance path:
1. Generate a real New Monday emergency workbook.
2. Simulate offline edits to an existing item.
3. Simulate offline creation of an item and subitem.
4. Preview and apply recovery using explicit confirmation.
5. Verify restored values in isolated MongoDB.
6. Verify concurrent changes are detected and blocked.
7. Cleanup temporary records.
