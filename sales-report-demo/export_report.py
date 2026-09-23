"""Command-line entry point for creating a validated Excel sales report."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from excel_report import ExportError, export_xlsx
from report import DataError, load_report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate CSV files and save a three-sheet Excel sales report.")
    parser.add_argument("files", nargs="+", help="One to five source CSV files.")
    parser.add_argument("--output", required=True, help="Destination .xlsx file.")
    args = parser.parse_args(argv)
    sources = tuple(Path(path) for path in args.files)
    try:
        report = load_report(sources)
        output = export_xlsx(report, sources, args.output)
    except (DataError, ExportError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Saved: {output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
