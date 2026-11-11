"""measSetInput(msiReader) 순수 계산 엔진.

원본: 11_소스_CompassTool_VB_2nd/measSetInput.vb
- cmdSaveDb_Click(152~728)  → ``save_tank``
- cmdSavePower_Click(729~1128) → ``save_power``
- cmdSaveTemp_Click(1129~1487) → ``save_temp``
- AperSize(1566~1618) / cmdUpdateAll / dgvSelected_CellDoubleClick → ``aper_size`` 등
- FillPwrSetId_Click / WriteTxt → ``power_setid_text``

DB 접근은 주입된 ``repo``(excel_store.ExcelRepo 또는 테스트용 가짜)로만 한다.
원본 MsgBox+Exit Sub 는 ``MsiExcelError`` 로 올려 호출자가 트랜잭션을 롤백한다.
"""

from __future__ import annotations

import datetime as _dt
import math
from dataclasses import dataclass, field

from .excel_vb import (
    MsiExcelError,
    bool_cell,
    cdbl,
    cell_text,
    cstr,
    db_number,
    decimal_5,
    f32,
    split_keep,
    split_nonempty,
    sql_num,
    vb_div,
    vb_floor,
    vb_instr,
    vb_str,
    vb_trim,
    vb_val,
)

MAX_ROWS = 2000
MAX_COLS = 200
MAX_TEXT = 4000
MAX_SETID_SPAN = 5000
MAX_TEMP_FREQ = 10000

NOTHING_SELECTED = "Nothing in Selected RTP table. No data is saved in database."

# setTerm(1..31) — cmdSaveDb / cmdSavePower 공통
MEAS_TERMS = (
    None, "probeId", "isScw", "PMPulseType", "FmMhz", "pulseWidthUsec", "pulseBandwidthMHz", "azFnum",
    "azApodType", "FocusPMm", "azAperSizeMm", "isPhaseInverse", "numTxCycles", "edgeTreatment", "elFnum",
    "elAperType", "FocusQMm", "elAperSizeMm", "elevIndex", "cpaType", "apexCm", "profVoltageVolt",
    "ceilTxGain", "MaxVoltageVolt", "numMeasVoltage", "totalVoltagePt", "zStartCm", "zEndCm",
    "ExcelFileName", "comments", "splitFocusEnable", "speedOfSoundMPerS",
)
MEAS_TEXT_IDX = frozenset({3, 8, 13, 15, 19, 28, 29})

# setTerm(1..21) — cmdSaveTemp
TEMP_TERMS = (
    None, "probeId", "isScw", "PMPulseType", "FmMhz", "pulseWidthUsec", "pulseBandwidthMHz", "azApodType",
    "elAperType", "FocusPMm", "azAperSizeMm", "elAperSizeMm", "measVoltage", "pulseRateHz", "elevIndex",
    "measSetNum", "numTxCycles", "azAperElem", "elAperElem", "edgeTreatment", "multiPulseWidthUs", "PwCwUseCode",
)
TEMP_TEXT_IDX = frozenset({3, 7, 8, 19})

MEAS_INSERT_COLUMNS = tuple(t for t in MEAS_TERMS if t) + ("ePulseString", "pulseRateHz")
MEAS_UPDATE_COLUMNS = ("isPhaseInverse", "pulseWidthUsec", "numTxCycles", "pulseBandwidthMHz", "ePulseString")
TEMP_INSERT_COLUMNS = tuple(t for t in TEMP_TERMS if t)

TEMP_OPTION_TEXT = {
    "0": "0 -- Create Temp initial test Set For Each combination On voltage, PulseWidthUs, aperture vs Freq .",
    "1": "1 -- Create Temp set for each combination on Freq, PulseWidthUs, aperture and measvoltage.",
    "4": "4 -- Create Temp set for selected combination on PulseWidthUs, aperture vs. Freq, measVoltage.",
    "3": "3 -- Create Temp set for selected combination on Freq, PulseWidthUs, and prof.Voltage vs. aperture elements.",
    "14": "14 -- Create Temp set for selected combination on measVoltage, PulseWidthUs, aperture vs. Freq.",
}


# ---------------------------------------------------------------- 입력

_TEXT_FIELDS = {
    "maxVoltage": "1", "profVoltage": "0.48329", "vPoints": "20", "voltNum": "12", "speedSound": "1540",
    "numCycList": "", "pulseVoltage": "0.392157", "pulseWidthUsec": "", "selectValue": "", "selectValue2": "",
    "cwUseCode": "0", "tempOpt": "", "selectLabel": "Selected Foci:", "msi": "0", "msiEnd": "", "purpose": "RTP",
    "outputName": "",
}


@dataclass
class FormInput:
    columns: list
    rows: list
    selected_probe_id: object = None
    is_create_new: bool = False
    is_elev_req: bool = False
    text: dict = field(default_factory=dict)
    force_new: bool = False

    def t(self, key: str) -> str:
        return self.text.get(key, "")


def _scalar(v):
    if v is None or isinstance(v, (bool, int, float, str)):
        if isinstance(v, str) and len(v) > MAX_TEXT:
            raise MsiExcelError("셀 값이 너무 깁니다.")
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    raise MsiExcelError("셀 값 형식이 올바르지 않습니다.")


def form_from_body(body: dict) -> FormInput:
    columns = body.get("columns")
    rows = body.get("rows")
    if not isinstance(columns, list) or not isinstance(rows, list):
        raise MsiExcelError("Selected RTP 데이터(columns/rows)가 필요합니다.")
    if len(columns) > MAX_COLS or len(rows) > MAX_ROWS:
        raise MsiExcelError("Selected RTP 데이터가 너무 큽니다.")
    cols = [cstr(c)[:200] if c is not None else "" for c in columns]
    clean_rows = []
    for r in rows:
        if not isinstance(r, list):
            raise MsiExcelError("행 형식이 올바르지 않습니다.")
        cells = [_scalar(v) for v in r[: len(cols)]]
        cells += [None] * (len(cols) - len(cells))
        clean_rows.append(cells)
    text = {}
    for key, default in _TEXT_FIELDS.items():
        v = body.get(key, default)
        v = "" if v is None else v
        if not isinstance(v, (str, int, float)) or isinstance(v, bool):
            raise MsiExcelError(f"{key} 값 형식이 올바르지 않습니다.")
        v = cstr(v)
        if len(v) > (255 if key == "outputName" else MAX_TEXT):
            raise MsiExcelError(f"{key} 값이 너무 깁니다.")
        text[key] = v
    return FormInput(
        columns=cols,
        rows=clean_rows,
        selected_probe_id=_scalar(body.get("selectedProbeId")),
        is_create_new=body.get("isCreateNew") is True,
        is_elev_req=body.get("isElevReq") is True,
        text=text,
        force_new=body.get("forceNew") is True,
    )


