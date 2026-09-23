# Stage 2 data verification

Verified 2026-09-18: 17 checks passed, 0 failed.

This verifies the input fixtures and their documented expectations. It does not claim that a reporting application exists or rejects errors correctly.

- Four normal CSV files contain 84 distinct source-record IDs, 1,503 units and 65 SKUs.
- Exact decimal recomputation from saved inputs gives GBP 4,201.25; daily and SKU totals match checks/expected.json.
- All 84 selected original records were fetched again from the UCI official CSV and compared field-by-field with the saved source projection. Normalized inputs map to those source fields without changing quantities, prices or identifiers.
- The separate eight-record reference is identical to its subset of the normal batch and totals GBP 103.73.
- Seven negative scenarios have the intended mutation, file and line location, with no unplanned changes to other baseline fields. The duplicate scenario is a two-file batch.
- The positive synthetic control preserves SKU 000101 and explicit zero price; its expected total is GBP 9.00.
- Source and sample CSVs contain no CustomerID field.

Review and simplification: files are divided only where required for date-based input, independent error cases, provenance and the original baseline. No application code, extra workbook, package installation or customer-facing publishing was needed.

The period spans five calendar days; selected records cover four dates. Missing selection on December 4 is not a claim of zero actual sales. Sample records are not full-day or full-invoice totals.
