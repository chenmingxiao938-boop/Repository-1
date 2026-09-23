# Stage 6 packaging verification

Date: 2026-09-21.

Completed materials:

- `portfolio/one-page-introduction.md`: copyable English introduction.
- `portfolio/one-page-introduction.html`: styled local one-page version.
- `portfolio/sales-report-demo-one-page.pdf`: A4 attachment-ready version.
- `portfolio/recording-script.md`: real-operation script and recording checklist.
- `portfolio/record-real-demo.ps1`: repeatable local recording runner.
- `portfolio/sales-report-demo-real-operation.mp4`: 70-second real-operation video.

The final PDF has one A4 page. It was rendered to PNG and visually checked for readable hierarchy, spacing, complete content, and no browser date or local-file-path headers/footers. It accurately states the fixed input format, the three report sheets, the selected-public-data scope, the 84-line / 1,503-unit / GBP 4,201.25 sample, 54 passing program checks, and 11 passing native Excel checks. It contains no unmeasured time-saving claim.

The final video records a newly created timestamped workbook from the four valid CSV files, reads actual data rows from all three generated worksheets, shows the daily and product totals (84 lines, 1,503 units, GBP 4,201.25), then runs the real missing-price CSV and confirms that no workbook was created. It is 70 seconds long. Key frames covering the opening, file selection, export, worksheet reading, totals, and error result were visually checked; the recording contains no unrelated desktop window or account information.

Stage 6 is complete. No commit, push, public upload, contact, or transaction occurred.

The accompanying text and code changes passed the final automated review. Human inspection of staged changes still remains required before any prepare-pr action.