def _require_rows(form: FormInput) -> None:
    if not form.rows:
        raise MsiExcelError(NOTHING_SELECTED)


def _msi_range(form: FormInput) -> tuple[str, str]:
    if form.is_create_new:
        return form.t("msi"), vb_trim(form.t("msiEnd"))
    return "0", ""


def _selected_probe(form: FormInput):
    if form.selected_probe_id is None or cstr(form.selected_probe_id).strip() == "":
        raise MsiExcelError("Please select one RTP!")
    return sql_num(form.selected_probe_id, "SelectedProbeId")


def _insert_values(p: list, terms: tuple, text_idx: frozenset, skip: frozenset) -> dict:
    values = {}
    for n in range(1, len(terms)):
        if n in skip or p[n] == "":
            continue
        values[terms[n]] = p[n] if n in text_idx else db_number(vb_val(p[n]))
    return values


def _num(rec: dict, key: str, what: str) -> float:
    v = rec.get(key)
    if v is None:
        raise MsiExcelError(f"Probe_info.{what} 값이 NULL 입니다.")
    return float(v)


# ---------------------------------------------------------------- AperSize 계열


@dataclass
class AperResult:
    ok: bool
    update_foc: str
    update_term: str
    elev_index: str
    message: str = ""


def aper_size(org_foc_s, org_aper_s, required_foc, break_point, update_foc: str = "") -> AperResult:
    """원본 AperSize(footAper 는 계산에 쓰이지 않으므로 생략)."""
    org_foc = split_nonempty(cstr(org_foc_s))
    org_aper = split_nonempty(cstr(org_aper_s))
    if len(org_foc) != len(org_aper):
        return AperResult(False, update_foc, "", "",
                          "The lengths of foci and aperture are not same, or aperture string is too long! Please fix it!")
    params = split_nonempty(cstr(required_foc))
    bp = f32(break_point)
    term = ""
    elev = ""
    ub = len(org_foc) - 1
    for i in range(len(params)):
        if term != "":
            update_foc += " "
            term += " "
            elev += " "
        foc_val = vb_val(params[i])
        j = 0
        while j < ub and vb_val(org_foc[j]) < foc_val:
            j += 1
        if ub < 0:
            continue
        if foc_val >= vb_val(org_foc[0]) and foc_val <= cdbl(org_foc[ub], "azFocusMm"):
            if j == 0 and foc_val == vb_val(org_foc[0]):
                aper = f32(cdbl(org_aper[0], "azAperSizeMm"))
            else:
                f0, f1 = vb_val(org_foc[j - 1]), vb_val(org_foc[j])
                a0, a1 = vb_val(org_aper[j - 1]), vb_val(org_aper[j])
                aper = f32(vb_div(foc_val - f0, f1 - f0) * (a1 - a0) + a0)
            update_foc += vb_str(foc_val)
            term += vb_str(aper)
            elev += "1" if vb_val(params[i]) >= bp else "0"
    return AperResult(True, update_foc, term, elev)


def _find_col(columns: list, key: str) -> int:
    for j, h in enumerate(columns):
        if vb_instr(h, key) > 0:
            return j
    return -1


def update_all(columns: list, rows: list, meas_focus_list: str) -> dict:
    """cmdUpdateAll_Click. 반환: {rows, salmon:[[r,c]], messages}"""
    if meas_focus_list == "":
        return {"rows": rows, "salmon": [], "messages": []}
    bp_col = max(_find_col(columns, "breakPoint"), 0)
    col = _find_col(columns, "azFocusMm")
    if col < 0 or col + 2 >= len(columns):
        raise MsiExcelError("azFocusMm 열(뒤에 azAperSizeMm·elevIndex)이 없습니다.")
    out = [list(r) for r in rows]
    salmon, messages = [], []
    for ri, row in enumerate(out):
        if len(row) < 2 or row[1] is None:
            continue
        bp = 1000.0
        if row[bp_col] is not None and vb_instr(columns[bp_col], "breakPoint") > 0 and cstr(row[bp_col]).strip() != "":
            bp = cdbl(row[bp_col], "breakPoint")
        res = aper_size(row[col], row[col + 1], meas_focus_list, bp, "")
        if not res.ok:
            messages.append(res.message)
            messages.append("update error in row: " + vb_str(ri) + " -- string too long or focus and aperSize not match.")
            continue
        row[col], row[col + 1], row[col + 2] = res.update_foc, res.update_term, res.elev_index
        salmon.append([ri, col + 1])
    return {"rows": out, "salmon": salmon, "messages": messages}


def cell_double_click(columns: list, row: list, col: int, meas_focus_list: str, meas_index: str,
                      is_elev_req: bool) -> dict:
    """dgvSelected_CellDoubleClick. 반환: {row, salmon:[c], messages}"""
    row = list(row)
    if vb_instr(columns[col], "azFocusMm") > 0 and meas_focus_list != "" and meas_index == "":
        if col + 2 >= len(columns) or (is_elev_req and col + 8 >= len(columns)):
            raise MsiExcelError("azFocusMm 뒤 열(azAperSizeMm·elevIndex·elAperSizeMm)이 부족합니다.")
        bp = 10000.0
        for j, h in enumerate(columns):
            if vb_instr(h, "breakPoint") > 0 and row[j] is not None and vb_trim(cstr(row[j])) != "":
                bp = cdbl(row[j], "breakPoint")
                break
        org_foc = row[col]
        res = aper_size(org_foc, row[col + 1], meas_focus_list, bp, "")
        if not res.ok:
            return {"row": row, "salmon": [], "messages": [res.message,
                    "update error in the row: -- string too long or focus and aperSize not match."]}
        row[col] = meas_focus_list
        row[col + 1] = res.update_term
        row[col + 2] = res.elev_index
        salmon = [col + 1]
        if is_elev_req:
            # 원본은 갱신 전 초점(orgFocS)으로 elAperSizeMm(col+8)을 다시 보간한다.
            res1 = aper_size(org_foc, row[col + 8], meas_focus_list, 100000, "")
            if not res1.ok:
                return {"row": row, "salmon": salmon, "messages": [res1.message,
                        "update error in the row: -- string too long or focus and elevSize not match."]}
            row[col + 8] = res1.update_term
            salmon.append(col + 8)
        return {"row": row, "salmon": salmon, "messages": []}
    if col >= 11 and row[col] is not None and meas_index != "":
        params = split_nonempty(cstr(row[col]))
        select_index = split_keep(meas_index)
        if len(params) - 1 >= len(select_index) - 1:
            term = ""
            for s in select_index:
                if s != "":
                    k = int(vb_floor(cdbl(s, "Selected Indices")))
                    if k < 0 or k >= len(params):
                        raise MsiExcelError("Index was outside the bounds of the array.")
                    if term != "":
                        term += " "
                    term += params[k]
            row[col] = term
    return {"row": row, "salmon": [], "messages": []}

