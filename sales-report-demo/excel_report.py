"""Write a small, dependency-free Excel sales report from a validated SalesReport."""

from __future__ import annotations

from dataclasses import dataclass
import csv
from datetime import date
from decimal import Decimal
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from typing import Iterable
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from report import SalesReport, PERIOD_START, PERIOD_END, read_items


class ExportError(Exception):
    """Raised when a report cannot be saved as an Excel workbook."""


@dataclass(frozen=True)
class _Cell:
    reference: str
    value: str | int | Decimal | date | None
    style: int = 0


SHEET_NAMES = ("Order Details", "Daily Sales", "Product Sales")
TITLE = "Sales Report"
DEMO_NOTE = "Public dataset demo — selected records"
SOURCE_NOTE = "Source: UCI Online Retail (Chen, 2015), CC BY 4.0. Selected records."
MAX_EXCEL_PENCE = 999_999_999_999_999


def _money(pence: int) -> Decimal:
    return Decimal(pence).scaleb(-2)


def _identity(item) -> tuple:
    return (item.line_id, item.order_id, item.order_date, item.sku,
            item.quantity, item.unit_price_pence, item.currency)


def _provenance(report: SalesReport) -> tuple[str, str]:
    """Attribute only exact matches to the bundled source records, never filenames."""
    root = Path(__file__).resolve().parent
    public_rows = set()
    for name in ("uci352_selected_original_fields.csv", "uci352_unseen_original_fields.csv"):
        with (root / "sources" / name).open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                month, day, year = row["InvoiceDate"].split()[0].split("/")
                public_rows.add((
                    f"UCI352-{int(row['source_record']):06d}", row["InvoiceNo"],
                    str(date(int(year), int(month), int(day))), row["StockCode"],
                    int(row["Quantity"]), int(Decimal(row["UnitPrice"]) * 100), "GBP",
                ))
    selected = {_identity(item) for item in report.items}
    if selected <= public_rows:
        return DEMO_NOTE, SOURCE_NOTE
    synthetic = root / "samples/synthetic-valid/synthetic_leading_zero_and_zero_price.csv"
    if selected <= {_identity(item) for item in read_items([synthetic])}:
        return "Synthetic Test Data", "Synthetic test records. No real customer transactions."
    return "User-supplied data", "Source not verified as UCI."


def _column_name(index: int) -> str:
    """Return Excel's one-based column name."""
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _cell_reference(row: int, column: int) -> str:
    return f"{_column_name(column)}{row}"


def _serial_day(value: date) -> int:
    """Return Excel's 1900-date-system serial, including its historical leap-day bug."""
    return (value - date(1899, 12, 30)).days


def _xml_text(value: object) -> str:
    text = str(value)
    for character in text:
        codepoint = ord(character)
        if not (codepoint in (0x9, 0xA, 0xD) or 0x20 <= codepoint <= 0xD7FF or 0xE000 <= codepoint <= 0xFFFD or 0x10000 <= codepoint <= 0x10FFFF):
            raise ExportError("Text contains a character that cannot be written to Excel XML.")
    text = re.sub(r"_(?=x[0-9A-Fa-f]{4}_)", "_x005F_", text)
    return escape(text, {"\"": "&quot;"})


def _cell_xml(cell: _Cell) -> str:
    style = f' s="{cell.style}"' if cell.style else ""
    if cell.value is None:
        return f'<c r="{cell.reference}"{style}/>'
    if isinstance(cell.value, date):
        return f'<c r="{cell.reference}"{style}><v>{_serial_day(cell.value)}</v></c>'
    if isinstance(cell.value, (int, Decimal)):
        return f'<c r="{cell.reference}"{style}><v>{_xml_text(cell.value)}</v></c>'
    return f'<c r="{cell.reference}"{style} t="inlineStr"><is><t>{_xml_text(cell.value)}</t></is></c>'


def _row_xml(row: int, cells: Iterable[_Cell]) -> str:
    height = ' ht="30" customHeight="1"' if row in (4, 5, 6, 7) else ""
    return f'<row r="{row}"{height}>' + "".join(_cell_xml(cell) for cell in cells) + "</row>"


def _metadata_rows(report: SalesReport, source_files: tuple[Path, ...]) -> list[str]:
    data_note, source_note = _provenance(report)
    return [
        _row_xml(2, [_Cell("A2", TITLE, 1)]),
        _row_xml(3, [_Cell("A3", data_note, 3)]),
        _row_xml(4, [
            _Cell("A4", "Period", 2),
            _Cell("B4", f"{PERIOD_START} to {PERIOD_END}", 10),
            _Cell("D4", "Currency", 2),
            _Cell("E4", "GBP"),
        ]),
        _row_xml(5, [
            _Cell("A5", "Source files", 2),
            _Cell("B5", f"{len(source_files)} CSV file(s); see Order Details.", 10),
            _Cell("D5", "Line count", 2),
            _Cell("E5", report.totals.rows, 5),
        ]),
        _row_xml(6, [_Cell("A6", source_note, 3)]),
        _row_xml(7, [_Cell("A7", "Snapshot. Edit the CSV and export again to update all sheets.", 3)]),
    ]


