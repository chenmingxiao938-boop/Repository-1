# Stage 5 verification

Date: 2026-09-20. The user requested that the assistant perform routine checks and fixes, reserving important reviews for the user.

The user independently calculated and exported the unseen public batch: 8 lines, 129 units, GBP 374.55. The user also confirmed that missing-price input displayed an error and produced no output. The assistant then corrected the separate synthetic practice copy and exported portfolio/stage5_fixed.xlsx: 1 line, 2 units, GBP 9.00. This last correction was not an independent user exercise.

Program verification: 54 passed, 0 failed. Native Microsoft Excel read-only verification: 11 passed, 0 failed. The actual exporter produced the full public sample, the unseen-batch workbook and the corrected practice workbook. Three-sheet totals matched, leading-zero text remained intact and the checked totals contained no formulas. Actual full-sample workbook renders were inspected for readable headings, metadata and amounts. A separately opened Excel check confirmed that the literal SKU `_x0041_` remains unchanged.

Checks cover independent unseen line calculations and daily/product baselines, repeated business results, invalid input after success, unchanged inputs and previous outputs on failure, temporary-file cleanup, zero prices, leading-zero identifiers, literal formula-like identifiers, source attribution, XML-safe text and Excel penny precision. GUI success and failure paths used mocked dialogs with real validation and export; this supplements, rather than replaces, the user's earlier real GUI runs.

Fixes: source attribution now requires exact bundled-record matches; the three sheets consistently use snapshot values; Excel precision overflow and invalid/overlong text fail explicitly. Literal Excel-style `_xHHHH_` text is escaped so identifiers cannot be decoded, and XML-invalid source filenames fail before replacing an existing output. Original invalid fixtures and the user's previously saved workbooks were preserved.

Automated code review: the first review found two issues, both fixed; the next review returned APPROVED. A later review found a shared-underscore Excel text-escape case; it was fixed, verified by program tests and native Excel, and the final review returned APPROVED. Human inspection of staged changes remains required before prepare-pr by the workspace AGENTS.md. No commit, push, branch or worktree was created. Stage 6 presentation materials are not yet complete.