# ---------------------------------------------------------------- 공통 조회 조건


def _ordinal_sort(parts: list) -> list:
    """Array.Sort(String()) — 숫자 문자열에 대해 서수 정렬과 같다고 가정(잔여 위험)."""
    return sorted(parts)


def _need(v, what: str) -> str:
    if v is None:
        raise MsiExcelError(f"{what} 값이 비어 있습니다(DBNull). 원본은 이 경우 예외로 중단됩니다.")
    return cstr(v)


def _nn_slot(fract_bw: float) -> int:
    nn = int(vb_floor(float(f32(float(f32(fract_bw)) * 12))))
    if nn in (10, 11, 12):
        return 0
    if nn in (7, 8, 9):
        return 1
    if nn in (5, 6):
        return 2
    return 3


_EPULSE_MUL = (1.0, 1.5, 2.0, 3.0)


DUP_LIMIT = 500


class _Ctx:
    """원본 폼 수준/프로시저 수준 상태."""

    def __init__(self) -> None:
        self.messages: list[str] = []
        self.inserted = 0
        self.updated = 0
        self.duplicates: list[dict] = []
        self.dup_total = 0
        self.combos: list[dict] = []
        self.combo_total = 0

    def _combo(self, entry: dict) -> None:
        self.combo_total += 1
        if len(self.combos) < DUP_LIMIT:
            self.combos.append(entry)

    def dup(self, row_no: int, cond: dict, ids: list, action: str) -> None:
        """#49: 원본 규칙으로 '이미 있는 조건'이라 새로 추가하지 않은 조합을 기록한다."""
        self.dup_total += 1
        entry = {"row": row_no, "cond": dict(cond), "ids": [int(i) for i in ids if i is not None][:20],
                 "action": action, "dup": True}
        if len(self.duplicates) < DUP_LIMIT:
            self.duplicates.append(entry)
        self._combo(entry)

    def new(self, row_no: int, cond: dict) -> None:
        """#50: 새 행으로 추가될 조합(중복 아님)도 확인 창에 함께 보여 주기 위해 기록한다."""
        self._combo({"row": row_no, "cond": dict(cond), "ids": [], "action": "새 행 추가", "dup": False})

    def result(self, **extra) -> dict:
        out = {"messages": self.messages, "inserted": self.inserted, "updated": self.updated,
               "duplicates": self.duplicates, "dupTotal": self.dup_total,
               "combos": self.combos, "comboTotal": self.combo_total}
        out.update(extra)
        return out


# ---------------------------------------------------------------- cmdSaveDb_Click (Tank)


def _tank_criteria(p: list, phase, speed, pitchx: float, msi_init: str, msie: str) -> list:
    crit = [
        ("comments", "=", p[29]),
        ("probeId", "=", sql_num(p[1], "probeId")),
        ("PMpulseType", "=", p[3]),
        ("azApodType", "=", p[8]),
        ("elAperType", "=", p[15]),
        ("isPhaseInverse", "=", phase),
        ("splitFocusEnable", "=", sql_num(p[30], "splitFocusEnable")),
        ("FmMHz", "=", sql_num(p[4], "FmMHz")),
        ("FocusPMm", "=", sql_num(p[9], "FocusPMm")),
        ("elevIndex", "=", sql_num(p[18], "elevIndex")),
        ("speedOfSoundMPerS", "=", speed),
        ("ABS_AZAPER", "<=", (sql_num(p[10], "azAperSizeMm"), sql_num(cstr(pitchx), "azPitchCm"))),
        ("measSetId", ">=", sql_num(msi_init, "MSI")),
    ]
    if msie != "":
        crit.append(("measSetId", "<=", sql_num(msie, "MSIEnd")))
    return crit


