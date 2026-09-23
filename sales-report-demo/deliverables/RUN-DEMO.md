# Run the complete demo

Requires Python 3.10 or later. No third-party Python packages are required. The file-picker interface additionally needs Tkinter (included with the standard Windows Python installer).

Extract the entire ZIP. Open a terminal in this folder and run:

    python -B app.py

Select the four CSV files in samples/valid and save to a new .xlsx file. Check 84 item lines, 1,503 units and GBP 4,201.25.

Command-line alternative:

    python -B export_report.py samples/valid/orders_2010-12-01.csv samples/valid/orders_2010-12-02.csv samples/valid/orders_2010-12-03.csv samples/valid/orders_2010-12-05.csv --output work/demo.xlsx

Run the independent tests:

    python -B -m unittest discover -s tests -q

For the error demonstration, select only samples/invalid/missing_price/synthetic_missing_price.csv. Export must fail with MISSING_VALUE and must not create the requested workbook. Correct a separate copy before retrying.

See README.md for exact validation rules, data transformations and attribution. Its machine-specific commands describe the author's workstation; use the portable commands above on your own machine. This is a fixed-format, fixed-period demo. Running it does not require Microsoft Excel; viewing XLSX requires a compatible spreadsheet application.
