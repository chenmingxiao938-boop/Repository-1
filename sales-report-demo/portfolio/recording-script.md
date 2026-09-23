# 70-second real-operation recording script

Record the actual local `export_report.py` flow. The supplied `record-real-demo.ps1` runs this exact sequence. Do not record a pre-made workbook as if it were newly created, and do not add claims that are not visible in the demo.

| Time | What appears on screen | What to say or show |
| --- | --- | --- |
| 0–14 s | Full-screen runner introduces the local CSV-to-Excel flow. | “This local tool turns fixed-format sales CSV files into an Excel sales report.” |
| 14–23 s | The runner lists the four files in `samples/valid`. | “These are the selected source files.” |
| 23–32 s | The actual exporter runs and saves a new timestamped workbook. | “The tool checks the full batch before it creates anything. This workbook comes from these files.” |
| 32–59 s | The runner reads the actual `Order Details`, `Daily Sales`, and `Product Sales` XML stored in the newly generated `.xlsx` file. | “The report keeps item details and groups the same data by date and product. This sample has 84 lines, 1,503 units, and GBP 4,201.25.” |
| 59–70 s | The runner runs the real missing-price CSV, prints its validation error, and confirms no workbook was created. | “When a value is missing, it names the file, row, and field and does not create a report. It is a fixed-format CSV reporting demo, not an accounting system.” |

## Recording checklist

- Capture the actual saved workbook, its three generated worksheets, and the actual validation error.
- The supplied script uses a new timestamped output name for each successful and failed run.
- Do not show customer identifiers or any unrelated desktop windows.
- Do not claim time savings unless a separate, fair comparison has been measured.
- Keep the final recording between 60 and 90 seconds.
