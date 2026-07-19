# Factory Operations / Test sheet

> Last synced: 2026-07-17.

Key:
- Y = Yes, implemented, works, covered by a passing automated test
- E = Implemented and eyeballed working, but has NO automated test yet

Test file locations:
- **tdd:fac-prod** = `web/testing/tdd/factory-operations/products.spec.ts`
- **unit:products** = `web/src/utils/factory-management/products.spec.ts`

## Factory Product Creation / Deletion
Ref: FAC-PROD-CD

| Operation                                                          | Ref           | Status | Test reference                          | Notes |
|--------------------------------------------------------------------|---------------|--------|-----------------------------------------|-------|
| Creating a new product adds empty product                          | FAC-PROD-CD-1 | E      | —                                       |       |
| Upon entering a recipe for a product, factory satisfaction updates | FAC-PROD-CD-2 | E      | —                                       |       |
| Deleting a product removes it from the factory                     | FAC-PROD-CD-3 | E      | —                                       |       |
| Deleting a product updates the factory satisfaction                | FAC-PROD-CD-4 | Y      | tdd:fac-prod (x3: single, multi, via UI) |       |
