"""VB.NET(Option Strict Off) 변환 의미를 재현하는 헬퍼 — measSetInput(msiReader) 이식용.

- ``cstr``: CStr(Double) = Double.ToString("G")(15자리), CStr(Single) = 7자리.
- ``vb_str``: Str() — 음수가 아니면 앞에 공백, "0.5" → " .5"(StdFormat).
- ``vb_val``: Val() — 앞쪽 숫자만 읽고 공백은 무시, 숫자가 없으면 0.
- ``cdbl``: CDbl(String) — 숫자가 아니면 원본은 예외로 중단되므로 ``MsiExcelError``.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import numpy as np


class MsiExcelError(ValueError):
    """원본 MsgBox + Exit Sub(또는 원본 예외 중단)에 해당한다. 메시지는 사용자에게 그대로 보인다."""


class Single(float):
    """VB Single(float32) 값 표시."""

    def __new__(cls, value):
        return float.__new__(cls, float(np.float32(value)))


def f32(value) -> Single:
    return Single(value)


def _fmt_g(x: float, digits: int) -> str:
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    return format(x, f".{digits}G")


def cstr(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, Single):
        return _fmt_g(float(value), 7)
    if isinstance(value, np.floating):
        return _fmt_g(float(value), 7 if value.dtype == np.float32 else 15)
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, float):
        return _fmt_g(value, 15)
    if isinstance(value, Decimal):
        return format(value, "f") if value == value.to_integral_value() else str(value.normalize())
    return str(value)


def _std_format(s: str) -> str:
    if s.startswith("0."):
        return s[1:]
    if s.startswith("-0."):
        return "-" + s[2:]
    return s


def vb_str(value) -> str:
    s = _std_format(cstr(value))
    return s if s.startswith("-") else " " + s


_VAL_RE = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?")


def vb_val(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool):
        return float(value)
    s = re.sub(r"[ \t\r\n]", "", cstr(value))
    m = _VAL_RE.match(s)
    if not m:
        return 0.0
    try:
        return float(m.group(0).replace("d", "e").replace("D", "E"))
    except (ValueError, OverflowError):
        return 0.0


def cdbl(value, what: str = "") -> float:
    if isinstance(value, bool):
        return -1.0 if value else 0.0
    if isinstance(value, (int, float, np.integer, np.floating)):
        return float(value)
    s = "" if value is None else str(value).strip()
    low = s.lower()
    if low in ("infinity", "-infinity", "nan"):
        return float(low.replace("infinity", "inf"))
    try:
        if "_" in s or low in ("inf", "-inf", "+inf"):
            raise ValueError
        return float(s.replace(",", ""))
    except ValueError:
        suffix = f" ({what})" if what else ""
        raise MsiExcelError(f"Conversion from string \"{s}\" to type 'Double' is not valid.{suffix}") from None


def vb_div(a: float, b: float) -> float:
    """VB Double 나눗셈: 0 으로 나누면 Infinity/NaN(예외 없음)."""
    a, b = float(a), float(b)
    if b == 0:
        if a == 0 or math.isnan(a):
            return math.nan
        return math.copysign(math.inf, a) * (math.copysign(1.0, b))
    return a / b


def vb_floor(x: float) -> float:
    if math.isnan(x) or math.isinf(x):
        return x
    return float(math.floor(x))


def vb_trim(s: str) -> str:
    return (s or "").strip(" \u3000")


def vb_instr(hay, needle, text_compare: bool = False) -> int:
    hay = hay or ""
    needle = needle or ""
    if hay == "":
        return 0
    if needle == "":
        return 1
    if text_compare:
        hay, needle = hay.lower(), needle.lower()
    return hay.find(needle) + 1


def split_keep(s: str) -> list[str]:
    """VB ``Split(s, " ")`` — 빈 항목 유지, 빈 문자열은 [""]."""
    return (s or "").split(" ")


def split_nonempty(s: str) -> list[str]:
    """``s.Split({" "c}, StringSplitOptions.RemoveEmptyEntries)``."""
    return [p for p in (s or "").split(" ") if p != ""]


_SQL_NUM_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def sql_num(text, what: str) -> Decimal:
    """원본이 SQL 문자열에 그대로 이어 붙이던 숫자 리터럴을 파라미터(Decimal)로 바꾼다.
    Decimal 은 SQL 리터럴(numeric)과 같은 형 변환 규칙으로 비교된다."""
    s = cstr(text).strip()
    if not _SQL_NUM_RE.match(s):
        raise MsiExcelError(f"{what} 값 '{s}' 이(가) 숫자가 아니어서 조회할 수 없습니다.")
    try:
        return Decimal(s)
    except InvalidOperation:
        raise MsiExcelError(f"{what} 값 '{s}' 이(가) 숫자가 아닙니다.") from None


def db_number(x: float):
    """ADO Field.Value = Val(...) 대입값. 정수면 int 로 넘긴다."""
    x = float(x)
    if math.isnan(x) or math.isinf(x):
        raise MsiExcelError("숫자 필드에 Infinity/NaN 값을 저장할 수 없습니다.")
    if x == int(x) and abs(x) < 2**53:
        return int(x)
    return x


def decimal_5(x: float) -> str:
    """``CDec(double).ToString("0.00000")``(15자리 반올림 후 소수 5자리, AwayFromZero)."""
    if math.isnan(x) or math.isinf(x):
        raise MsiExcelError("Value was either too large or too small for a Decimal.")
    d = Decimal(format(x, ".15G"))
    return str(d.quantize(Decimal("0.00001"), rounding=ROUND_HALF_UP))


def cell_text(value) -> str | None:
    """DataGridView 셀 → String 대입(CStr). DBNull 은 None."""
    if value is None:
        return None
    return cstr(value)


def bool_cell(value) -> str | None:
    """Excel 불리언 셀(True/False)을 원본 Val("True")=0 결함 없이 "1"/"0" 으로 정규화."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "1" if value else "0"
    s = cstr(value)
    if s.strip().lower() == "true":
        return "1"
    if s.strip().lower() == "false":
        return "0"
    return s
