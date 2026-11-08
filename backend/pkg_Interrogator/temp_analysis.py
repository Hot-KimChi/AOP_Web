"""레거시 frmTemp(intTemp) · frmTemp10 · frmWobbler 의 순수 계산 로직.

DB 접근은 ``routes/interrogator_temp.py`` 가 담당하고, 이 모듈은 VB 의 그래프 데이터
계산·문자열 포맷·MATLAB 대체 fitting 만 담는다(테스트 가능하도록 DB 무관).
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
from scipy.optimize import minimize

from .temperature_fit import FitInputError, FitResult, _as_vector, _safe_objective, temp10_model

TAB = "\t"
GRAPH_MEAS_SET = {"Spectrum": "1", "Voltage": "4", "HPSF": "3", "TrSpectrum": "14"}
GRAPH_TITLES = {
    "Spectrum": ("Temperature vs. Frequency", "Frequency", "TempRise"),
    "Voltage": ("Temperature vs. Frequency w/ Voltages", "Frequency", "TempRise"),
    "HPSF": ("Temperature vs. Aperture", "azAperCm", "normTempRise"),
    "TrSpectrum": ("Temperature Spectrum", "Frequency", "normTempRise"),
}
SPEC_LEN = 64


# ─── lstFreq 항목 ────────────────────────────────────────────────────────────


def vb_trim(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def vb_cdbl_text(value) -> str:
    """``CDbl(Trim(x))`` 를 문자열로 붙일 때의 표기(정수면 소수점 없음)."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return vb_trim(value)
    return str(int(v)) if v.is_integer() else repr(v)


def lst_item(row: Sequence, cdbl_fm: bool = False) -> str:
    """``vbTab & id & vbTab & mSetNum & ... & vbTab & mark`` (Params 1..7)."""
    tid, ms, elev, pt, fmv, az, mark = row
    fm = vb_cdbl_text(fmv) if cdbl_fm else vb_trim(fmv)
    return TAB.join(["", vb_trim(tid), vb_trim(ms), vb_trim(elev), vb_trim(pt), fm, vb_trim(az),
                     "" if mark is None else str(mark)])


def parse_item(item: str) -> list[str]:
    parts = item.split(TAB)
    if len(parts) < 7:
        raise FitInputError("lstFreq 항목 형식이 올바르지 않습니다.")
    return [p.strip() for p in parts]


def edit_menu_text(item: str) -> str:
    p = parse_item(item)
    return (f"TempId:  {p[1]},   mSetNum:  {p[2]},   PulseT:  {p[4]},   Fm/Volt:  {p[5]},"
            f"   AzAperS:  {p[6]},   ElevIndex:  {p[3]}")


def parse_edit_menu(text: str) -> dict:
    """mnuEditGraph 항목 문자열 → {tempId, mSetNum, pulseT, fmVolt, azAperS, elevIndex}."""
    keys = ["tempId", "mSetNum", "pulseT", "fmVolt", "azAperS", "elevIndex"]
    parts = text.split(",")
    if len(parts) != 6:
        raise FitInputError("편집 데이터셋 형식이 올바르지 않습니다.")
    return {k: p.split(":", 1)[1].strip() if ":" in p else "" for k, p in zip(keys, parts)}


# ─── 수치 헬퍼 ───────────────────────────────────────────────────────────────


def vb_str(v: float) -> str:
    """VB ``Str(Double)``: 양수는 선행 공백, 0.x 의 선행 0 생략, 지수는 ``E-05``."""
    v = float(v)
    if not math.isfinite(v):
        return " NaN" if v != v else (" Infinity" if v > 0 else "-Infinity")
    s = format(v, ".15g")
    if "e" in s:
        mant, exp = s.split("e")
        s = f"{mant}E{exp[0]}{exp[1:].zfill(2)}"
    if s.startswith("0."):
        s = s[1:]
    elif s.startswith("-0."):
        s = "-" + s[2:]
    return s if v < 0 else " " + s


def vb_val(text: str) -> float:
    """VB ``Val``: 앞부분의 숫자만 읽고 실패하면 0."""
    t = (text or "").strip()
    best = 0.0
    for end in range(len(t), 0, -1):
        try:
            return float(t[:end])
        except ValueError:
            continue
    return best


def vb_cshort(x: float) -> int:
    """VB ``CShort``: 은행가 반올림(짝수 쪽)."""
    return int(round(x))


def neighbor_index(a: Sequence[float], v: float) -> int:
    n = len(a)
    i = 0
    while i < n - 1 and a[i] < v:
        i += 1
    if i == 0 and a[0] >= v:
        return 0
    if i < n - 1 and a[i - 1] < v <= a[i]:
        return i - 1
    return i


