"""Tests for the fourth-stage Excel export."""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from excel_report import ExportError, export_xlsx
from export_report import main
from report import load_report


ROOT = Path(__file__).resolve().parents[1]
VALID = sorted((ROOT / "samples" / "valid").glob("*.csv"))
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def sheet_names(path: Path) -> list[str]:
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read("xl/workbook.xml"))
    return [sheet.attrib["name"] for sheet in root.findall("x:sheets/x:sheet", NS)]


def cells(path: Path, sheet_number: int) -> dict[str, dict[str, str | None]]:
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read(f"xl/worksheets/sheet{sheet_number}.xml"))
    result: dict[str, dict[str, str | None]] = {}
    for cell in root.findall(".//x:c", NS):
        text = cell.findtext("x:is/x:t", namespaces=NS)
        result[cell.attrib["r"]] = {
            "type": cell.attrib.get("t"),
            "value": text if text is not None else cell.findtext("x:v", namespaces=NS),
            "formula": cell.findtext("x:f", namespaces=NS),
        }
    return result


class ExcelReportTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "work").mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="stage4-tests-", dir=ROOT / "work")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def test_normal_batch_creates_a_readable_three_sheet_report(self):
        report = load_report(VALID)
        output = export_xlsx(report, VALID, self.directory / "sales_report.xlsx")

        self.assertEqual(sheet_names(output), ["Order Details", "Daily Sales", "Product Sales"])
        details, daily, products = cells(output, 1), cells(output, 2), cells(output, 3)
        self.assertEqual(details["A2"]["value"], "Sales Report")
        self.assertEqual(details["A3"]["value"], "Public dataset demo — selected records")
        self.assertEqual(details["A8"]["value"], "Line ID")
        self.assertEqual(details["D9"]["value"], "85123A")
        self.assertEqual(details["H9"], {"type": None, "value": "15.30", "formula": None})
        self.assertEqual(details["E93"], {"type": None, "value": "1503", "formula": None})
        self.assertEqual(details["H93"], {"type": None, "value": "4201.25", "formula": None})
        self.assertEqual(daily["D13"], {"type": None, "value": "4201.25", "formula": None})
        self.assertEqual(products["D74"], {"type": None, "value": "4201.25", "formula": None})
        self.assertEqual(details["A96"]["value"], "orders_2010-12-01.csv")

    def test_leading_zero_sku_remains_text(self):
        source = ROOT / "samples" / "synthetic-valid" / "synthetic_leading_zero_and_zero_price.csv"
        output = export_xlsx(load_report([source]), [source], self.directory / "leading_zero.xlsx")
        details = cells(output, 1)
        self.assertEqual(details["D9"], {"type": "inlineStr", "value": "000101", "formula": None})
        self.assertEqual(details["H10"], {"type": None, "value": "0.00", "formula": None})

    def test_export_rejects_a_non_excel_destination(self):
        report = load_report(VALID)
        with self.assertRaises(ExportError):
            export_xlsx(report, VALID, self.directory / "report.csv")
        self.assertFalse((self.directory / "report.csv").exists())

    def test_export_does_not_change_source_csv_files(self):
        before = {path: path.read_bytes() for path in VALID}
        export_xlsx(load_report(VALID), VALID, self.directory / "report.xlsx")
        self.assertEqual(before, {path: path.read_bytes() for path in VALID})

    def test_command_line_invalid_input_creates_no_report(self):
        invalid = ROOT / "samples" / "invalid" / "missing_price" / "synthetic_missing_price.csv"
        output = self.directory / "should_not_exist.xlsx"
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = main([str(invalid), "--output", str(output)])
        self.assertEqual(status, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("MISSING_VALUE", stderr.getvalue())
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
