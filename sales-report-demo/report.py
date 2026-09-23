"""Strict, read-only CSV validation and sales aggregation (stage 3)."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Iterable

COLUMNS = ("line_id", "order_id", "order_date", "sku", "quantity", "unit_price", "currency")
PERIOD_START = date(2010, 12, 1)
PERIOD_END = date(2010, 12, 5)
MAX_FILES = 5
MAX_ROWS = 1000
MAX_QUANTITY = 1_000_000
MAX_UNIT_PRICE_PENCE = 100_000_000


class DataError(ValueError):
    """An invalid batch; no report is returned."""

    def __init__(
        self, code: str, message: str, *, file: Path | None = None,
        line: int | None = None, field: str | None = None,
        first_occurrence: tuple[Path, int] | None = None,
    ) -> None:
        self.code = code
        self.file = file
        self.line = line
        self.field = field
        self.first_occurrence = first_occurrence
        location = str(file) if file is not None else "batch"
        if line is not None:
            location += f":{line}"
        if field is not None:
            location += f" [{field}]"
        super().__init__(f"{location}: {message} ({code})")


@dataclass(frozen=True)
class LineItem:
    line_id: str
    order_id: str
    order_date: str
    sku: str
    quantity: int
    unit_price_pence: int
    currency: str
    source_file: str
    source_line: int

    @property
    def amount_pence(self) -> int:
        return self.quantity * self.unit_price_pence


@dataclass(frozen=True)
class Totals:
    rows: int
    quantity: int
    pence: int


@dataclass(frozen=True)
class SalesReport:
    items: tuple[LineItem, ...]
    totals: Totals
    by_date: dict[str, Totals]
    by_sku: dict[str, Totals]


def _parse_row(values: list[str], path: Path, line: int) -> LineItem:
    def fail(code: str, field: str | None, message: str) -> None:
        raise DataError(code, message, file=path, line=line, field=field)

    if len(values) != len(COLUMNS):
        fail("COLUMN_COUNT", None, f"Expected {len(COLUMNS)} fields, got {len(values)}.")
    row = dict(zip(COLUMNS, values))
    for field, value in row.items():
        if not value.strip():
            fail("MISSING_VALUE", field, "A value is required.")
        if value != value.strip() or any(unicodedata.category(char) == "Cc" for char in value):
            fail("INVALID_WHITESPACE", field, "Whitespace or control characters are not allowed.")
        if len(value.encode("utf-16-le")) // 2 > 32767 or any(char in "\ufffe\uffff" for char in value):
            fail("INVALID_TEXT", field, "Text cannot be represented in an Excel cell.")

    if row["order_id"].upper().startswith("C"):
        fail("CANCELLED_INVOICE", "order_id", "Cancelled invoices are not supported.")
    if row["currency"] != "GBP":
        fail("UNSUPPORTED_CURRENCY", "currency", "Expected GBP.")
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", row["order_date"]):
        fail("INVALID_DATE", "order_date", "Expected a real date in YYYY-MM-DD format.")
    try:
        day = date.fromisoformat(row["order_date"])
    except ValueError:
        fail("INVALID_DATE", "order_date", "Expected a real date in YYYY-MM-DD format.")
    if not PERIOD_START <= day <= PERIOD_END:
        fail("OUT_OF_PERIOD", "order_date", f"Expected {PERIOD_START} through {PERIOD_END}.")

    if not re.fullmatch(r"[0-9]+", row["quantity"]):
        fail("INVALID_QUANTITY", "quantity", "Expected a positive integer.")
    try:
        quantity = int(row["quantity"])
    except ValueError:
        fail("INVALID_QUANTITY", "quantity", "Quantity is too large to parse.")
    if not 1 <= quantity <= MAX_QUANTITY:
        fail("INVALID_QUANTITY", "quantity", f"Expected an integer from 1 through {MAX_QUANTITY}.")

    if not re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", row["unit_price"]):
        fail("INVALID_PRICE", "unit_price", "Expected a nonnegative price with at most two decimals.")
    pounds, _, pennies = row["unit_price"].partition(".")
    try:
        unit_price_pence = int(pounds) * 100 + int(pennies.ljust(2, "0"))
    except ValueError:
        fail("INVALID_PRICE", "unit_price", "Price is too large to parse.")
    if unit_price_pence > MAX_UNIT_PRICE_PENCE:
        fail("INVALID_PRICE", "unit_price", "Price exceeds the GBP 1000000.00 limit.")

    return LineItem(
        row["line_id"], row["order_id"], row["order_date"], row["sku"],
        quantity, unit_price_pence, row["currency"], str(path), line,
    )


def read_items(paths: Iterable[str | Path]) -> tuple[LineItem, ...]:
    """Validate the entire batch without changing files or exposing partial rows."""
    files = tuple(Path(path) for path in paths)
    if not 1 <= len(files) <= MAX_FILES:
        raise DataError("FILE_COUNT", f"Select 1 to {MAX_FILES} CSV files.")

    items: list[LineItem] = []
    seen_ids: dict[str, tuple[Path, int]] = {}
    for path in files:
        if path.suffix.lower() != ".csv":
            raise DataError("FILE_TYPE", "Expected a CSV file.", file=path)
        file_rows = 0
        reader = None
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle, strict=True)
                header = next(reader, None)
                if header is None:
                    raise DataError("EMPTY_FILE", "The file is empty.", file=path, line=1)
                if tuple(header) != COLUMNS:
                    raise DataError(
                        "SCHEMA", "Expected columns in this order: " + ",".join(COLUMNS),
                        file=path, line=1,
                    )
                while True:
                    line = reader.line_num + 1
                    values = next(reader, None)
                    if values is None:
                        break
                    if len(items) >= MAX_ROWS:
                        raise DataError("ROW_LIMIT", f"At most {MAX_ROWS} rows per batch.", file=path, line=line)
                    item = _parse_row(values, path, line)
                    if item.line_id in seen_ids:
                        first = seen_ids[item.line_id]
                        raise DataError(
                            "DUPLICATE_LINE_ID", f"ID already appears at {first[0]}:{first[1]}.",
                            file=path, line=line, field="line_id", first_occurrence=first,
                        )
                    seen_ids[item.line_id] = (path, line)
                    items.append(item)
                    file_rows += 1
                if file_rows == 0:
                    raise DataError("NO_DATA", "The file has a header but no data rows.", file=path, line=1)
        except UnicodeError as exc:
            # A decoder may read ahead, so do not invent an exact physical line.
            raise DataError("ENCODING", "Expected UTF-8 text.", file=path) from exc
        except csv.Error as exc:
            raise DataError("CSV_FORMAT", str(exc), file=path, line=reader.line_num if reader else None) from exc
        except OSError as exc:
            raise DataError("FILE_READ", str(exc), file=path) from exc
    return tuple(items)


def summarize(items: tuple[LineItem, ...]) -> SalesReport:
    """Aggregate validated records; every row uses its own unit price."""
    by_date: dict[str, Totals] = {}
    by_sku: dict[str, Totals] = {}
    total = Totals(0, 0, 0)
    for item in items:
        total = Totals(total.rows + 1, total.quantity + item.quantity, total.pence + item.amount_pence)
        for groups, key in ((by_date, item.order_date), (by_sku, item.sku)):
            previous = groups.get(key, Totals(0, 0, 0))
            groups[key] = Totals(
                previous.rows + 1, previous.quantity + item.quantity,
                previous.pence + item.amount_pence,
            )
    return SalesReport(items, total, dict(sorted(by_date.items())), dict(sorted(by_sku.items())))


def load_report(paths: Iterable[str | Path]) -> SalesReport:
    """Return a complete report only after every file passes validation."""
    return summarize(read_items(paths))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate sales CSVs and print a complete summary.")
    parser.add_argument("files", nargs="+", help="One to five CSV files; pass file paths explicitly.")
    args = parser.parse_args(argv)
    try:
        result = load_report(args.files)
    except DataError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    # Assemble output only after validation and aggregation are both complete.
    output = {
        "currency": "GBP", "period_start": str(PERIOD_START), "period_end": str(PERIOD_END),
        "totals": asdict(result.totals),
        "by_date": {key: asdict(value) for key, value in result.by_date.items()},
        "by_sku": {key: asdict(value) for key, value in result.by_sku.items()},
    }
    print(json.dumps(output, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
