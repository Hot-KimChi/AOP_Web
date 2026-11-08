"""measSetInput 엑셀 파일 입출력(서버 파일시스템 대신 업로드/다운로드).

- 원본 cmdOpen_Click: ``.xls`` 가 이름에 있으면 ACE OLEDB 로 ``[Sheet1$A1:AA402]``(HDR=YES),
  아니면 첫 줄 헤더·쉼표 분리 27열 텍스트.
- 원본 cmdSaveMat_Click: Excel COM 으로 헤더+값 저장 → xlsx 바이트를 만들어 내려준다.
openpyxl 이 설치돼 있지 않으므로 표준 라이브러리(zipfile + ElementTree)로 최소 구현한다.
"""

from __future__ import annotations

import io
import posixpath
import re
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

from .excel_vb import MsiExcelError, cstr

NCOLS = 27            # A..AA
LAST_ROW = 402        # A1:AA402
MAX_XML_BYTES = 64 * 1024 * 1024
MAX_CSV_ROWS = 20000

_M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _col_index(ref: str) -> int:
    letters = re.match(r"[A-Za-z]+", ref or "")
    if not letters:
        return -1
    n = 0
    for ch in letters.group(0).upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _row_index(ref: str) -> int:
    m = re.search(r"(\d+)$", ref or "")
    return int(m.group(1)) if m else -1


def _read(z: zipfile.ZipFile, name: str) -> bytes:
    try:
        info = z.getinfo(name)
    except KeyError:
        raise MsiExcelError(f"엑셀 파일 구조가 올바르지 않습니다({name} 없음).") from None
    if info.file_size > MAX_XML_BYTES:
        raise MsiExcelError("엑셀 시트가 너무 커서 읽을 수 없습니다.")
    return z.read(info)


def _number(text: str):
    v = float(text)
    if v == int(v) and abs(v) < 1e15:
        return int(v)
    return v


