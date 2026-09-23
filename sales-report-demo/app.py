"""Small local file-picker interface for the sales report demo."""

from __future__ import annotations

from pathlib import Path
from tkinter import Tk, filedialog, messagebox

from excel_report import ExportError, export_xlsx
from report import DataError, load_report


def run() -> None:
    root = Tk()
    root.withdraw()
    root.update()
    files = filedialog.askopenfilenames(
        title="Select 1 to 5 sales CSV files",
        filetypes=[("CSV files", "*.csv")],
    )
    if not files:
        root.destroy()
        return
    destination = filedialog.asksaveasfilename(
        title="Save Excel sales report",
        defaultextension=".xlsx",
        filetypes=[("Excel workbook", "*.xlsx")],
        initialfile="sales_report.xlsx",
    )
    if not destination:
        root.destroy()
        return
    try:
        sources = tuple(Path(path) for path in files)
        report = load_report(sources)
        output = export_xlsx(report, sources, destination)
    except (DataError, ExportError) as exc:
        messagebox.showerror("Report not created", str(exc), parent=root)
    else:
        messagebox.showinfo("Report created", f"Saved to:\n{output.resolve()}", parent=root)
    finally:
        root.destroy()


if __name__ == "__main__":
    run()