def array_interp(x1: Sequence[float], y1: Sequence[float], x2: Sequence[float]) -> list[float]:
    """frmTemp ``arrayInterp`` (x2 가 x1 범위 앞이면 원점 비례, 뒤면 마지막 값 유지)."""
    if len(x1) != len(y1):
        raise FitInputError("The array sizes of x1 and y1 are not same.")
    if len(x2) < len(x1):
        raise FitInputError("The array size of x2 should be larger than x1.")
    out: list[float] = []
    k = 0
    n1 = len(x1)
    for xv in x2:
        if k == 0 and xv < x1[0]:
            out.append(xv / x1[0] * y1[0])
        elif k == n1 - 1 or xv >= x1[-1]:
            out.append(float(y1[-1]))
        else:
            # 원본처럼 한 번에 한 칸만 전진하고, 구간을 벗어나면 0 으로 남는다.
            if xv >= x1[k + 1]:
                k += 1
            if x1[k] <= xv < x1[k + 1]:
                out.append((y1[k + 1] - y1[k]) / (x1[k + 1] - x1[k]) * (xv - x1[k]) + y1[k])
            else:
                out.append(0.0)
    return out


def expand_range(y_min: float, y_max: float) -> tuple[float, float]:
    return y_min - 0.2 * abs(y_min), y_max + 0.2 * abs(y_max)


