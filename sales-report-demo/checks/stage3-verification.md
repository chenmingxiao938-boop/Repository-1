# Stage 3 verification

Date: 2026-09-18.

Implementation: report.py provides read_items, summarize and load_report, plus a read-only command-line entry point. The implementation uses the Python standard library only, with integer pence throughout calculations.

Verified runtime: Python 3.14.6, C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe. Existing installation; no new software installed.

Command from the project directory: python -B -m unittest discover -s tests -q (using the verified executable above).

Result: 39 tests passed, 0 failed. Normal batch: 84 item rows, 1503 units, GBP 4201.25. Stage 1 reference: GBP 103.73. All seven predefined negative cases reject the entire batch with the expected file, line and field. Tests cover exact money, differing prices for one SKU, period boundaries, input limits, malformed input, duplicates, identifier preservation, original-file protection and command-line success/failure behavior.

Local defect review: APPROVED. The code validates the whole batch before aggregation and does not expose partial results. Reconsidering the original scope did not justify additional libraries, a database or recovery logic. The separate read/aggregate functions support the later interface without duplicating validation.

Git staged and working-tree whitespace checks passed. The workspace's configured test wrapper reports NOT_CONFIGURED, so this project's real unittest command above was run directly. The workspace's local check command passed. Only sales-report-demo files were staged; unrelated workspace changes were not staged, reverted or committed.

Required automated review: after the user authorized sending this project's staged code and public fixtures to Codex, tools/dev.ps1 review initially found two Low issues. The first allowed extremely large quantity and price values that could cause JSON serialization to fail; the second omitted Unicode C1 control characters from identifier validation. The program now limits quantity to 1,000,000, price to GBP 1,000,000.00 and rejects all Unicode control-category characters. Three focused tests cover those boundaries. The full suite then passed 39 tests, 0 failed, and the re-review result was APPROVED.

No human-review flag was supplied and no commit, push, new branch or worktree was created. A human still needs to inspect git diff --cached before any prepare-pr action. Stage 4 Excel export and GUI have not started. The learning guide is provided, but the user's independent understanding has not been verified.