def save_tank(form: FormInput, repo) -> dict:
    _require_rows(form)
    sel_probe = _selected_probe(form)
    ctx = _Ctx()
    p = [""] * 32
    p[23] = form.t("maxVoltage")
    p[21] = form.t("profVoltage")
    p[25] = form.t("vPoints")
    p[24] = form.t("voltNum")
    p[28] = form.t("outputName")
    p[31] = form.t("speedSound")
    p[29] = form.t("purpose") if form.t("purpose") != "" else "RTP"
    p[30] = "0"
    display_s: list[str] = []
    display_p: list[str] = []
    max_id = repo.max_meas_set_id() or 0
    speed = sql_num(form.t("speedSound"), "Speed of Sound")
    msi_init, msie = _msi_range(form)

    is1d = False
    is_mmx = False          # 원본은 폼 전역(클릭 간 유지) — 클릭마다 초기화로 보정
    is_gchirp = False
    fract_bw = f32(0)
    pitchx = pitchy0 = pitchy1 = mech0 = mech1 = 0.0
    cols = form.columns

    for row_no, row in enumerate(form.rows, start=1):
        for j in range(1, 21):
            p[j] = ""
        focus = freq = tx = elev = elev_aper = None
        is_chirp = False
        is_gchirp = False
        for j, h in enumerate(cols):
            v = row[j]
            if vb_instr(h, "probeElevType") > 0 and v is not None and vb_instr(cstr(v), "1D") > 0:
                is1d = True
            if vb_instr(h, "probeId") > 0 and v is not None:
                p[1] = cstr(v)
            if vb_instr(h, "isScw") > 0:
                p[2] = "0" if v is None else bool_cell(v)
            if vb_instr(h, "splitFocus") > 0:
                p[30] = "0"
                if v is not None and vb_trim(cstr(v)) != "":
                    p[30] = bool_cell(v)
            if vb_instr(h, "PulseType") > 0 and v is not None:
                p[3] = cstr(v)
                if vb_instr(p[3], "MmxDirect", True) > 0:
                    is_mmx = True
                if vb_instr(p[3], "Chirp", True) > 0 or vb_instr(p[3], "Dual", True) > 0:
                    is_chirp = True
                    if vb_instr(p[3], "GaussianChirp", True) > 0:
                        is_gchirp = True
            if vb_instr(h, "CenterFrequencyM") > 0:
                freq = split_keep(vb_trim(_need(v, "CenterFrequencyM")))
            if vb_instr(h, "pulseWidthUsec") > 0:
                p[5] = ""
            if vb_instr(h, "FractionalBandwidth") > 0 and v is not None:
                p[6] = cstr(vb_val(v))
                fract_bw = f32(cdbl(p[6]))
            if vb_instr(h, "azFnum") > 0 and v is not None:
                p[7] = cstr(v)
            if vb_instr(h, "isPhaseInverse") > 0:
                p[11] = "0" if v is None else vb_trim(cstr(v))
                if p[11] == "":
                    p[11] = "0"
            if vb_instr(h, "NumCycles") > 0 and v is not None:
                p[12] = cstr(v)
                if vb_val(p[12]) != 0:
                    fract_bw = f32(1 / vb_val(p[12]))
            if vb_instr(h, "ApodType") > 0 and v is not None:
                p[8] = cstr(v)
            if vb_instr(h, "azFocusMm") > 0:
                focus = split_nonempty(_need(v, "azFocusMm"))
            if vb_instr(h, "azAperSizeMm") > 0 and v is not None:
                tx = split_nonempty(cstr(v))
            if vb_instr(h, "elevIndex") > 0 and v is not None:
                elev = split_nonempty(cstr(v))
            if vb_instr(h, "elAperType") > 0:
                p[15] = cstr(v) if v is not None and vb_trim(cstr(v)) != "" else "rect"
            if vb_instr(h, "EdgeTreatment") > 0 and v is not None:
                p[13] = cstr(v)
            if vb_instr(h, "elAperSizeMm") > 0:
                if form.is_elev_req and v is not None and vb_trim(cstr(v)) != "":
                    elev_aper = split_nonempty(cstr(v))
                else:
                    p[17] = "1"
            if vb_instr(h, "elFnum") > 0 and v is not None:
                p[14] = cstr(v)
            if vb_instr(h, "elFocusMm") > 0 and v is not None:
                p[16] = cstr(v)
            if vb_instr(h, "cpaType") > 0 and v is not None:
                p[19] = cstr(v)
            if vb_instr(h, "apexMm") > 0 and v is not None:
                p[20] = cstr(abs(vb_val(v)) / 10)
            if vb_instr(h, "ceilTxGain") > 0:
                p[22] = "" if v is None else cstr(v)

        p[26] = ""
        p[27] = ""
        info = repo.probe_info(sql_num(p[1], "probeId"))
        if info:
            pitchx = _num(info, "azPitchCm", "azPitchCm")
            pitchy0 = _num(info, "elPitchCm", "elPitchCm")
            if info.get("elPitch1Cm") is not None:
                pitchy1 = float(info["elPitch1Cm"])
            mech0 = float(info["MechFocusCm"]) if info.get("MechFocusCm") is not None else 10.0
            if info.get("MechFocus1Cm") is not None:
                mech1 = float(info["MechFocus1Cm"])

        if focus is None or tx is None or elev is None or freq is None:
            raise MsiExcelError(
                "Focus, TxElements and ElevIndex in input file have different lengths. Please fix it!"
                " (azFocusMm/azAperSizeMm/elevIndex/CenterFrequencyM 열 또는 값 없음)"
            )
        if len(focus) != len(tx) or len(focus) != len(elev):
            raise MsiExcelError("Focus, TxElements and ElevIndex in input file have different lengths. Please fix it!")
        if form.is_elev_req and (elev_aper is None or len(focus) != len(elev_aper)):
            raise MsiExcelError("Focus, elevAperture in input file have different lengths. Please fix it!")
        if vb_val(p[21]) > vb_val(p[22]) * 1.05:
            raise MsiExcelError("Profile gain is 5% greater than Ceiling gain. Please fix it!")

        for k in range(len(focus)):
            for m in range(len(freq)):
                if p[2] == "1":
                    p[5] = vb_str(vb_div(1, vb_val(p[4])))
                    p[12] = "1"
                p[4] = freq[m]
                p[10] = tx[k]
                p[18] = elev[k]
                if cdbl(elev[k], "elevIndex") == 1:
                    mech = mech1
                else:
                    mech = mech0
                p[26] = "0"
                p[9] = cstr(vb_val(focus[k]))
                if p[16] == "" or p[14] == "" or is1d:
                    p[16] = p[9]
                    p[14] = cstr(vb_div(vb_val(p[16]), vb_val(p[17])))
                if p[5] == "":
                    if p[6] != "":
                        p[6] = cstr(cdbl(p[6]) * cdbl(p[4], "FmMhz"))
                        p[5] = cstr(vb_div(1, cdbl(p[6])))
                    if p[12] != "":
                        p[5] = cstr(vb_div(cdbl(p[12], "NumCycles"), cdbl(p[4], "FmMhz")))
                p[27] = cstr(min(max(abs(vb_val(p[9])) / 10, mech) + 1, 14))
                if cdbl(p[18], "elevIndex") == 1:
                    p[27] = cstr(min(max(abs(vb_val(p[9])) / 10, mech1) + 1, 14))
                if vb_instr(p[11], "True") > 0 or vb_instr(p[11], "TRUE") > 0:
                    p[11] = "1"
                if vb_instr(p[11], "False") > 0 or vb_instr(p[11], "FALSE") > 0:
                    p[11] = "0"
                if is_mmx:
                    p[5] = "1"
                    p[6] = "1"

                phase_zero = cdbl(p[11], "isPhaseInverse") == 0
                cond = {"PMpulseType": p[3], "FmMHz": p[4], "FocusPMm": p[9], "azAperSizeMm": p[10],
                        "elevIndex": p[18], "isPhaseInverse": p[11], "azApodType": p[8], "elAperType": p[15],
                        "comments": p[29]}
                pha_num = 0
                phase_rec = None
                if form.force_new:
                    recs = []   # #49: 사용자가 중복 확인 창에서 강제 입력을 고른 경우 — 중복 검사 없이 INSERT
                else:
                    if phase_zero:
                        pha_num = repo.count_meas(_tank_criteria(p, 1, speed, pitchx, msi_init, msie))
                    else:
                        recs = repo.find_meas(_tank_criteria(p, 0, speed, pitchx, msi_init, msie))
                        if recs:
                            phase_rec = recs[0]
                            mid = recs[0]["measSetId"]
                            repo.update_meas(mid, {"isPhaseInverse": 1})
                            ctx.updated += 1
                            display_p.append(vb_str(mid))

                    if pha_num != 0:
                        ids = [r["measSetId"] for r in repo.find_meas(_tank_criteria(p, 1, speed, pitchx, msi_init, msie))]
                        ctx.dup(row_no, cond, ids, "건너뜀: 같은 조건의 위상 반전(isPhaseInverse=1) 행이 이미 있음")
                        continue
                    recs = repo.find_meas(_tank_criteria(p, sql_num(p[11], "isPhaseInverse"), speed, pitchx, msi_init, msie))
                    if not recs and phase_rec is not None and getattr(repo, "preview", False):
                        recs = [phase_rec]   # 사전 검사는 위 UPDATE 를 실행하지 않으므로 갱신될 행을 그대로 쓴다
                if recs and not is_mmx and p[3] != "Cw" and not is_chirp:
                    rec = recs[0]
                    mid = rec["measSetId"]
                    ids = [r["measSetId"] for r in recs]
                    if phase_rec is not None and phase_rec["measSetId"] not in ids:
                        ids = sorted(ids + [phase_rec["measSetId"]])   # 사전 검사에서도 실제 저장과 같은 후보 목록
                    ctx.dup(row_no, cond, ids,
                            f"병합: 기존 measSetId {vb_str(mid)} 의 pulseWidth·ePulseString 보완"
                            + (" (isPhaseInverse 0→1 갱신)" if phase_rec is not None else ""))
                    if rec.get("pulseWidthUsec") is None:
                        raise MsiExcelError(f"measSetId {mid} 의 pulseWidthUsec 가 NULL 입니다.")
                    pulse_width = float(rec["pulseWidthUsec"])
                    e = rec.get("ePulseString") or ""
                    if vb_instr(e, p[5]) == 0:
                        f = cdbl(p[4], "FmMhz")
                        temp_s = cstr(vb_div(_EPULSE_MUL[_nn_slot(fract_bw)], f))
                        if vb_instr(e, temp_s) > 0 and abs(cdbl(temp_s) - cdbl(p[5], "pulseWidthUsec")) > 0.001:
                            e = e.replace(temp_s + " ", p[5] + " ")
                        else:
                            e = e + " " + p[5]
                        e = "".join(x + " " for x in _ordinal_sort(split_keep(e)))
                        if vb_val(p[5]) > pulse_width:
                            if vb_val(p[6]) == 0 and vb_val(p[12]) > 0:
                                vals = {"pulseWidthUsec": sql_num(p[5], "pulseWidthUsec"),
                                        "numTxCycles": db_number(vb_val(p[12])), "ePulseString": e}
                            else:
                                vals = {"pulseWidthUsec": sql_num(p[5], "pulseWidthUsec"),
                                        "pulseBandwidthMHz": db_number(vb_val(p[6])), "ePulseString": e}
                        else:
                            vals = {"ePulseString": e}
                        repo.update_meas(mid, vals)
                        ctx.updated += 1
                        display_s.append(vb_str(mid))
                else:
                    f = cdbl(p[4], "FmMhz")
                    if not is_chirp:
                        d = [cstr(vb_div(mul, f)) for mul in _EPULSE_MUL]
                        d[_nn_slot(fract_bw)] = p[5]
                        e = " ".join(d)
                    else:
                        e = " ".join(decimal_5(vb_div(cdbl(x, "NumCycList"), f))
                                     for x in split_nonempty(form.t("numCycList")))
                    if form.is_elev_req:
                        p[17] = elev_aper[k]
                    elif cdbl(p[18], "elevIndex") == 0:
                        if p[17] == "1":
                            p[17] = vb_str(pitchy0 * 10)
                    else:
                        p[17] = vb_str(pitchy1 * 10)
                    values = _insert_values(p, MEAS_TERMS, MEAS_TEXT_IDX, frozenset({7, 14}))
                    values["ePulseString"] = "" if is_mmx else e
                    values["pulseRateHz"] = 100
                    repo.insert_meas(values)
                    ctx.inserted += 1
                    ctx.new(row_no, cond)

    mn, mx = repo.new_set_range(max_id, sel_probe)
    set_range = vb_str(mn if mn is not None else 0) + ":" + vb_str(mx if mn is not None and mx is not None else 0)
    if display_s:
        ctx.messages.append("The following measSetId are modified based on pulseWidth: " + ", ".join(display_s))
    if display_p:
        ctx.messages.append("The following measSetId are modified on isPhaseInverse " + ", ".join(display_p))
    new_rows = repo.new_meas_grid(sel_probe, max_id)
    if new_rows and new_rows.get("rows") and is_gchirp:
        ctx.messages.append("Please manually update Gaussian Chirp ePulseString based on cycle and frequency!!!")
    repo.update_probe_apex(db_number(vb_val(p[20])), sql_num(p[1], "probeId"))
    return ctx.result(setRange=set_range, newRows=new_rows if new_rows and new_rows.get("rows") else None)


