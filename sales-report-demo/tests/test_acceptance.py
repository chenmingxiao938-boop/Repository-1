"""End-to-end acceptance of exported content and failure behavior."""
import contextlib
import csv
import io
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch, MagicMock

import app
from excel_report import export_xlsx, ExportError
from export_report import main
from report import COLUMNS, DataError, load_report
from test_excel_report import ROOT, VALID, cells


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "work").mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="stage5-tests-", dir=ROOT / "work")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def make_input(self, rows):
        path = self.directory / "input.csv"
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(COLUMNS)
            writer.writerows(rows)
        return path

    def test_unseen_export_every_line_and_both_groupings(self):
        baseline = json.loads((ROOT / "checks/stage5-unseen-expected.json").read_text())
        sources = [ROOT / name for name in baseline["files"]]
        with sources[0].open(encoding="utf-8-sig", newline="") as handle:
            inputs = list(csv.DictReader(handle))
        output = export_xlsx(load_report(sources), sources, self.directory / "unseen.xlsx")
        details, daily, products = (cells(output, n) for n in (1, 2, 3))
        expected_products = {}
        for row_number, row in enumerate(inputs, 9):
            amount = Decimal(row["quantity"]) * Decimal(row["unit_price"])
            self.assertEqual(details[f"A{row_number}"]["value"], row["line_id"])
            self.assertEqual(details[f"D{row_number}"]["value"], row["sku"])
            self.assertEqual(Decimal(details[f"H{row_number}"]["value"]), amount)
            expected_products[row["sku"]] = (int(row["quantity"]), amount)
        for row_number, (_, totals) in enumerate(sorted(baseline["daily"].items()), 9):
            self.assertEqual(int(daily[f"B{row_number}"]["value"]), totals["rows"])
            self.assertEqual(int(daily[f"C{row_number}"]["value"]), totals["quantity"])
            self.assertEqual(Decimal(daily[f"D{row_number}"]["value"]) * 100, totals["pence"])
        for row_number, (sku, (quantity, amount)) in enumerate(sorted(expected_products.items()), 9):
            self.assertEqual(products[f"A{row_number}"]["value"], sku)
            self.assertEqual(int(products[f"C{row_number}"]["value"]), quantity)
            self.assertEqual(Decimal(products[f"D{row_number}"]["value"]), amount)
        self.assertEqual(Decimal(details["H17"]["value"]) * 100, baseline["total_pence"])
        self.assertEqual(int(details["E17"]["value"]), baseline["quantity"])

    def test_repeated_runs_and_failure_preserve_old_report_and_sources(self):
        sources = list((ROOT / "samples").rglob("*.csv"))
        before = {p: p.read_bytes() for p in sources}
        output = self.directory / "report.xlsx"
        result = load_report(VALID)
        export_xlsx(result, VALID, output)
        initial = [cells(output, n) for n in (1, 2, 3)]
        export_xlsx(load_report(VALID), VALID, output)
        self.assertEqual(initial, [cells(output, n) for n in (1, 2, 3)])
        good_bytes = output.read_bytes()
        cases = json.loads((ROOT / "checks/expected.json").read_text())["negative_cases"]
        for case in cases:
            for destination in (output, self.directory / "absent.xlsx"):
                with self.subTest(case=case["id"], target=destination.name):
                    out, err = io.StringIO(), io.StringIO()
                    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                        status = main([*(str(ROOT / f) for f in case["files"]), "--output", str(destination)])
                    self.assertEqual(status, 1)
                    self.assertEqual(out.getvalue(), "")
                    self.assertIn(case["expected_issues"][0]["reason"], err.getvalue())
                    self.assertEqual(output.read_bytes(), good_bytes)
                    self.assertFalse((self.directory / "absent.xlsx").exists())
        self.assertEqual(before, {p: p.read_bytes() for p in sources})

    def test_corrected_copy_and_formula_like_identifier(self):
        source = self.make_input([["SYN-FIX", "INV-001", "2010-12-01", "000101", "2", "4.50", "GBP"],
                                  ["SYN-SECOND", "INV-001", "2010-12-01", "=1+1", "1", "0", "GBP"]])
        output = export_xlsx(load_report([source]), [source], self.directory / "fixed.xlsx")
        details = cells(output, 1)
        self.assertEqual(details["D9"]["value"], "000101")
        self.assertEqual(details["D10"], {"type": "inlineStr", "value": "=1+1", "formula": None})
        self.assertEqual(Decimal(details["H11"]["value"]), Decimal("9"))

    def test_excel_encoded_identifier_is_escaped_in_workbook_xml(self):
        source = self.make_input([["SYN-ENCODED", "INV-001", "2010-12-01", "_x0041_x0042_", "1", "1", "GBP"]])
        output = export_xlsx(load_report([source]), [source], self.directory / "encoded.xlsx")
        self.assertEqual(cells(output, 1)["D9"]["value"], "_x005F_x0041_x005F_x0042_")

    def test_invalid_source_filename_is_rejected_before_replacement(self):
        source = self.make_input([["SYN-FILENAME", "INV-001", "2010-12-01", "SKU", "1", "1", "GBP"]])
        invalid_name = self.directory / ("bad" + "\uffff" + ".csv")
        source.replace(invalid_name)
        output = self.directory / "filename.xlsx"
        output.write_bytes(b"previous report")
        with self.assertRaises(ExportError):
            export_xlsx(load_report([invalid_name]), [invalid_name], output)
        self.assertEqual(output.read_bytes(), b"previous report")

    def test_synthetic_and_custom_inputs_are_not_misattributed(self):
        source = ROOT / "samples/synthetic-valid/synthetic_leading_zero_and_zero_price.csv"
        output = export_xlsx(load_report([source]), [source], self.directory / "synthetic.xlsx")
        self.assertEqual(cells(output, 1)["A3"]["value"], "Synthetic Test Data")
        # Same public identifier, different price: the provenance must fail to match.
        altered = self.make_input([["UCI352-000001", "536365", "2010-12-01", "85123A", "6", "2.56", "GBP"]])
        output = export_xlsx(load_report([altered]), [altered], self.directory / "custom.xlsx")
        self.assertEqual(cells(output, 1)["A3"]["value"], "User-supplied data")

    def test_excel_precision_limit_rejects_before_creating_output(self):
        source = self.make_input([[f"BIG-{i}", "INV-001", "2010-12-01", "SKU", "1000000", "1000000.00", "GBP"] for i in range(10)])
        output = self.directory / "too_large.xlsx"
        with self.assertRaises(ExportError):
            export_xlsx(load_report([source]), [source], output)
        self.assertFalse(output.exists())

    def test_unrepresentable_excel_text_is_rejected(self):
        for sku in ("X\uffff", "X" * 32768):
            with self.subTest(length=len(sku)):
                source = self.make_input([["TEST", "INV-001", "2010-12-01", sku, "1", "1", "GBP"]])
                with self.assertRaises(DataError) as caught:
                    load_report([source])
                self.assertEqual(caught.exception.code, "INVALID_TEXT")

    def test_save_failure_preserves_previous_file_and_cleans_temp(self):
        output = self.directory / "report.xlsx"
        output.write_bytes(b"previous report")
        with patch("excel_report.Path.replace", side_effect=PermissionError("File is open")):
            with self.assertRaises(ExportError):
                export_xlsx(load_report(VALID), VALID, output)
        self.assertEqual(output.read_bytes(), b"previous report")
        self.assertEqual(list(self.directory.iterdir()), [output])

    def test_gui_success_then_error_does_not_show_old_success(self):
        output = self.directory / "gui.xlsx"
        bad = ROOT / "samples/invalid/missing_price/synthetic_missing_price.csv"
        with patch.object(app, "Tk", return_value=MagicMock()) as window, \
             patch.object(app.filedialog, "askopenfilenames", side_effect=[tuple(map(str, VALID)), (str(bad),)]), \
             patch.object(app.filedialog, "asksaveasfilename", return_value=str(output)), \
             patch.object(app.messagebox, "showinfo") as info, \
             patch.object(app.messagebox, "showerror") as error:
            app.run()
            original = output.read_bytes()
            app.run()
            self.assertEqual(info.call_count, 1)
            self.assertEqual(error.call_count, 1)
            self.assertIn("MISSING_VALUE", error.call_args.args[1])
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(window.return_value.destroy.call_count, 2)