def _sheet_xml(rows: list[str], columns: list[tuple[float, int, int]],
               header_row: int, auto_filter: str | None = None) -> str:
    cols = "".join(
        f'<col min="{minimum}" max="{maximum}" width="{width}" customWidth="1"/>'
        for width, minimum, maximum in columns
    )
    filter_xml = f'<autoFilter ref="{auto_filter}"/>' if auto_filter else ""
    last_column = _column_name(max(5, max(maximum for _, _, maximum in columns)))
    merges = ("B4:C4", "B5:C5", f"A3:{last_column}3", f"A6:{last_column}6", f"A7:{last_column}7")
    merge_xml = '<mergeCells count="5">' + ''.join(f'<mergeCell ref="{ref}"/>' for ref in merges) + '</mergeCells>'
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="{header_row}" topLeftCell="A{header_row + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>{cols}</cols>
  <sheetData>{''.join(rows)}</sheetData>
  {filter_xml}
  {merge_xml}
  <pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>'''


def _order_details_sheet(report: SalesReport, source_files: tuple[Path, ...]) -> str:
    rows = _metadata_rows(report, source_files)
    headers = ("Line ID", "Order ID", "Order Date", "SKU", "Quantity", "Unit Price (GBP)", "Currency", "Line Amount (GBP)")
    rows.append(_row_xml(8, [_Cell(_cell_reference(8, index), header, 2) for index, header in enumerate(headers, 1)]))
    for row_number, item in enumerate(report.items, 9):
        amount = _money(item.amount_pence)
        rows.append(_row_xml(row_number, [
            _Cell(_cell_reference(row_number, 1), item.line_id),
            _Cell(_cell_reference(row_number, 2), item.order_id),
            _Cell(_cell_reference(row_number, 3), date.fromisoformat(item.order_date), 6),
            _Cell(_cell_reference(row_number, 4), item.sku),
            _Cell(_cell_reference(row_number, 5), item.quantity, 5),
            _Cell(_cell_reference(row_number, 6), _money(item.unit_price_pence), 4),
            _Cell(_cell_reference(row_number, 7), item.currency),
            _Cell(_cell_reference(row_number, 8), amount, 4),
        ]))
    total_row = 9 + len(report.items)
    rows.append(_row_xml(total_row, [
        _Cell(f"A{total_row}", "Total", 7),
        _Cell(f"E{total_row}", report.totals.quantity, 8),
        _Cell(f"H{total_row}", _money(report.totals.pence), 9),
    ]))
    rows.append(_row_xml(total_row + 2, [_Cell(f"A{total_row + 2}", "Source files", 2)]))
    for row_number, source in enumerate(source_files, total_row + 3):
        rows.append(_row_xml(row_number, [_Cell(f"A{row_number}", source.name)]))
    if _provenance(report)[0] == DEMO_NOTE:
        for row_number, text in enumerate((
            "Dataset: https://doi.org/10.24432/C5BW33",
            "License: https://creativecommons.org/licenses/by/4.0/",
            "Adaptation: selected invoice lines; date extracted; fields renamed; CustomerID omitted.",
        ), total_row + len(source_files) + 4):
            rows.append(_row_xml(row_number, [_Cell(f"A{row_number}", text)]))
    return _sheet_xml(
        rows,
        [(20, 1, 1), (14, 2, 2), (13, 3, 3), (14, 4, 4), (11, 5, 5), (17, 6, 6), (11, 7, 7), (19, 8, 8)],
        8, f"A8:H{total_row - 1}",
    )


def _daily_sales_sheet(report: SalesReport, source_files: tuple[Path, ...]) -> str:
    rows = _metadata_rows(report, source_files)
    headers = ("Date", "Selected Line Count", "Quantity", "Selected Sales (GBP)")
    rows.append(_row_xml(8, [_Cell(_cell_reference(8, index), header, 2) for index, header in enumerate(headers, 1)]))
    for row_number, (day, totals) in enumerate(report.by_date.items(), 9):
        rows.append(_row_xml(row_number, [
            _Cell(f"A{row_number}", date.fromisoformat(day), 6),
            _Cell(f"B{row_number}", totals.rows, 5),
            _Cell(f"C{row_number}", totals.quantity, 5),
            _Cell(f"D{row_number}", _money(totals.pence), 4),
        ]))
    total_row = 9 + len(report.by_date)
    rows.append(_row_xml(total_row, [
        _Cell(f"A{total_row}", "Total", 7),
        _Cell(f"B{total_row}", report.totals.rows, 8),
        _Cell(f"C{total_row}", report.totals.quantity, 8),
        _Cell(f"D{total_row}", _money(report.totals.pence), 9),
    ]))
    return _sheet_xml(rows, [(15, 1, 1), (20, 2, 2), (12, 3, 3), (21, 4, 4)], 8, f"A8:D{total_row - 1}")


def _product_sales_sheet(report: SalesReport, source_files: tuple[Path, ...]) -> str:
    rows = _metadata_rows(report, source_files)
    headers = ("SKU", "Selected Line Count", "Quantity", "Selected Sales (GBP)")
    rows.append(_row_xml(8, [_Cell(_cell_reference(8, index), header, 2) for index, header in enumerate(headers, 1)]))
    for row_number, (sku, totals) in enumerate(report.by_sku.items(), 9):
        rows.append(_row_xml(row_number, [
            _Cell(f"A{row_number}", sku),
            _Cell(f"B{row_number}", totals.rows, 5),
            _Cell(f"C{row_number}", totals.quantity, 5),
            _Cell(f"D{row_number}", _money(totals.pence), 4),
        ]))
    total_row = 9 + len(report.by_sku)
    rows.append(_row_xml(total_row, [
        _Cell(f"A{total_row}", "Total", 7),
        _Cell(f"B{total_row}", report.totals.rows, 8),
        _Cell(f"C{total_row}", report.totals.quantity, 8),
        _Cell(f"D{total_row}", _money(report.totals.pence), 9),
    ]))
    return _sheet_xml(rows, [(16, 1, 1), (20, 2, 2), (12, 3, 3), (21, 4, 4)], 8, f"A8:D{total_row - 1}")


def _content_types_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''


def _styles_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="£#,##0.00"/></numFmts>
  <fonts count="5">
    <font><sz val="10"/><name val="Arial"/></font>
    <font><sz val="10"/><i/><color rgb="FF666666"/><name val="Arial"/></font>
    <font><sz val="14"/><b/><name val="Arial"/></font>
    <font><sz val="10"/><b/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><sz val="10"/><b/><name val="Arial"/></font>
  </fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyBorder="1" applyFont="1"/>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
</styleSheet>'''