# ---------------------------------------------------------------- cmdSavePower_Click


def _ne_empty(v) -> bool:
    """``Not IsDBNull(v) And v <> ""``(원본에서 숫자 셀과 "" 비교는 예외였으나 문자열 비교로 처리)."""
    return v is not None and cstr(v) != ""


def save_power(form: FormInput, repo) -> dict:
    _require_rows(form)
    sel_probe = _selected_probe(form)
    ctx = _Ctx()
    p = [""] * 32
    p[23] = form.t("maxVoltage")
    p[21] = form.t("profVoltage")
    p[25] = form.t("vPoints")
    p[24] = form.t("voltNum")
    p[28] = form.t("outputName")
    p[29] = "Power"
    p[31] = form.t("speedSound")
    display_s: list[str] = []
    max_id = repo.max_meas_set_id() or 0
    msi_init, msie = _msi_range(form)

    init_fnum = float(f32(2))
    mech_focus = 0.0        # 원본 cmdSavePower 에서 mechFocus 는 대입되지 않는다(항상 0).
    pitchx = pitchy0 = pitchy1 = azfoot = elfoot = 0.0
    klength = 0
    elev_loop = 0
    focus = freq = tx = elev = None
    p[30] = "0"
    cols = form.columns

    for i, row in enumerate(form.rows):
        for j, h in enumerate(cols):
            v = row[j]
            if vb_instr(h, "probeId") > 0:
                p[1] = "" if v is None else cstr(v)
            if vb_instr(h, "isScw") > 0:
                p[2] = "0" if v is None else bool_cell(v)
            if vb_instr(h, "PulseType") > 0:
                p[3] = ""
                if v is not None:
                    p[3] = cstr(v)
                    if vb_instr(p[3], "MmxDirect", True) > 0:
                        pass  # 원본 isMmx=True 지만 cmdSavePower 에서는 사용되지 않는다.
            if vb_instr(h, "CenterFrequencyM") > 0:
                freq = split_keep(vb_trim(_need(v, "CenterFrequencyM")))
            if vb_instr(h, "pulseWidthUsec") > 0:
                p[5] = ""
                if _ne_empty(v):
                    ctx.messages.append("The data in column: pulseWidthUsec will be ignored!")
            if vb_instr(h, "FractionalBandwidth") > 0:
                p[6] = "" if v is None else cstr(v)
            if vb_instr(h, "azFnum") > 0:
                p[7] = "" if v is None else cstr(v)
            if vb_instr(h, "splitFocus") > 0 and v is not None and vb_trim(cstr(v)) != "":
                p[30] = bool_cell(v)
            if vb_instr(h, "isPhaseInverse") > 0:
                p[11] = "0" if v is None else cstr(v)
            if vb_instr(h, "NumCycles") > 0:
                p[12] = "" if v is None else cstr(v)
            if vb_instr(h, "ApodType") > 0:
                p[8] = "" if v is None else cstr(v)
            if vb_instr(h, "azFocusMm") > 0:
                focus = split_nonempty(_need(v, "azFocusMm"))
            if vb_instr(h, "azAperSizeMm") > 0 and v is not None:
                tx = split_nonempty(cstr(v))
            if vb_instr(h, "edgeTreatment") > 0:
                p[13] = "Truncate"
            if vb_instr(h, "elevIndex") > 0 and _ne_empty(v):
                elev = split_nonempty(cstr(v))
            if vb_instr(h, "elAperType") > 0:
                p[15] = cstr(v) if _ne_empty(v) else "rect"
            if vb_instr(h, "elAperSizeMm") > 0:
                p[17] = cstr(v) if _ne_empty(v) else "1"
            if vb_instr(h, "elFnum") > 0:
                p[14] = "" if v is None else cstr(v)
            if vb_instr(h, "elFocusMm") > 0:
                p[16] = "" if v is None else cstr(v)
            if vb_instr(h, "EdgeTreatment") > 0:
                p[13] = cstr(v) if _ne_empty(v) else "Truncate"
            if vb_instr(h, "breakPoint") > 0:
                elev_loop = 0
                if v is not None and 0 < vb_val(v) < 200:
                    elev_loop = 1
            if vb_instr(h, "cpaType") > 0:
                p[19] = "" if v is None else cstr(v)
            if vb_instr(h, "apexMm") > 0:
                p[20] = ""
                if v is not None and vb_val(v) != 0:
                    p[20] = cstr(vb_val(v) / 10)
            if vb_instr(h, "ceilTxGain") > 0:
                p[22] = "" if v is None else cstr(v)

        p[4] = p[9] = p[10] = p[26] = p[27] = ""
        if vb_val(p[21]) > vb_val(p[22]):
            raise MsiExcelError("Please set profile gain lower than ceiling Gain. i=" + str(i))
        if vb_instr(p[11], "True") > 0 or vb_instr(p[11], "TRUE") > 0:
            p[11] = "1"
        if vb_instr(p[11], "False") > 0 or vb_instr(p[11], "FALSE") > 0:
            p[11] = "0"

        info = repo.probe_info(sql_num(p[1], "probeId"))
        if info:
            pitchx = _num(info, "azPitchCm", "azPitchCm")
            pitchy0 = _num(info, "elPitchCm", "elPitchCm")
            azfoot = pitchx * _num(info, "azNumElements", "azNumElements")
            elfoot = pitchy0 * _num(info, "elNumElements", "elNumElements")
            klength = 1
            if info.get("elPitch1Cm") is not None:
                pitchy1 = float(info["elPitch1Cm"])
                klength = 2
        if klength > 0 and freq is None:
            raise MsiExcelError("CenterFrequencyM 열이 없습니다.")

        for _k in range(klength):
            for m in range(len(freq)):
                p[8] = "Rectangle"
                p[4] = freq[m]
                if p[2] == "1":
                    p[5] = vb_str(vb_div(1, vb_val(p[4])))
                    p[12] = "1"
                p[10] = vb_str(vb_floor(vb_div(1, pitchx) + 0.5) * pitchx * 10)
                p[9] = vb_str(vb_floor(min(1.0, azfoot) * init_fnum * 10) * 2)
                p[27] = cstr(min(max(abs(vb_val(p[9])) / 10, mech_focus) + 1, 14))
                p[26] = "0"
                if p[16] == "":
                    p[16] = p[9]
                if p[5] == "":
                    if p[6] != "":
                        p[6] = cstr(cdbl(p[6], "FractionalBandwidth") * cdbl(p[4], "FmMhz"))
                        p[5] = cstr(vb_div(1, cdbl(p[6])))
                    if p[12] != "":
                        p[5] = cstr(vb_div(cdbl(p[12], "NumCycles"), cdbl(p[4], "FmMhz")))

                for ei in range(elev_loop + 1):
                    p[18] = vb_str(ei)
                    if ei == 0:
                        if vb_val(p[17]) == 1 or p[17] == "":
                            p[17] = vb_str(pitchy0 * 10)
                        if vb_div(elfoot, pitchy0) >= 3:
                            p[17] = vb_str(vb_floor(vb_div(1, pitchy0) + 0.5) * pitchy0 * 10)
                    else:
                        p[17] = vb_str(pitchy1 * 10)
                    if p[14] == "":
                        p[14] = cstr(vb_div(cdbl(p[16], "FocusQMm"), cdbl(p[17], "elAperSizeMm")))
                    crit = [
                        ("probeId", "=", sql_num(p[1], "probeId")),
                        ("PMPulseType", "=", p[3]),
                        ("FmMhz", "=", sql_num(p[4], "FmMhz")),
                        ("azApodType", "=", "Rectangle"),
                        ("comments", "=", "Power"),
                        ("elevIndex", "=", sql_num(p[18], "elevIndex")),
                        ("measSetId", ">", sql_num(msi_init, "MSI")),
                    ]
                    if msie != "":
                        crit.append(("measSetId", "<=", sql_num(msie, "MSIEnd")))
                    recs = [] if form.force_new else repo.find_meas(crit)
                    cond = {"PMpulseType": p[3], "FmMHz": p[4], "elevIndex": p[18], "azApodType": "Rectangle",
                            "comments": "Power"}
                    if len(recs) == 0:
                        repo.insert_meas(_insert_values(p, MEAS_TERMS, MEAS_TEXT_IDX, frozenset({7, 14, 20})))
                        ctx.inserted += 1
                        ctx.new(i + 1, cond)
                    elif len(recs) > 1:
                        ctx.dup(i + 1, cond, [r["measSetId"] for r in recs],
                                f"건너뜀: 같은 조건 행이 {len(recs)}건 있어 변경하지 않음(원본 동작)")
                    elif len(recs) == 1:
                        mid = recs[0]["measSetId"]
                        ctx.dup(i + 1, cond, [mid], f"병합: 기존 measSetId {vb_str(mid)} 의 pulseWidth 보완(더 길 때만)")
                        if recs[0].get("pulseWidthUsec") is None:
                            raise MsiExcelError(f"measSetId {mid} 의 pulseWidthUsec 가 NULL 입니다.")
                        if vb_val(p[5]) > float(recs[0]["pulseWidthUsec"]):
                            if vb_val(p[6]) == 0 and vb_val(p[12]) > 0:
                                vals = {"pulseWidthUsec": db_number(vb_val(p[5])), "numTxCycles": db_number(vb_val(p[12]))}
                            else:
                                vals = {"pulseWidthUsec": db_number(vb_val(p[5])),
                                        "pulseBandwidthMHz": db_number(vb_val(p[6]))}
                            repo.update_meas(mid, vals)
                            ctx.updated += 1
                            display_s.append(vb_str(mid))

    if display_s:
        ctx.messages.append("The following measSetId are modified based on pulseWidth: " + ", ".join(display_s))
    new_rows = repo.new_meas_grid(sel_probe, max_id)
    return ctx.result(newRows=new_rows if new_rows and new_rows.get("rows") else None)


