# Stage 2 expected results

These are input-fixture expectations, not evidence that the future application passes tests. Amounts are in GBP; expected.json stores exact integer pence.

## Real-data batch

Only load the four files in samples/valid together. 84 records, 1503 units, 65 distinct SKUs, GBP 4201.25.

| Date | Records | Units | GBP |
|---|---:|---:|---:|
| 2010-12-01 | 20 | 131 | 408.25 |
| 2010-12-02 | 20 | 206 | 630.12 |
| 2010-12-03 | 22 | 750 | 1615.18 |
| 2010-12-05 | 22 | 416 | 1547.70 |
| Total | 84 | 1503 | 4201.25 |

No file is fabricated for 2010-12-04. This is a selected sample, not a statement about the retailer's full daily sales. Sum each line's quantity times its own unit price before grouping: a SKU can have different prices.

## Stage 1 reference

Run samples/reference/stage1_8_rows.csv separately: 8 records, 35 units, GBP 103.73. These records are already included in the normal batch; combining both would correctly trigger duplicate IDs.

## Synthetic cases

All files under samples/invalid and samples/synthetic-valid are fabricated tests, not UCI transactions. Each case must be run separately. Physical line numbers include the CSV header as line 1. All listed single-row errors are on line 2.

| Case | Field | Expected failure |
|---|---|---|
| missing_price | unit_price | Empty price must not become zero. |
| invalid_date | order_date | 2010-12-32 is not a real date. |
| invalid_quantity | quantity | 1.5 is not an integer quantity. |
| duplicate_id | line_id | Load both files in duplicate_id together; the second repeats SYN-DUP-001 from line 2 of the first. |
| cancelled_invoice | order_id | CSYN-ORDER-001 starts with C. |
| wrong_currency | currency | USD is not this demo's GBP currency. |
| out_of_period | order_date | 2010-12-06 is a real date outside the reporting period. |

Every negative case must reject its entire batch and produce no new final report. The reason identifiers in expected.json are descriptive fixture labels, not a required application's internal API. Do not mix negative cases into one batch.

The positive synthetic control must retain SKU 000101 as text and accept the explicit price 0.00. Expected total GBP 9.00. This distinguishes a legal zero from the missing-price case.

Expected per-SKU totals and exact source-record mapping are in expected.json and sources/uci352_selected_original_fields.csv.