def _workbook_xml() -> str:
    sheets = "".join(
        f'<sheet name="{name}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(SHEET_NAMES, 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr date1904="0"/><sheets>{sheets}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>
</workbook>'''


def _workbook_relationships_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''


def _root_relationships_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''


def _core_properties_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Sales Report Demo</dc:creator><dc:title>Sales Report</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">2010-12-05T00:00:00Z</dcterms:created>
</cp:coreProperties>'''


def _app_properties_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Sales Report Demo</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>3</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="3" baseType="lpstr"><vt:lpstr>Order Details</vt:lpstr><vt:lpstr>Daily Sales</vt:lpstr><vt:lpstr>Product Sales</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>'''


def export_xlsx(report: SalesReport, source_files: Iterable[str | Path], output_path: str | Path) -> Path:
    """Save a validated report as a three-sheet XLSX file and return its path."""
    sources = tuple(Path(path) for path in source_files)
    destination = Path(output_path)
    if destination.suffix.lower() != ".xlsx":
        raise ExportError("Output file must end with .xlsx.")
    if not sources:
        raise ExportError("At least one source CSV is required.")
    if not report.items or report.totals.pence > MAX_EXCEL_PENCE:
        raise ExportError("Excel export requires data and a total at most GBP 9999999999999.99 to preserve pennies.")
    if destination.resolve() in {path.resolve() for path in sources}:
        raise ExportError("Output must not overwrite an input file.")
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(prefix="sales-report-", suffix=".xlsx", dir=destination.parent, delete=False) as handle:
            temporary = Path(handle.name)
        try:
            with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as archive:
                archive.writestr("[Content_Types].xml", _content_types_xml())
                archive.writestr("_rels/.rels", _root_relationships_xml())
                archive.writestr("docProps/core.xml", _core_properties_xml())
                archive.writestr("docProps/app.xml", _app_properties_xml())
                archive.writestr("xl/workbook.xml", _workbook_xml())
                archive.writestr("xl/_rels/workbook.xml.rels", _workbook_relationships_xml())
                archive.writestr("xl/styles.xml", _styles_xml())
                archive.writestr("xl/worksheets/sheet1.xml", _order_details_sheet(report, sources))
                archive.writestr("xl/worksheets/sheet2.xml", _daily_sales_sheet(report, sources))
                archive.writestr("xl/worksheets/sheet3.xml", _product_sales_sheet(report, sources))
            temporary.replace(destination)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    except OSError as exc:
        raise ExportError(f"Could not save report: {exc}") from exc
    return destination