# ---------------------------------------------------------------- cmdSaveTemp_Click

TEMP_OPTIONS = ("0", "1", "3", "4", "14")


def _freq_range_14(select_value: str) -> list[str]:
    params = split_nonempty(select_value)
    if len(params) != 3:
        raise MsiExcelError("Please input FmMHz start, end, step values!")
    start, end, step = f32(vb_val(params[0])), f32(vb_val(params[1])), f32(vb_val(params[2]))
    if float(step) == 0:
        raise MsiExcelError("Arithmetic operation resulted in an overflow. (FmMHz step 이 0 입니다)")
    size = float(f32(float(f32(float(f32(float(end) - float(start))) / float(step))) + 1))
    if math.isnan(size) or math.isinf(size) or size > MAX_TEMP_FREQ:
        raise MsiExcelError("Arithmetic operation resulted in an overflow. (FmMHz start, end, step 값을 확인하십시오)")
    n = math.ceil(size)
    if n < 0:
        raise MsiExcelError("Arithmetic operation resulted in an overflow. (FmMHz step 의 부호를 확인하십시오)")
    freq = [""] * (n + 1)
    loopnum = 0
    freq[0] = cstr(start)
    while cdbl(freq[loopnum]) <= float(end):
        loopnum += 1
        if loopnum > n:
            raise MsiExcelError("Index was outside the bounds of the array. (FmMHz start, end, step)")
        freq[loopnum] = cstr(f32(float(f32(loopnum * float(step))) + float(start)))
    return freq[:loopnum]


