# Stage 4 verification

Date: 2026-09-20.

Implementation: `excel_report.py` creates a three-sheet `.xlsx` report after `report.py` validates all selected CSV files. `export_report.py` is the command-line entry point. `app.py` provides local file selection and a save dialog. All implementation code uses the Python standard library; no new software was installed.

Workbook content: `Order Details`, `Daily Sales`, and `Product Sales`. The normal batch report labels itself `Public dataset demo — selected records`, shows the 2010-12-01 through 2010-12-05 period, GBP, 84 selected lines, source filenames, UCI Online Retail attribution, and CC BY 4.0. It does not claim complete business revenue, payment, shipping, or customer data.

Program tests: 44 passed, 0 failed. They verify the three sheet names, normal-batch totals, formulas and cached values, leading-zero SKU text, invalid output extension, source-file protection, and invalid-input blocking. The normal batch produces 84 lines, 1,503 units, and GBP 4,201.25. The seven earlier invalid cases remain covered by the core tests.

The final sample is `portfolio/sales_report_2010-12-01_to_2010-12-05.xlsx`, produced by the actual command-line exporter from the four valid CSV files. Microsoft Excel opened it in hidden read-only mode and confirmed 3 sheets, all three totals at £4,201.25, and `£#,##0.00` as the detail amount format. Three-sheet visual review found readable headers, widths, totals, and source disclosure. No formula error was found in the generated sample.

Automated review: the review script rejects binary files, so the `.xlsx` sample was temporarily excluded and the code, tests, and public text files were reviewed separately. The first two attempts were blocked locally by Windows PowerShell policy and version requirements. The PowerShell 7 run finished without a terminal review message, so no approval result is claimed. A human still needs to inspect `git diff --cached` before any prepare-pr action.

The user independently used `app.py` with the separate stage 1 reference CSV, saved a workbook, and confirmed 8 selected lines, 35 units, and £103.73. Stage 4 is complete. No commit, push, branch, or worktree was created.
