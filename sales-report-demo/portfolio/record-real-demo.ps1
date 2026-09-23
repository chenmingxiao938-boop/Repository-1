param([switch]$Fast)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$salesPython = 'C:\Users\Ming\AppData\Local\Python\pythoncore-3.14-64\python.exe'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $project "work\recording-demo-$stamp.xlsx"
$badOutput = Join-Path $project "work\recording-invalid-$stamp.xlsx"
$delay = if ($Fast) { 1 } else { 9 }

 $form = $null
 $outputBox = $null

function Write-Run([string]$text, [string]$color = 'White') {
    if ($Fast) {
        Write-Host $text
        return
    }
    $palette = @{
        Cyan = [System.Drawing.Color]::FromArgb(93, 205, 255)
        Gray = [System.Drawing.Color]::FromArgb(184, 197, 211)
        Yellow = [System.Drawing.Color]::FromArgb(255, 213, 102)
        Green = [System.Drawing.Color]::FromArgb(134, 239, 172)
        Red = [System.Drawing.Color]::FromArgb(252, 165, 165)
        White = [System.Drawing.Color]::White
    }
    $outputBox.SelectionColor = $palette[$color]
    $outputBox.AppendText($text + [Environment]::NewLine)
    $outputBox.ScrollToCaret()
    $form.Refresh()
    [System.Windows.Forms.Application]::DoEvents()
}

function Clear-Run {
    if (-not $Fast) {
        $outputBox.Clear()
        $form.Refresh()
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Invoke-PythonText([string[]]$PythonArguments) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $text = (& $salesPython @PythonArguments 2>&1 | Out-String).Trim()
        return [PSCustomObject]@{
            Text = $text
            ExitCode = $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

if (-not $Fast) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Sales Report Demo - Real Local Run'
    $form.FormBorderStyle = 'None'
    $form.WindowState = 'Maximized'
    $form.BackColor = [System.Drawing.Color]::FromArgb(15, 31, 48)
    $form.TopMost = $true
    $outputBox = New-Object System.Windows.Forms.RichTextBox
    $outputBox.Dock = 'Fill'
    $outputBox.ReadOnly = $true
    $outputBox.BorderStyle = 'None'
    $outputBox.BackColor = [System.Drawing.Color]::FromArgb(15, 31, 48)
    $outputBox.ForeColor = [System.Drawing.Color]::White
    $outputBox.Font = New-Object System.Drawing.Font('Consolas', 20)
    $outputBox.Margin = New-Object System.Windows.Forms.Padding(90, 80, 90, 80)
    $form.Controls.Add($outputBox)
    $form.Show()
}

Clear-Run
Write-Run 'SALES REPORT DEMO' 'Cyan'
Write-Run 'Real local CSV validation and Excel export' 'Gray'
Write-Run ''
Start-Sleep -Seconds ($delay + 5)

Set-Location -LiteralPath $project
$salesInputs = @(Get-ChildItem -LiteralPath '.\samples\valid' -Filter '*.csv' | Sort-Object Name | Select-Object -ExpandProperty FullName)
Write-Run '1. Source CSV files selected:' 'Yellow'
$salesInputs | ForEach-Object { Write-Run ('   ' + (Split-Path -Leaf $_)) }
Start-Sleep -Seconds $delay

Write-Run ''
Write-Run '2. Running the actual exporter...' 'Yellow'
$validRun = Invoke-PythonText (@('-B', '.\export_report.py') + $salesInputs + @('--output', $output))
if ($validRun.ExitCode -ne 0) { throw 'The valid-data export failed.' }
$validText = $validRun.Text
Write-Run $validText 'Green'
Write-Run 'Workbook created from the selected CSV files.' 'Green'
Start-Sleep -Seconds $delay

$inspectionCode = @'
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def cell_text(cell, shared):
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        return "".join(cell.itertext())
    value = cell.findtext(namespace + "v", default="")
    return shared[int(value)] if kind == "s" and value else value

with zipfile.ZipFile(sys.argv[1]) as archive:
    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(item.itertext()) for item in root.findall(namespace + "si")]
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet_names = [sheet.attrib["name"] for sheet in workbook.findall(namespace + "sheets/" + namespace + "sheet")]
    for number, sheet_name in enumerate(sheet_names, start=1):
        root = ET.fromstring(archive.read(f"xl/worksheets/sheet{number}.xml"))
        rows = []
        for row in root.findall(namespace + "sheetData/" + namespace + "row"):
            values = [cell_text(cell, shared) for cell in row.findall(namespace + "c")]
            if any(value.startswith("Public dataset demo") for value in values):
                continue
            rows.append(values)
        header_index = next(
            index for index, values in enumerate(rows)
            if "Line ID" in values or "Date" in values or "SKU" in values
        )
        preview = rows[:1] + rows[header_index:header_index + 3] + rows[-1:]
        print(f"[{sheet_name}]")
        for values in preview:
            print(" | ".join(values))
        print()
'@
$inspectionRun = Invoke-PythonText @('-B', '-c', $inspectionCode, $output)
if ($inspectionRun.ExitCode -ne 0) { throw 'The generated workbook could not be inspected.' }
$inspectionText = $inspectionRun.Text

foreach ($sheetName in @('Order Details', 'Daily Sales', 'Product Sales')) {
    Clear-Run
    Write-Run '3. Reading the generated workbook...' 'Yellow'
    Write-Run "Actual worksheet: $sheetName" 'Cyan'
    $section = [regex]::Match($inspectionText, "(?s)\[$([regex]::Escape($sheetName))\]\r?\n(.*?)(?=\r?\n\[|$)").Groups[1].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($section)) { throw "Worksheet preview missing: $sheetName" }
    Write-Run $section 'White'
    Start-Sleep -Seconds $delay
}

Clear-Run
Write-Run '3. Invalid input is blocked before any report is created.' 'Yellow'
$badRun = Invoke-PythonText @('-B', '.\export_report.py', '.\samples\invalid\missing_price\synthetic_missing_price.csv', '--output', $badOutput)
if ($badRun.ExitCode -ne 1) { throw 'The invalid-data export did not fail as expected.' }
$badText = $badRun.Text
if (Test-Path -LiteralPath $badOutput) { throw 'The invalid-data export created a workbook.' }
Write-Run $badText 'Red'
Write-Run ''
Write-Run 'No workbook was created for the invalid CSV.' 'Green'
Write-Run 'Fixed-format CSV reporting demo; not an accounting system.' 'Gray'
Start-Sleep -Seconds ($delay + 6)
if (-not $Fast) { $form.Close() }