def _shared_strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(_read(z, "xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f"{_M}si"):
        parts = []
        for child in si:
            if child.tag == f"{_M}t":
                parts.append(child.text or "")
            elif child.tag == f"{_M}r":
                for t in child.findall(f"{_M}t"):
                    parts.append(t.text or "")
        out.append("".join(parts))
    return out


def _sheet1_path(z: zipfile.ZipFile) -> str:
    wb = ET.fromstring(_read(z, "xl/workbook.xml"))
    rid = None
    sheets = wb.find(f"{_M}sheets")
    for sh in (sheets if sheets is not None else []):
        if (sh.get("name") or "").lower() == "sheet1":
            rid = sh.get(f"{_R}id")
            break
    if rid is None:
        raise MsiExcelError("'Sheet1' 시트를 찾을 수 없습니다. (원본은 [Sheet1$A1:AA402] 를 읽습니다)")
    rels = ET.fromstring(_read(z, "xl/_rels/workbook.xml.rels"))
    for rel in rels.findall(f"{_PR}Relationship"):
        if rel.get("Id") == rid:
            target = rel.get("Target") or ""
            if target.startswith("/"):
                return target.lstrip("/")
            return posixpath.normpath(posixpath.join("xl", target))
    raise MsiExcelError("Sheet1 시트 경로를 찾을 수 없습니다.")


def _cell_value(c, shared: list[str]):
    t = c.get("t") or "n"
    v = c.find(f"{_M}v")
    text = v.text if v is not None else None
    if t == "inlineStr":
        is_ = c.find(f"{_M}is")
        if is_ is None:
            return None
        return "".join(x.text or "" for x in is_.iter(f"{_M}t"))
    if text is None:
        return None
    if t == "s":
        try:
            return shared[int(text)]
        except (ValueError, IndexError):
            return None
    if t == "b":
        return text.strip() == "1"
    if t in ("str", "d"):
        return text
    if t == "e":
        return None
    try:
        return _number(text)
    except ValueError:
        return text


def _header_names(values: list) -> list[str]:
    names, seen = [], set()
    for i, v in enumerate(values):
        name = cstr(v) if v is not None and cstr(v) != "" else f"F{i + 1}"
        base, k = name, 1
        while name in seen:
            name = f"{base}{k}"
            k += 1
        seen.add(name)
        names.append(name)
    return names


def read_xlsx(data: bytes) -> dict:
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise MsiExcelError("xlsx 형식이 아닙니다. (.xls 97-2003 형식은 Excel 에서 .xlsx 로 저장 후 여십시오)") from None
    with z:
        shared = _shared_strings(z)
        root = ET.fromstring(_read(z, _sheet1_path(z)))
    grid: dict[int, list] = {}
    data_el = root.find(f"{_M}sheetData")
    for row in (data_el if data_el is not None else []):
        r = _row_index(row.get("r") or "")
        if r < 1 or r > LAST_ROW:
            continue
        vals = grid.setdefault(r, [None] * NCOLS)
        seq = 0
        for c in row.findall(f"{_M}c"):
            ci = _col_index(c.get("r") or "")
            if ci < 0:
                ci = seq
            seq = ci + 1
            if ci < NCOLS:
                vals[ci] = _cell_value(c, shared)
    columns = _header_names(grid.get(1, [None] * NCOLS))
    last = max((r for r, v in grid.items() if r > 1 and any(x is not None and x != "" for x in v)), default=1)
    rows = [grid.get(r, [None] * NCOLS) for r in range(2, last + 1)]
    return {"columns": columns, "rows": rows}


def read_csv_text(data: bytes) -> dict:
    text = data.decode("utf-8-sig", errors="replace")
    lines = re.split(r"\r\n|\r|\n", text)
    if lines and lines[-1] == "":
        lines.pop()
    if not lines:
        raise MsiExcelError("파일이 비어 있습니다.")
    if len(lines) > MAX_CSV_ROWS:
        raise MsiExcelError(f"행이 너무 많습니다(최대 {MAX_CSV_ROWS}).")
    head = lines[0].split(",")
    if len(head) < NCOLS:
        raise MsiExcelError(f"Index was outside the bounds of the array. (헤더 열이 {NCOLS}개 미만: {len(head)}개)")
    columns = []
    for i, h in enumerate(head[:NCOLS]):
        name = h if h != "" else f"Column{i + 1}"
        if name in columns:
            raise MsiExcelError(f"A column named '{name}' already belongs to this DataTable.")
        columns.append(name)
    rows = []
    for no, line in enumerate(lines[1:], start=2):
        parts = line.split(",")
        if len(parts) < NCOLS:
            raise MsiExcelError(f"Index was outside the bounds of the array. ({no}번째 줄 열 {len(parts)}개)")
        rows.append(parts[:NCOLS])
    return {"columns": columns, "rows": rows}


def read_xls(data: bytes) -> dict:
    """``.xls``(BIFF, 97-2003): 원본 ACE OLEDB ``[Sheet1$A1:AA402]`` HDR=YES 와 같은 범위를 읽는다."""
    import xlrd

    try:
        book = xlrd.open_workbook(file_contents=data, on_demand=True)
    except Exception as exc:  # noqa: BLE001 - xlrd 는 손상 파일에 XLRDError·CompDocError 등 다양한 예외를 던진다
        raise MsiExcelError(f".xls 파일을 읽을 수 없습니다: {exc}") from None
    try:
        names = {n.lower(): n for n in book.sheet_names()}
        if "sheet1" not in names:
            raise MsiExcelError("'Sheet1' 시트를 찾을 수 없습니다. (원본은 [Sheet1$A1:AA402] 를 읽습니다)")
        sh = book.sheet_by_name(names["sheet1"])
        nrows, ncols = min(sh.nrows, LAST_ROW), min(sh.ncols, NCOLS)

        def value(r: int, c: int):
            if c >= ncols:
                return None
            cell = sh.cell(r, c)
            if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR):
                return None
            if cell.ctype == xlrd.XL_CELL_BOOLEAN:
                return bool(cell.value)
            if cell.ctype in (xlrd.XL_CELL_NUMBER, xlrd.XL_CELL_DATE):
                return _number(repr(float(cell.value)))
            return cell.value

        grid = [[value(r, c) for c in range(NCOLS)] for r in range(nrows)]
    finally:
        book.release_resources()
    columns = _header_names(grid[0] if grid else [None] * NCOLS)
    body = grid[1:]
    while body and not any(x is not None and x != "" for x in body[-1]):
        body.pop()
    return {"columns": columns, "rows": body}


def parse_upload(filename: str, data: bytes) -> dict:
    """원본 ``InStr(outputName, ".xls") > 0`` 분기 그대로(.xls BIFF 와 .xlsx 모두 지원)."""
    if ".xls" in (filename or ""):
        if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            return read_xls(data)
        return read_xlsx(data)
    return read_csv_text(data)


# ---------------------------------------------------------------- xlsx 쓰기

_ILLEGAL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
_NUM_TEXT = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def _col_name(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _cell_xml(ref: str, value) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return f'<c r="{ref}" t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)):
        if value != value or value in (float("inf"), float("-inf")):
            return ""
        return f'<c r="{ref}"><v>{repr(value) if isinstance(value, float) else value}</v></c>'
    s = str(value)
    if _NUM_TEXT.match(s):
        # Excel COM 의 Range.Value = "3.5" 는 숫자로 해석된다.
        return f'<c r="{ref}"><v>{float(s)!r}</v></c>' if not s.lstrip("+-").isdigit() else f'<c r="{ref}"><v>{int(s)}</v></c>'
    s = _ILLEGAL.sub("", s)
    space = ' xml:space="preserve"' if s != s.strip() or "  " in s else ""
    return f'<c r="{ref}" t="inlineStr"><is><t{space}>{escape(s)}</t></is></c>'


def write_xlsx(columns: list, rows: list) -> bytes:
    lines = []
    all_rows = [list(columns)] + [list(r) for r in rows]
    for ri, row in enumerate(all_rows, start=1):
        cells = "".join(_cell_xml(f"{_col_name(ci)}{ri}", v) for ci, v in enumerate(row))
        lines.append(f'<row r="{ri}">{cells}</row>')
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(lines)}</sheetData></worksheet>'
    )
    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '</Types>'
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '</Relationships>'
        ),
        "xl/styles.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            '<borders count="1"><border/></borders>'
            '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
            '<cellXfs count="1"><xf xfId="0"/></cellXfs>'
            '</styleSheet>'
        ),
        "xl/worksheets/sheet1.xml": sheet,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buf.getvalue()
