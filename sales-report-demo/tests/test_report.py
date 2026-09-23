"""Behavior tests against independent stage 2 fixtures and temporary edge cases."""

import contextlib
import csv
import io
import json
import subprocess
import sys
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

from report import (
    COLUMNS, DataError, MAX_QUANTITY, MAX_UNIT_PRICE_PENCE, load_report, main,
)

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = json.loads((ROOT / "checks" / "expected.json").read_text(encoding="utf-8-sig"))
BASE = ["TEST-001", "INV-001", "2010-12-01", "000101", "2", "4.50", "GBP"]


class ReportTests(unittest.TestCase):
    def setUp(self):
        work = ROOT / "work"
        work.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="stage3-tests-", dir=work)
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def make_csv(self, rows=None, header=COLUMNS, name="input.csv", encoding="utf-8"):
        path = self.directory / name
        with path.open("w", encoding=encoding, newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            writer.writerows([BASE] if rows is None else rows)
        return path

    def assert_invalid(self, path, code, line=None, field=None):
        with self.assertRaises(DataError) as caught:
            load_report([path])
        self.assertEqual(caught.exception.code, code)
        if line is not None:
            self.assertEqual(caught.exception.line, line)
        if field is not None:
            self.assertEqual(caught.exception.field, field)
        return caught.exception

    def test_full_batch_matches_all_independent_totals(self):
        expected = EXPECTED["normal_batch"]
        result = load_report(ROOT / name for name in expected["files"])
        self.assertEqual(asdict(result.totals), {
            "rows": 84, "quantity": 1503, "pence": 420125,
        })
        self.assertEqual({k: asdict(v) for k, v in result.by_date.items()}, expected["daily"])
        self.assertEqual({k: asdict(v) for k, v in result.by_sku.items()}, expected["by_sku"])
        self.assertEqual(len(result.by_sku), 65)
        self.assertNotIn("2010-12-04", result.by_date)

    def test_reference_uses_each_rows_own_price(self):
        result = load_report([ROOT / EXPECTED["reference"]["files"][0]])
        self.assertEqual(result.totals.pence, 10373)
        self.assertEqual(result.by_sku["85123A"].pence, 12 * 255 + 11 * 295)
        self.assertEqual(result.by_sku["71053"].pence, 12 * 339)
        self.assertEqual([r.amount_pence for r in result.items],
                         [1530, 2034, 1530, 2034, 590, 590, 1770, 295])

    def test_leading_zero_and_zero_price_control(self):
        result = load_report([ROOT / EXPECTED["positive_synthetic_control"]["files"][0]])
        self.assertEqual(result.items[0].sku, "000101")
        self.assertEqual(result.items[1].unit_price_pence, 0)
        self.assertEqual(result.totals.pence, 900)
        self.assertEqual(result.totals.quantity, 3)

    def test_money_is_exact_for_decimal_tenths(self):
        a, b = BASE.copy(), BASE.copy()
        a[4:6] = ["3", "0.10"]
        b[0], b[4], b[5] = "TEST-002", "1", "0.20"
        result = load_report([self.make_csv([a, b])])
        self.assertEqual(result.totals.pence, 50)

    def test_invalid_prices_are_not_coerced(self):
        for price in ("-1", "1.234", "NaN", "Infinity", "1e2", "GBP 2", " 2.00"):
            with self.subTest(price=price):
                row = BASE.copy()
                row[5] = price
                error = self.assert_invalid(
                    self.make_csv([row]), "INVALID_WHITESPACE" if price.startswith(" ") else "INVALID_PRICE"
                )
                self.assertEqual(error.field, "unit_price")

    def test_integer_and_one_decimal_prices(self):
        for price, expected in (("0", 0), ("4", 800), ("4.5", 900)):
            with self.subTest(price=price):
                row = BASE.copy()
                row[5] = price
                self.assertEqual(load_report([self.make_csv([row])]).totals.pence, expected)

    def test_invalid_quantities(self):
        for quantity in ("0", "-1", "1.0", "1e2", "NaN", "+2", str(MAX_QUANTITY + 1), "9" * 5000):
            with self.subTest(quantity=quantity):
                row = BASE.copy()
                row[4] = quantity
                self.assert_invalid(self.make_csv([row]), "INVALID_QUANTITY", 2, "quantity")

    def test_quantity_upper_limit_is_accepted(self):
        row = BASE.copy()
        row[4], row[5] = str(MAX_QUANTITY), "0.00"
        self.assertEqual(load_report([self.make_csv([row])]).totals.quantity, MAX_QUANTITY)

    def test_price_upper_limit_and_too_large_price(self):
        row = BASE.copy()
        row[5] = f"{MAX_UNIT_PRICE_PENCE // 100}.00"
        self.assertEqual(load_report([self.make_csv([row])]).totals.pence, MAX_UNIT_PRICE_PENCE * 2)
        row[5] = f"{MAX_UNIT_PRICE_PENCE // 100 + 1}.00"
        self.assert_invalid(self.make_csv([row]), "INVALID_PRICE", 2, "unit_price")
        row[5] = "9" * 5000
        self.assert_invalid(self.make_csv([row]), "INVALID_PRICE", 2, "unit_price")

    def test_date_is_strict_calendar_date(self):
        for value in ("2010-12-00", "2010-12-32", "2010-02-29", "2010-12-1", "12/01/2010"):
            with self.subTest(value=value):
                row = BASE.copy()
                row[2] = value
                self.assert_invalid(self.make_csv([row]), "INVALID_DATE", 2, "order_date")

    def test_period_boundaries_and_outside(self):
        for day in ("2010-12-01", "2010-12-05"):
            row = BASE.copy()
            row[2] = day
            self.assertEqual(load_report([self.make_csv([row])]).totals.rows, 1)
        for day in ("2010-11-30", "2010-12-06"):
            row = BASE.copy()
            row[2] = day
            self.assert_invalid(self.make_csv([row]), "OUT_OF_PERIOD", 2, "order_date")

    def test_every_required_field_rejects_blank(self):
        for index, field in enumerate(COLUMNS):
            with self.subTest(field=field):
                row = BASE.copy()
                row[index] = ""
                self.assert_invalid(self.make_csv([row]), "MISSING_VALUE", 2, field)

    def test_cancelled_invoice_is_case_insensitive(self):
        row = BASE.copy()
        row[1] = "c1234"
        self.assert_invalid(self.make_csv([row]), "CANCELLED_INVOICE", 2, "order_id")

    def test_same_invoice_with_distinct_line_ids_is_valid(self):
        second = BASE.copy()
        second[0], second[3] = "TEST-002", "85123A"
        result = load_report([self.make_csv([BASE, second])])
        self.assertEqual(result.totals.rows, 2)
        self.assertEqual(result.totals.pence, 1800)

    def test_duplicate_within_file_has_both_locations(self):
        path = self.make_csv([BASE, BASE])
        error = self.assert_invalid(path, "DUPLICATE_LINE_ID", 3, "line_id")
        self.assertEqual(error.first_occurrence, (path, 2))

    def test_bad_file_prevents_any_aggregation(self):
        good = self.make_csv(name="good.csv")
        row = BASE.copy()
        row[0], row[5] = "TEST-002", ""
        bad = self.make_csv([row], name="bad.csv")
        with patch("report.summarize") as aggregate:
            with self.assertRaises(DataError):
                load_report([good, bad])
            aggregate.assert_not_called()

    def test_empty_and_header_only_files(self):
        empty = self.directory / "empty.csv"
        empty.write_bytes(b"")
        self.assert_invalid(empty, "EMPTY_FILE", 1)
        self.assert_invalid(self.make_csv([]), "NO_DATA", 1)

    def test_wrong_missing_and_duplicate_headers(self):
        headers = [COLUMNS[:-1], COLUMNS[::-1], (*COLUMNS[:-1], "line_id"), (*COLUMNS, "extra")]
        for header in headers:
            with self.subTest(header=header):
                self.assert_invalid(self.make_csv(header=header), "SCHEMA", 1)

    def test_short_long_and_blank_records_fail(self):
        for row in (BASE[:-1], [*BASE, "extra"], []):
            with self.subTest(row=row):
                self.assert_invalid(self.make_csv([row]), "COLUMN_COUNT", 2)

    def test_utf8_bom_is_supported(self):
        self.assertEqual(load_report([self.make_csv(encoding="utf-8-sig")]).totals.pence, 900)

    def test_invalid_encoding_is_explicit(self):
        path = self.directory / "bad.csv"
        path.write_bytes(b"\xff\xfe\xfa")
        error = self.assert_invalid(path, "ENCODING")
        self.assertEqual(error.file, path)
        self.assertIsNone(error.line)

    def test_unclosed_csv_quote_is_rejected(self):
        path = self.directory / "bad.csv"
        path.write_text(",".join(COLUMNS) + '\n"unfinished', encoding="utf-8")
        self.assert_invalid(path, "CSV_FORMAT")

    def test_quoted_comma_in_identifier_is_preserved(self):
        row = BASE.copy()
        row[3] = "SKU,ONE"
        self.assertEqual(load_report([self.make_csv([row])]).items[0].sku, "SKU,ONE")

    def test_embedded_newline_in_identifier_is_rejected(self):
        row = BASE.copy()
        row[3] = "SKU\nONE"
        self.assert_invalid(self.make_csv([row]), "INVALID_WHITESPACE", 2, "sku")

    def test_c1_control_character_in_identifier_is_rejected(self):
        row = BASE.copy()
        row[3] = "SKU\u0085ONE"
        self.assert_invalid(self.make_csv([row]), "INVALID_WHITESPACE", 2, "sku")

    def test_file_count_bounds(self):
        with self.assertRaises(DataError) as zero:
            load_report([])
        self.assertEqual(zero.exception.code, "FILE_COUNT")
        with self.assertRaises(DataError) as six:
            load_report([self.directory / "absent.csv"] * 6)
        self.assertEqual(six.exception.code, "FILE_COUNT")
        files = []
        for i in range(5):
            row = BASE.copy()
            row[0] = f"TEST-{i}"
            files.append(self.make_csv([row], name=f"{i}.csv"))
        self.assertEqual(load_report(files).totals.rows, 5)

    def test_row_limit_is_for_the_whole_batch(self):
        rows = []
        for i in range(1001):
            row = BASE.copy()
            row[0] = f"TEST-{i}"
            rows.append(row)
        first = self.make_csv(rows[:500], name="a.csv")
        second = self.make_csv(rows[500:1000], name="b.csv")
        self.assertEqual(load_report([first, second]).totals.rows, 1000)
        second = self.make_csv(rows[500:], name="b.csv")
        with self.assertRaises(DataError) as caught:
            load_report([first, second])
        self.assertEqual(caught.exception.code, "ROW_LIMIT")
        self.assertEqual(caught.exception.file, second)
        self.assertEqual(caught.exception.line, 502)

    def test_missing_file_and_non_csv_are_explicit(self):
        self.assert_invalid(self.directory / "absent.csv", "FILE_READ")
        self.assert_invalid(self.directory / "input.xlsx", "FILE_TYPE")

    def test_repeated_and_reordered_runs_do_not_accumulate(self):
        files = [ROOT / name for name in EXPECTED["normal_batch"]["files"]]
        first = load_report(files)
        for result in (load_report(files), load_report(reversed(files))):
            self.assertEqual(result.totals, first.totals)
            self.assertEqual(result.by_date, first.by_date)
            self.assertEqual(result.by_sku, first.by_sku)

    def test_sources_are_unchanged_and_no_report_file_is_created(self):
        paths = list((ROOT / "samples").rglob("*.csv"))
        before = {path: path.read_bytes() for path in paths}
        load_report(ROOT / name for name in EXPECTED["normal_batch"]["files"])
        for case in EXPECTED["negative_cases"]:
            with self.assertRaises(DataError):
                load_report(ROOT / name for name in case["files"])
        self.assertEqual(before, {path: path.read_bytes() for path in paths})
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_cli_valid_run_from_another_directory(self):
        sample = ROOT / EXPECTED["reference"]["files"][0]
        completed = subprocess.run(
            [sys.executable, "-B", str(ROOT / "report.py"), str(sample)],
            cwd=self.directory, text=True, capture_output=True, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["totals"]["pence"], 10373)
        self.assertEqual(completed.stderr, "")

    def test_cli_failure_has_no_success_output(self):
        case = EXPECTED["negative_cases"][0]
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = main([str(ROOT / name) for name in case["files"]])
        self.assertEqual(status, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("MISSING_VALUE", stderr.getvalue())
        self.assertIn(":2 [unit_price]", stderr.getvalue())


def make_negative_case(case):
    def test(self):
        with self.assertRaises(DataError) as caught:
            load_report(ROOT / name for name in case["files"])
        issue = case["expected_issues"][0]
        self.assertEqual(caught.exception.code, issue["reason"])
        self.assertEqual(caught.exception.file, ROOT / issue["file"])
        self.assertEqual(caught.exception.line, issue["line"])
        self.assertEqual(caught.exception.field, issue["field"])
        if "first_occurrence" in issue:
            first = issue["first_occurrence"]
            self.assertEqual(caught.exception.first_occurrence, (ROOT / first["file"], first["line"]))
    return test


for fixture in EXPECTED["negative_cases"]:
    setattr(ReportTests, "test_fixture_" + fixture["id"], make_negative_case(fixture))


if __name__ == "__main__":
    unittest.main()