def save_temp(form: FormInput, repo) -> dict:
    _require_rows(form)
    opt = form.t("tempOpt")
    if opt == "" or form.t("selectLabel") == "":
        raise MsiExcelError("Please Select Options or add values for voltages or apertures.")
    if opt not in TEMP_OPTIONS:
        raise MsiExcelError(f"Temp Options '{opt}' 은(는) 지원하지 않습니다(0/1/3/4/14).")
    sel_probe = _selected_probe(form)
    ctx = _Ctx()
    max_id = repo.max_temp_set_id() or 0
    p = [""] * 22
    pitchx = pitchy0 = pitchy1 = 0.0
    az_elems = 0
    klength = 0
    loopnum = 0
    elev_loop = 0
    freq = None
    measv: list[str] = []
    aperture: list[str] = []
    cols = form.columns
    sv, sv2 = form.t("selectValue"), form.t("selectValue2")

    for row_no, row in enumerate(form.rows, start=1):
        for j, h in enumerate(cols):
            v = row[j]
            if vb_instr(h, "probeId") > 0:
                p[1] = "" if v is None else cstr(v)
            if vb_instr(h, "isScw") > 0:
                p[2] = "0"
                if v is not None:
                    b = bool_cell(v)
                    if cdbl(b, "isScw") > 0:
                        p[2] = b
            if vb_instr(h, "PulseType") > 0:
                p[3] = "" if v is None else cstr(v)
            if vb_instr(h, "CenterFrequencyM") > 0:
                freq = split_nonempty(_need(v, "CenterFrequencyM"))
            if vb_instr(h, "pulseWidthUsec") > 0:
                p[5] = ""
            if vb_instr(h, "FractionalBandwidth") > 0:
                p[6] = "" if v is None else cstr(v)
            if vb_instr(h, "ApodType") > 0:
                p[7] = "" if v is None else cstr(v)
            if vb_instr(h, "elAperType") > 0:
                p[8] = cstr(v) if _ne_empty(v) else "rect"
            if vb_instr(h, "breakPoint") > 0:
                elev_loop = 1 if v is not None and vb_val(v) > 0 else 0
            if vb_instr(h, "NumCycles") > 0:
                p[16] = "" if v is None else cstr(v)
            if vb_instr(h, "EdgeTreatment") > 0:
                p[19] = "" if v is None else cstr(v)

        for n in (4, 9, 10, 11, 12, 13, 20):
            p[n] = ""
        p[15] = opt
        p[21] = form.t("cwUseCode")

        is2d = is15d = False
        info = repo.probe_info(sql_num(p[1], "probeId"))
        if info:
            pitchx = _num(info, "azPitchCm", "azPitchCm")
            pitchy0 = _num(info, "elPitchCm", "elPitchCm")
            az_elems = int(_num(info, "azNumElements", "azNumElements"))
            if _num(info, "elNumElements", "elNumElements") > 3:
                is2d = True
            if vb_instr(cstr(info.get("probeDescription")), " 1.5D ") > 0:
                is15d = True
                elev_loop = 1 if opt == "3" else 0
            klength = 1
            if info.get("elPitch1Cm") is not None:
                pitchy1 = float(info["elPitch1Cm"])
                klength = 2
        if not is15d and not is2d:
            elev_loop = 0

        if opt == "0":
            freq = split_nonempty(sv)
            loopnum = len(freq) - 1
            klength = 1
        elif opt == "1":
            loopnum = len(freq) - 1 if freq is not None else -1
        elif opt == "4":
            freq = split_nonempty(sv)
            measv = split_nonempty(form.t("pulseVoltage"))
            loopnum = len(measv) - 1
            klength = len(freq)
        elif opt == "3":
            aperture = split_nonempty(sv)
            loopnum = len(aperture) - 1
        elif opt == "14":
            freq = _freq_range_14(sv)
            loopnum = len(freq) - 1
            klength = 1

        for k in range(klength):
            for m in range(loopnum + 1):
                p[7] = "Rectangle"
                p[5] = form.t("pulseWidthUsec")
                if opt != "1":
                    p[3] = "Rectangle"
                p[9] = "1000"
                pitchy = pitchy1 if (k == 1 and opt != "4") else pitchy0
                if opt == "0":
                    p[4] = freq[m]
                    p[17] = sv2
                    p[10] = vb_str(vb_val(p[17]) * pitchx * 10)
                    p[12] = form.t("pulseVoltage")
                elif opt == "1":
                    p[4] = freq[m]
                    p[17] = vb_str(vb_floor(az_elems / 2 + 0.5))
                    p[10] = vb_str(vb_floor(az_elems / 2 + 0.5) * pitchx * 10)
                    p[12] = form.t("pulseVoltage")
                    p[20] = sv
                elif opt == "4":
                    p[4] = freq[k]
                    p[17] = sv2
                    p[10] = vb_str(vb_val(p[17]) * pitchx * 10)
                    p[12] = measv[m]
                elif opt == "3":
                    p[4] = sv2
                    p[17] = aperture[m]
                    p[10] = vb_str(vb_val(aperture[m]) * pitchx * 10)
                    p[12] = form.t("pulseVoltage")
                else:  # "14"
                    p[4] = freq[m]
                    p[17] = sv2
                    p[10] = vb_str(vb_val(p[17]) * pitchx * 10)
                    p[12] = form.t("pulseVoltage")
                p[6] = cstr(vb_val(p[6]) * cdbl(p[4], "FmMhz"))
                if p[5] != "":
                    p[6] = vb_str(vb_div(1, vb_val(p[5])))
                    p[16] = vb_str(vb_val(p[5]) * vb_val(p[4]))
                if vb_instr(p[3], "Rectangle") > 0:
                    p[16] = vb_str(vb_floor(vb_val(p[16]) * 2 + 0.5) / 2)
                    p[6] = ""

                for ei in range(elev_loop + 1):
                    p[14] = vb_str(ei)
                    if ei == 0:
                        p[18] = "1"
                        p[11] = vb_str(pitchy * 10)
                        if is2d:
                            p[18] = vb_str(vb_floor(vb_div(1, pitchy) + 0.5))
                            p[11] = vb_str(vb_val(p[18]) * pitchy * 10)
                        if is15d and opt != "3":
                            p[11] = "100000"
                    else:
                        p[18] = "3"
                        p[11] = vb_str(pitchy1 * 10)
                        if is15d:
                            p[11] = "100000"
                    crit = [
                        ("probeId", "=", sql_num(p[1], "probeId")),
                        ("PMPulseType", "=", p[3]),
                        ("FmMhz", "=", sql_num(p[4], "FmMhz")),
                        ("azAperSizeMm", "=", sql_num(p[10], "azAperSizeMm")),
                        ("measVoltage", "=", sql_num(p[12], "measVoltage")),
                        ("azApodType", "=", "Rectangle"),
                        ("measSetNum", "=", sql_num(p[15], "measSetNum")),
                        ("elevIndex", "=", sql_num(p[14], "elevIndex")),
                    ]
                    n_dup = 0 if form.force_new else repo.count_temp(crit)
                    cond = {"PMPulseType": p[3], "FmMhz": p[4], "azAperSizeMm": p[10],
                            "measVoltage": p[12], "measSetNum": p[15], "elevIndex": p[14]}
                    if n_dup == 0:
                        repo.insert_temp(_insert_values(p, TEMP_TERMS, TEMP_TEXT_IDX, frozenset()))
                        ctx.inserted += 1
                        ctx.new(row_no, cond)
                    else:
                        ctx.dup(row_no, cond, [], f"건너뜀: temp_setting 에 같은 조건 {n_dup}건이 이미 있음")

    new_rows = repo.new_temp_grid(sel_probe, max_id)
    return ctx.result(newRows=new_rows if new_rows and new_rows.get("rows") else None)


