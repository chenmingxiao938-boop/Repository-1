# Stage 4: Excel export and local entry point

`export_report.py` is the command-line entry point. It first runs the same strict CSV validation from `report.py`. Only after every selected file passes does it create the workbook.

`app.py` provides the same flow with two local dialogs: choose 1–5 CSV files, then choose where to save the `.xlsx` file. A validation error shows its reason instead of creating a report.

The workbook has three English sheets.

- `Order Details` keeps the seven input fields and adds `Line Amount (GBP)`.
- `Daily Sales` groups the actual selected rows by date.
- `Product Sales` groups the actual selected rows by SKU.

All money is calculated from integer pence before export. Excel receives numbers for counts and currency, real date values for order dates, and text cells for identifiers such as SKU. The normal data batch has 84 lines, 1,503 units, and GBP 4,201.25; those are values calculated from the selected CSVs, not hard-coded report results.

The source files are listed in the `Order Details` sheet. Exact matches to bundled public records are labelled `Public dataset demo — selected records` with UCI attribution and CC BY 4.0. Other inputs receive a synthetic-control or user-supplied label. No workbook claims that records are paid, fulfilled, or complete business sales.

Stage 5 update: all sheets are snapshots, with no editable calculation formulas. Change the CSV and export again to update them together. The exporter rejects totals beyond Excel's penny-precision limit and preserves an existing output if saving fails.