def finite(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def safe_log_ratio(num: float, den: float):
    try:
        return finite(10 * math.log10(num / den))
    except (ValueError, ZeroDivisionError):
        return None


def format_e(v: float) -> str:
    """VB ``Format(v, "0.######E+00")``."""
    v = float(v)
    if v == 0:
        return "0E+00"
    s = format(v, ".6E")
    mant, exp = s.split("E")
    mant = mant.rstrip("0").rstrip(".")
    sign = exp[0]
    return f"{mant}E{sign}{exp[1:].lstrip('0').zfill(2)}"


def pct_change(selected: float, pct: float) -> float:
    return selected + abs(selected) * pct / 100.0


# ─── HPSF ───────────────────────────────────────────────────────────────────


def hpsf_value(y: Sequence[float], x: float, two_d: bool, el: float) -> float:
    with np.errstate(all="ignore"):
        if not two_d:
            return y[0] * (1 + y[1] * x / y[2] - (1 + x / y[2]) * math.exp(-2 * x / y[2])) if y[2] else math.nan
        if not y[3] or not y[4]:
            return math.nan
        return ((1 + y[1] * x / y[3] - (1 + x / y[3]) * math.exp(-2 * x / y[3])) * y[0]
                * (1 + y[2] * el / y[4] - (1 + el / y[4]) * math.exp(-2 * el / y[4])))


def hpsf_curve(y, x_min, x_max, two_d, el) -> list[list]:
    pts = []
    for j in range(1, 102):
        x = x_min + (x_max - x_min) / 100 * (j - 1)
        pts.append([x, finite(hpsf_value(y, x, two_d, el))])
    return pts


def hpsf_errors(y, xs, ys, two_d, el) -> list:
    return [safe_log_ratio(hpsf_value(y, x, two_d, el), m) for x, m in zip(xs, ys)]


def error_label(graph: str, xs: Sequence[float], errs: Sequence) -> str:
    """lblErrorHpsf/lblErrorSpec 텍스트. 원본 ``errA(J-1) = MyError(2, J-1)`` 오프바이원(첫 값 0,
    마지막 값 누락)을 평균·편차 계산에 그대로 재현한다."""
    nl = "\r\n"
    out = f"{graph} error in Db:{nl}{nl}"
    for x, e in zip(xs, errs):
        out += f"({vb_str(x)},  {vb_str(e if e is not None else 0)}){nl}"
    vals = [0.0] + [float(e or 0) for e in errs[:-1]] if errs else []
    if not vals:
        return out
    avg = sum(vals) / len(vals)
    dev = math.sqrt(sum((v - avg) ** 2 for v in vals) / len(vals))
    out += f"Average: {nl}{vb_str(avg)}{nl}Deviation: {nl}{vb_str(dev)}{nl}"
    return out


# ─── TR 스펙트럼 ─────────────────────────────────────────────────────────────


def split_tr_spectra(text: str) -> list[str]:
    return (text or "").replace("  ", " ").strip().split(" ")


def convolve_spectra(pwr_rows: Sequence[str], tr_spec: Sequence[str]) -> tuple[list[float] | None, str | None]:
    """DrawGraph TrSpectrum: convalue(j) = Σ Val(Pwr(i))·Val(Tr(i)), i<64."""
    out = []
    for text in pwr_rows:
        pwr = (text or "").split(" ")
        if len(pwr) < SPEC_LEN:
            return None, "Spectra length is not 64!"
        if len(tr_spec) < SPEC_LEN:
            return None, None
        out.append(sum(vb_val(pwr[i]) * vb_val(tr_spec[i]) for i in range(SPEC_LEN)))
    return out, None


def tr_errors(fm_a, convalue, fm_meas, meas) -> list:
    errs = []
    for f, m_val in zip(fm_meas, meas):
        m = neighbor_index(fm_a, f)
        if m < len(fm_a) - 1:
            denom = fm_a[m + 1] - fm_a[m]
            v = (f - fm_a[m]) / denom * (convalue[m + 1] - convalue[m]) + convalue[m] if denom else convalue[m]
        else:
            v = convalue[m]
        errs.append(safe_log_ratio(v, m_val))
    return errs


def parse_pwr_matrix(rows: Sequence[str]) -> list[list[float]]:
    """cmdTrSpec: normSpectra 는 정확히 64개(공백 split)여야 한다."""
    matrix = []
    for text in rows:
        parts = (text or "").split(" ")
        if len(parts) != SPEC_LEN:
            raise FitInputError("Spectra length is not 64!")
        matrix.append([vb_val(p) for p in parts])
    return matrix


def tr_spectrum_string(values: Sequence[float]) -> str:
    return "".join(vb_str(v) + " " for v in values)


# ─── 비선형 오차 ─────────────────────────────────────────────────────────────


def nonlinear_errors(start: float, step: float, nonlinear: Sequence[float], xs, ys) -> list[list]:
    pts = []
    for x, y in zip(xs, ys):
        i = vb_cshort((x - start) / step) if step else 0
        if i < 0 or i >= len(nonlinear):
            pts.append([x, None])
            continue
        if i + 1 < len(nonlinear):
            v = (x - (start + i * step)) / step * (nonlinear[i + 1] - nonlinear[i]) + nonlinear[i]
        else:
            v = nonlinear[i]
        pts.append([x, safe_log_ratio(v, y)])
    return pts


def parse_nonlinear(text) -> list[float]:
    return [vb_val(p) for p in split_tr_spectra(str(text or ""))]


# ─── frmTemp10 ───────────────────────────────────────────────────────────────


def temp10_value(coeffs: Sequence[float], t: float) -> float:
    return float(temp10_model(coeffs, np.asarray([t], dtype=float))[0])


def temp10_curve(coeffs) -> list[list]:
    return [[5.0 * (j - 1), finite(temp10_value(coeffs, 5.0 * (j - 1)))] for j in range(1, 362)]


def temp10_rise_arrays(rows: Sequence[Sequence[float]], temp0: float) -> tuple[list[float], list[float]]:
    """VB 는 ``ReDim timeElapsed(RecordCount)`` 로 끝에 (0, 0) 이 한 점 더 붙는다(목적함수에 포함)."""
    t = [float(r[0]) for r in rows] + [0.0]
    y = [float(r[1]) - temp0 for r in rows] + [0.0]
    return t, y


def temp30(coeffs: Sequence[float], room_init: float, room_final: float) -> float:
    return temp10_value(coeffs, 1800.0) - (room_final - room_init)


# ─── frmWobbler ─────────────────────────────────────────────────────────────

WOBB_X0 = (0.01, 0.5, 15.0, 0.05, 0.0005, 0.5)
WOBB_UB = (0.5, 5.0, 150.0, 0.5, 0.01, 10.0)


def wobbler_model(x, vol, angle, area):
    vol, angle, area = (np.asarray(v, dtype=float) for v in (vol, angle, area))
    with np.errstate(all="ignore"):
        return (1 - x[0] * vol * (1 - np.exp(-x[3] * angle))
                - x[1] * (1 - np.exp(-x[2] * vol)) * (1 - np.exp(-x[4] * angle**2)) * (1 - x[5] * area))


def fit_wobbler(area, volume, angle, norm_tr) -> FitResult:
    """fmincon(sum of squares, lb=0, ub=WOBB_UB) 대체 — L-BFGS-B."""
    a = _as_vector(area, "effectiveArea", 2)
    v = _as_vector(volume, "volumeRateHz", 2)
    g = _as_vector(angle, "wobbAngleDeg", 2)
    y = _as_vector(norm_tr, "normTR", 2)
    if len({a.size, v.size, g.size, y.size}) != 1:
        raise FitInputError("wobbler 입력 길이가 같아야 합니다.")
    obj = _safe_objective(lambda x: np.sum((y - wobbler_model(x, v, g, a)) ** 2))
    res = minimize(obj, np.asarray(WOBB_X0), method="L-BFGS-B", bounds=list(zip([0.0] * 6, WOBB_UB)),
                   options={"maxiter": 5000, "maxfun": 10000, "ftol": 1e-15, "gtol": 1e-10})
    coeffs = [float(c) for c in np.clip(res.x, 0, WOBB_UB)]
    return FitResult(coeffs, float(obj(np.asarray(coeffs))), bool(res.success))


def wobbler_curve(x, x_min, x_max, angle, area) -> list[list]:
    pts = []
    for j in range(1, 102):
        vol = x_min + (x_max - x_min) / 100 * (j - 1)
        pts.append([vol, finite(wobbler_model(x, vol, angle, area))])
    return pts


def wobbler_item(area, angle) -> str:
    return f"{TAB}{float(area):,.4f}{TAB}{float(angle):,.4f}"
