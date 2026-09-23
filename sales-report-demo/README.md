# Sales report demo

This local demo validates fixed-format CSV files and creates a three-sheet Excel sales report. It uses Python's standard library only.

## Run the core

Python 3.10 or later is required. This machine was verified with Python 3.14.6 at C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe. No installation was needed.

From PowerShell:

```powershell
Set-Location -LiteralPath 'D:\workspace\sales-report-demo'
$salesPython = 'C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe'
$salesInputs = @(Get-ChildItem -LiteralPath '.\samples\valid' -Filter '*.csv' | Sort-Object Name | Select-Object -ExpandProperty FullName)
& $salesPython -B .\report.py @salesInputs
& $salesPython -B -m unittest discover -s tests -q
```

The command prints a JSON summary only when every file is valid. Amounts named pence are integer pennies: 420125 means GBP 4201.25. Totals distinguish item rows from quantity; neither is an order count. On invalid input it exits with code 1, prints an error to stderr and prints no success summary to stdout. It writes no report files and never changes input files.

The core API is load_report(paths), returning validated items, totals, by_date and by_sku. read_items validates the whole batch; summarize is for already validated LineItems. Use load_report for external files so that checks cannot be bypassed accidentally.

Input contract: 1–5 CSV files, 1–1000 data rows per batch, with at least one row per file. UTF-8 with or without an initial BOM; exact header order as documented below. Dates must be real YYYY-MM-DD dates within the reporting period. Quantity is an integer from 1 through 1,000,000. Price is nonnegative decimal text with at most two fractional digits and a maximum of GBP 1,000,000.00. Currency is exactly GBP. Empty fields, extra/missing columns, blank records, cancelled invoices (C/c prefix), duplicate line IDs and invalid text are rejected. IDs remain text. Leading/trailing whitespace and embedded Unicode control characters are errors, not silently repaired. No rows are silently dropped.

Errors carry a filename and, for row errors, a physical line and field. File access and encoding errors may not have an exact line. A duplicate ID identifies its first occurrence as well. A header-only file is rejected. Per-date output includes observed dates only. Output groups are sorted by date or SKU, while details retain input order.

Tests generate temporary files only under the ignored project work directory. Learning notes are in docs/stage3-guide.md.

## What to open

- samples/valid: four real-data CSVs to load as one batch (84 rows total).
- samples/reference: the eight stage 1 records; run separately because they also occur in the normal batch.
- samples/invalid: seven independent synthetic error scenarios in eight CSV files.
- samples/synthetic-valid: one synthetic positive control for leading-zero SKU and zero price.
- checks/expected.md: human-readable expected amounts and error locations.
- checks/expected.json: exact amounts in integer pence and case definitions.
- sources/uci352_selected_original_fields.csv: selected original field strings with source record numbers; no customer identifiers.

The CSV columns are line_id, order_id, order_date, sku, quantity, unit_price, currency. In Excel import through Data > From Text/CSV and set line_id, order_id and sku to Text; opening CSV directly can change identifiers. Treat the CSV files as the authoritative fixtures. Save edits separately.

## Scope

Reporting period 2010-12-01 through 2010-12-05, currency GBP. Each row is an invoice item. order_id maps InvoiceNo and does not prove an independently verified order ID. The original dataset has no completed/payment/shipping status. Do not add completed or claim that positive non-cancellation records have no later returns.

Line amount = quantity times that line's unit price. The sample total is not the retailer's full turnover, cash receipts or profit. Tax, freight and discount details are not established. All source SKUs remain unchanged, including letters. No leading zeros were added to real SKUs.

## Source and reproducible selection

Chen, D. (2015). Online Retail [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5BW33

- Metadata: https://archive.ics.uci.edu/dataset/352/online+retail
- Original CSV: https://archive.ics.uci.edu/static/public/352/data.csv
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Retrieved UTC: 2026-09-18T14:08:42.0235088Z

Selection: in original record order, take the first 20 eligible records for each of 2010-12-01, 2010-12-02, 2010-12-03 and 2010-12-05; union these by original record number with stage 1 source records 1, 2, 3119, 3120, 5305, 5337, 7537, 7584. Eligibility: positive integer quantity, nonnegative price exactly representable in pence, nonblank invoice and stock code, invoice not starting with C (case-insensitive). This yields 84 rows. This is a deliberate demonstration selection, not random sampling. Reading stopped after record 7584, after all selection requirements were met; the entire dataset was not scanned.

Adaptations: line_id = UCI352- plus the source record number padded to six digits (header excluded; CSV logical records, not physical lines). InvoiceNo maps to order_id, StockCode to sku, Quantity to quantity, UnitPrice to unit_price formatted to two decimals without changing value. InvoiceDate is parsed as M/d/yyyy H:mm, retaining its calendar date in order_date. GBP comes from UCI metadata. CustomerID, Country and Description are omitted. Selected original fields are retained for comparison. UCI does not endorse this demonstration.

Synthetic fixtures have SYN identifiers and synthetic filenames; they are authored specifically for testing and must never be described as actual customer transactions.

## Search record

2026-09-18: reused the official UCI source and license verified in stage 1, and retrieved the original CSV to build this stage. Existing workspace research records were reviewed; no new software library or third-party skill is needed to prepare raw CSV fixtures.
## Create an Excel report

Run this command from the project folder. Choose one to five CSV files and provide a new `.xlsx` output path.

```powershell
& 'C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe' export_report.py samples\valid\orders_2010-12-01.csv samples\valid\orders_2010-12-02.csv samples\valid\orders_2010-12-03.csv samples\valid\orders_2010-12-05.csv --output portfolio\sales_report_2010-12-01_to_2010-12-05.xlsx
```

For the file-picker interface, run:

```powershell
& 'C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe' app.py
```

For a short independent check, run the stage 1 reference file by itself and confirm that the saved workbook shows 8 selected lines and GBP 103.73. Do not combine that reference file with the normal batch because its rows already occur there.

```powershell
& 'C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe' export_report.py samples\reference\stage1_8_rows.csv --output work\stage4_user_check.xlsx
```

The exported workbook has three English sheets: `Order Details`, `Daily Sales`, and `Product Sales`. It shows the selected period, GBP, source file names and line count. Exact matches to the bundled UCI records receive the public-data notice and attribution; the bundled synthetic control is labelled Synthetic Test Data. Other records are labelled User-supplied data, with their source unverified as UCI. Filenames alone never establish provenance.

All sheets contain calculated snapshot values. To update a report, change the CSV and export again; editing the workbook does not recalculate summaries. Money is serialized from exact decimal values. Excel export rejects totals over GBP 9,999,999,999,999.99 to preserve penny precision. Input fields longer than 32,767 UTF-16 code units or containing XML-invalid U+FFFE/U+FFFF are rejected. Export failures preserve any existing output and remove the incomplete temporary workbook.

Stage 5 verification is recorded in checks/stage5-verification.md. The additional eight public records in samples/unseen were selected separately from the development fixtures; their original fields are in sources/uci352_unseen_original_fields.csv. The corrected practice output portfolio/stage5_fixed.xlsx contains synthetic user-supplied data, not UCI transactions.

## Limits of this demo

The UCI sample is public selected data. Its totals are selected-item sales totals only. They do not show complete business sales, tax, shipping, discounts, payments, delivery status, or later returns.