# ---------------------------------------------------------------- #49 중복 사전 검사


class PreviewRepo:
    """쓰기를 실행하지 않는 저장소 래퍼 — 원본 저장 루틴을 그대로 돌려 중복 판정만 얻는다.

    허용 목록 밖의 메서드는 막아(AttributeError) 새 쓰기 메서드가 생겨도 사전 검사에서 실행되지 않게 한다.
    """

    preview = True
    _READS = frozenset({"max_meas_set_id", "max_temp_set_id", "probe_info", "find_meas", "count_meas", "count_temp"})

    def __init__(self, inner) -> None:
        self._inner = inner

    def __getattr__(self, name):
        if name in PreviewRepo._READS:
            return getattr(self._inner, name)
        raise AttributeError(f"사전 검사에서 허용되지 않은 저장소 호출: {name}")

    def update_meas(self, meas_set_id, values: dict) -> None:
        return None

    def insert_meas(self, values: dict) -> None:
        return None

    def insert_temp(self, values: dict) -> None:
        return None

    def update_probe_apex(self, apex, probe_id) -> None:
        return None

    def new_set_range(self, max_id: int, probe_id) -> tuple:
        return (None, None)

    def new_meas_grid(self, probe_id, max_id: int):
        return None

    def new_temp_grid(self, probe_id, max_id: int):
        return None


SAVE_KINDS = ("tank", "power", "temp")


def check_duplicates(kind: str, form: FormInput, repo) -> dict:
    """저장 전에 '이미 DB에 있는 조건'을 찾는다(쓰기 없음). 같은 저장 안에서 앞 행이 새로 만들 행과의 중복은 포함하지 않는다."""
    if kind not in SAVE_KINDS:
        raise MsiExcelError("kind 는 tank/power/temp 중 하나여야 합니다.")
    form.force_new = False
    fn = {"tank": save_tank, "power": save_power, "temp": save_temp}[kind]
    r = fn(form, PreviewRepo(repo))
    return {"kind": kind, "duplicates": r["duplicates"], "dupTotal": r["dupTotal"], "inserted": r["inserted"],
            "combos": r["combos"], "comboTotal": r["comboTotal"]}


# ---------------------------------------------------------------- 기타 버튼


def power_setid_text(set_range: str, repo, today: _dt.date | None = None) -> dict:
    """FillPwrSetId_Click + WriteTxt → {fileName, content}."""
    if set_range == "":
        raise MsiExcelError("Please fill in SetId Range! ex: 3711:3720")
    params = set_range.split(":")
    if len(params) < 2:
        raise MsiExcelError("Index was outside the bounds of the array. (SetId Range 형식: 3711:3720)")
    start = int(vb_floor(cdbl(params[0], "SetId Range")))
    stop = int(vb_floor(cdbl(params[1], "SetId Range")))
    num = stop - start
    if num + 2 < 0:
        raise MsiExcelError("Arithmetic operation resulted in an overflow. (SetId Range)")
    if num > MAX_SETID_SPAN:
        raise MsiExcelError(f"SetId Range 가 너무 넓습니다(최대 {MAX_SETID_SPAN}개).")
    lines = [""] * (num + 2)
    lines[0] = "measSetId\tPower_measSetId"
    for i in range(num + 1):
        pwr = repo.power_set_id(start + i)
        if pwr is not None:
            lines[i + 1] = vb_str(start + i) + "\t" + cstr(pwr)
    day = today or _dt.date.today()
    return {"fileName": f"MeasInput_{day.strftime('%Y%m%d')}.txt",
            "content": "".join(x + "\r\n" for x in lines)}


def update_prf(selected_probe_id, temp_limit: str, repo) -> dict:
    """cmdUpdatePrf_Click."""
    if selected_probe_id is None or cstr(selected_probe_id).strip() == "":
        raise MsiExcelError("Please select one RTP!")
    pid = sql_num(selected_probe_id, "SelectedProbeId")
    if not repo.has_init_temp(pid):
        raise MsiExcelError("No initial temp data in database.")
    limit = round(vb_val(temp_limit))
    probe = round(float(pid))
    if abs(limit) > 2**31 - 1 or abs(probe) > 2**31 - 1:
        raise MsiExcelError("Arithmetic operation resulted in an overflow.")
    repo.run_update_prf(int(probe), int(limit))
    return {"messages": []}
