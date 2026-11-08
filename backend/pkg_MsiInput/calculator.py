"""Silverstone MSI input(레거시 ``msiFromDump.vb``) 계산·분기 엔진.

DB 접근은 ``MeasStore`` 인터페이스로 분리한다. 같은 엔진을
- 미리보기: ``DryRunStore``(읽기만 하고 삽입·갱신은 메모리에 가상 반영)
- 생성: ``DbStore``(단일 트랜잭션 안에서 실제 실행)
로 돌려 두 결과가 같은 규칙에서 나오게 한다.

레거시 계산식·조건(단위가 섞인 ``2*azPitchCm`` 비교 포함)은 보존한다. 다음 결함만 교정한다.
- 문자열 연결 SQL → 파라미터 바인딩(``store.py``)
- ``max(measSetId)`` 선조회 경합 → 트랜잭션 + 앱 락
- SSR/IEC/FDA 외 purpose 에서 잘못된 레코드셋을 읽어 예외 → 건너뛰고 사유 표시
- bit 값 ``Val("True") = 0`` 오변환 → 1/0
- ``InStr(ExcelFileName, "subVerifId=12")`` 가 ``subVerifId=123`` 에도 맞던 부분일치 → 숫자 경계 확인
- 필수 값 NULL·0 나눗셈 예외 → 해당 행만 건너뛰고 사유 표시
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Protocol

PURPOSE_MODES = ("Auto Detect", "RTP", "Sample", "SSR", "FDA", "IEC", "Power")
MAX_SELECTION = 200
MAX_VERIF_TOKENS = 50
EXCEL_NAME_LIMIT = 940
FDA_NONSCAN_SUBMODES = {"D", "M", "Cm", "Cw"}

# 레거시 setMeasTerm(1..31) 순서. azFnum·elFnum 은 레거시도 INSERT 에서 제외한다.
MEAS_TERMS: tuple[str, ...] = (
    "probeId", "isScw", "PMPulseType", "FmMhz", "pulseWidthUsec", "pulseBandwidthMHz",
    "azFnum", "azApodType", "FocusPMm", "azAperSizeMm", "isPhaseInverse", "numTxCycles",
    "edgeTreatment", "elFnum", "elAperType", "FocusQMm", "elAperSizeMm", "elevIndex",
    "cpaType", "apexCm", "profVoltageVolt", "ceilTxGain", "MaxVoltageVolt", "numMeasVoltage",
    "totalVoltagePt", "zStartCm", "zEndCm", "ExcelFileName", "comments", "splitFocusEnable",
    "speedOfSoundMPerS",
)
INSERT_EXCLUDED = {"azFnum", "elFnum"}
STRING_TERMS = {"PMPulseType", "azApodType", "edgeTreatment", "elAperType", "cpaType", "ExcelFileName", "comments"}


class MsiInputError(ValueError):
    """요청 전체를 진행할 수 없는 입력 오류."""


class MsiRowError(ValueError):
    """특정 subVerif 행만 건너뛰어야 하는 계산 오류."""


# ─── verifId 필터 ───────────────────────────────────────────────────────────

_INT_RE = re.compile(r"^\d{1,9}$")


def parse_verif_filter(text: str | None) -> tuple[str, list[int]]:
    """``"1,3,5~9"`` → (``"(verifId = ? OR verifId BETWEEN ? AND ?)"``, [1, 3, 5, 9]).

    빈 입력은 필터 없음(``""``)이다. SQL 조각은 상수와 ``?`` 만으로 구성된다.
    """
    if text is None or not str(text).strip():
        return "", []
    tokens = [tok.strip() for tok in str(text).split(",") if tok.strip()]
    if len(tokens) > MAX_VERIF_TOKENS:
        raise MsiInputError(f"verifId 항목은 최대 {MAX_VERIF_TOKENS}개까지 입력할 수 있습니다.")
    parts: list[str] = []
    params: list[int] = []
    for tok in tokens:
        if "~" in tok:
            start_s, _, end_s = (s.strip() for s in tok.partition("~"))
            if not (_INT_RE.match(start_s) and _INT_RE.match(end_s)):
                raise MsiInputError(f"verifId 범위 형식 오류: {tok}")
            start, end = int(start_s), int(end_s)
            if start > end:
                raise MsiInputError(f"verifId 범위 시작이 끝보다 큽니다: {tok}")
            parts.append("verifId BETWEEN ? AND ?")
            params.extend([start, end])
        else:
            if not _INT_RE.match(tok):
                raise MsiInputError(f"verifId 형식 오류: {tok}")
            parts.append("verifId = ?")
            params.append(int(tok))
    return "(" + " OR ".join(parts) + ")", params


# ─── 값 변환·비교 헬퍼 (SQL 의미 재현) ─────────────────────────────────────


def _num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, str):
        text = value.strip()
        if text.lower() in ("true", "false"):
            return 1.0 if text.lower() == "true" else 0.0
        try:
            value = float(text)
        except ValueError:
            return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def _required(row: dict, key: str, label: str) -> float:
    value = _num(row.get(key.lower()))
    if value is None:
        raise MsiRowError(f"{label} 값이 비어 있습니다.")
    return value


def _str(value: Any) -> str | None:
    return None if value is None else str(value)


def _str_eq(a: Any, b: Any) -> bool:
    """MS-SQL 기본(대소문자 무시) collation 의 ``=``: NULL 은 거짓, 뒤 공백 무시."""
    if a is None or b is None:
        return False
    return str(a).rstrip().casefold() == str(b).rstrip().casefold()


def _num_eq(a: Any, b: Any) -> bool:
    x, y = _num(a), _num(b)
    if x is None or y is None:
        return False
    return math.isclose(x, y, rel_tol=1e-9, abs_tol=1e-12)


def _abs_lt(a: Any, b: Any, tol: float) -> bool:
    x, y = _num(a), _num(b)
    if x is None or y is None:
        return False
    return abs(x - y) < tol


def _contains_ci(text: Any, needle: str) -> bool:
    return text is not None and needle.casefold() in str(text).casefold()


def has_sub_verif_ref(excel_name: Any, sub_verif_id: int) -> bool:
    if excel_name is None:
        return False
    return re.search(rf"subVerifId={sub_verif_id}(?!\d)", str(excel_name), re.IGNORECASE) is not None


# ─── 기본 파라미터 계산 (msiFromDump.vb saveDataToMeas 290~378행) ──────────


@dataclass(frozen=True)
class ProbeGeometry:
    az_pitch_cm: float
    el_pitch_cm: float | None
    el_pitch1_cm: float | None
    mech_focus_cm: float | None
    mech_focus1_cm: float | None

    @property
    def is_1d(self) -> bool:
        return self.el_pitch1_cm is None

    @classmethod
    def from_row(cls, row: dict) -> "ProbeGeometry":
        az = _num(row.get("azpitchcm"))
        if az is None:
            raise MsiInputError("Probe_info 의 azPitchCm 값이 없습니다.")
        return cls(
            az_pitch_cm=az,
            el_pitch_cm=_num(row.get("elpitchcm")),
            el_pitch1_cm=_num(row.get("elpitch1cm")),
            mech_focus_cm=_num(row.get("mechfocuscm")),
            mech_focus1_cm=_num(row.get("mechfocus1cm")),
        )


def _div(a: float, b: float, label: str) -> float:
    if b == 0:
        raise MsiRowError(f"{label} 계산 중 0 으로 나눌 수 없습니다.")
    return a / b


def compute_base_params(sub: dict, geom: ProbeGeometry, probe_id: int, purpose: str, report_term: str) -> dict:
    """``imag_subverif`` 한 행 → meas_setting 기본 값(키는 MEAS_TERMS)."""
    p: dict[str, Any] = {term: None for term in MEAS_TERMS}
    sub_id = int(_required(sub, "subVerifId", "subVerifId"))
    pulse_type = _str(sub.get("pulsetype"))
    if not pulse_type:
        raise MsiRowError("PulseType 값이 비어 있습니다.")
    fm = _required(sub, "FmMHz", "FmMHz")
    dur = _required(sub, "PulseDurUs", "PulseDurUs")
    az_fnum = _required(sub, "AzimFnum", "AzimFnum")
    focus_p_mm = _required(sub, "FocusPCm", "FocusPCm") * 10
    el_fnum = _num(sub.get("elevfnum"))
    focus_q_cm = _num(sub.get("focusqcm"))
    elev_index = _required(sub, "ElevIndex", "ElevIndex")

    p["probeId"] = probe_id
    p["PMPulseType"] = pulse_type
    p["FmMhz"] = fm
    p["pulseWidthUsec"] = dur
    p["pulseBandwidthMHz"] = _div(1.0, dur, "pulseBandwidthMHz")
    p["azFnum"] = az_fnum
    p["azApodType"] = _str(sub.get("apodtype"))
    p["FocusPMm"] = focus_p_mm
    p["azAperSizeMm"] = _div(focus_p_mm, az_fnum, "azAperSizeMm")
    p["isPhaseInverse"] = _num(sub.get("isphaseinverse"))
    p["numTxCycles"] = dur * fm
    p["elFnum"] = el_fnum
    p["elAperType"] = _str(sub.get("apertype"))
    p["FocusQMm"] = None if focus_q_cm is None else focus_q_cm * 10

    if "cw" in pulse_type.casefold():
        p["isScw"] = 1
        p["pulseWidthUsec"] = _div(dur, p["numTxCycles"], "CW pulseWidthUsec")
        p["pulseBandwidthMHz"] = _div(1.0, p["pulseWidthUsec"], "CW pulseBandwidthMHz")
        p["numTxCycles"] = 1
    else:
        p["isScw"] = 0

    if geom.is_1d:
        if geom.el_pitch_cm is None:
            raise MsiRowError("1D Probe 의 elPitchCm 값이 없습니다.")
        p["elAperSizeMm"] = geom.el_pitch_cm * 10
    else:
        if p["FocusQMm"] is None or el_fnum is None:
            raise MsiRowError("2D Probe 의 FocusQCm/ElevFnum 값이 없습니다.")
        p["elAperSizeMm"] = _div(p["FocusQMm"], el_fnum, "elAperSizeMm")

    p["elevIndex"] = elev_index
    p["profVoltageVolt"] = _num(sub.get("txgain"))
    p["zStartCm"] = 0
    mech0 = geom.mech_focus_cm if geom.mech_focus_cm is not None else 10.0
    mech1 = geom.mech_focus1_cm if geom.mech_focus1_cm is not None else 0.0
    mech = mech1 if elev_index == 1 else mech0
    p["zEndCm"] = min(max(abs(focus_p_mm) / 10, mech) + 1, 14)
    p["ExcelFileName"] = f"From subVerifId={sub_id},{purpose},{report_term}"

    if p["pulseWidthUsec"] * fm > 12:
        p["pulseWidthUsec"] = 12 / fm
        p["numTxCycles"] = 12
        p["pulseBandwidthMHz"] = 1 / p["pulseWidthUsec"]

    split = _num(sub.get("splitfocusenable"))
    p["splitFocusEnable"] = 0 if split is None else split
    speed = _num(sub.get("soundspeed"))
    p["speedOfSoundMPerS"] = 1540 if speed is None else speed
    return p


def build_insert_row(params: dict, pulse_rate_hz: float) -> dict:
    """레거시 INSERT 규칙: 빈 값과 azFnum/elFnum 제외, ePulseString=' ', pulseRateHz 지정."""
    row: dict[str, Any] = {}
    for term in MEAS_TERMS:
        if term in INSERT_EXCLUDED:
            continue
        value = params.get(term)
        if value is None or value == "":
            continue
        row[term] = str(value) if term in STRING_TERMS else float(value)
    row["ePulseString"] = " "
    row["pulseRateHz"] = float(pulse_rate_hz)
    return row


# ─── 저장소 인터페이스 ──────────────────────────────────────────────────────


class MeasStore(Protocol):
    def probe_geometry(self, probe_id: int) -> dict | None: ...
    def sub_verif(self, sub_verif_id: int) -> dict | None: ...
    def verification(self, verif_id: int) -> dict | None: ...
    def meas_candidates(self, probe_id: int, pulse_type: str) -> list[dict]: ...
    def insert_meas(self, row: dict) -> int | None: ...
    def update_excel_name(self, meas_set_id: int, value: str) -> None: ...


# ─── 중복·기준 행 판정 (레거시 SQL 조건을 파이썬 술어로) ───────────────────


def _row_id(r: dict) -> int:
    virtual_id = r.get("_virtual_id")
    return int(virtual_id) if virtual_id is not None else int(_num(r.get("meassetid")) or 0)


def _meets_min(r: dict, min_id: int) -> bool:
    # 이번 실행에서 만든 행은 실제 ID 값과 무관하게 기준을 만족한다(미리보기·실행 판정 일치).
    return bool(r.get("_created_in_run")) or (_num(r.get("meassetid")) or 0) >= min_id


def _first(rows: Iterable[dict], newest: bool) -> dict | None:
    ordered = sorted(rows, key=lambda r: _num(r.get("meassetid")) or 0, reverse=newest)
    return ordered[0] if ordered else None


def _common_dup(r: dict, p: dict, min_id: int) -> bool:
    return (
        _num_eq(r.get("probeid"), p["probeId"])
        and _str_eq(r.get("pmpulsetype"), p["PMPulseType"])
        and _num_eq(r.get("fmmhz"), p["FmMhz"])
        and _str_eq(r.get("azapodtype"), p["azApodType"])
        and _str_eq(r.get("elapertype"), p["elAperType"])
        and _num_eq(r.get("elevindex"), p["elevIndex"])
        and _num_eq(r.get("isphaseinverse"), p["isPhaseInverse"])
        and _num_eq(r.get("splitfocusenable"), p["splitFocusEnable"])
        and _contains_ci(r.get("excelfilename"), "subVerifId")
        and _meets_min(r, min_id)
    )


def _focus_match(r: dict, p: dict, elements2: float) -> bool:
    return _abs_lt(r.get("focuspmm"), p["FocusPMm"], 2) and _abs_lt(r.get("azapersizemm"), p["azAperSizeMm"], elements2)


def _main_dup_rule(purpose: str, report_term: str, submode: str) -> tuple[str, bool, bool, bool] | None:
    """(comments 값, 초점·개구 비교, 전압 비교, FDA 비주사) 또는 지원 외 purpose 면 None."""
    if purpose == "SSR":
        return "Sample", True, False, False
    if purpose == "IEC":
        return "IEC", True, False, False
    if purpose == "FDA":
        nonscan = ("TIS" in report_term or "TIB" in report_term) and submode in FDA_NONSCAN_SUBMODES
        if nonscan:
            return "FDA", True, True, True
        return "FDA", "MI" in report_term, False, False
    return None


@dataclass
class MsiAction:
    subVerifId: int
    verifId: int | None
    branch: str
    action: str
    message: str = ""
    measSetId: int | None = None
    comments: str | None = None
    row: dict | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


@dataclass
class MsiPlan:
    actions: list[MsiAction] = field(default_factory=list)
    created_ids: list[int] = field(default_factory=list)
    # 미리보기(음수 가상 ID)와 실행(실제 ID)을 같은 순번으로 대응시키기 위한 이번 실행의 신규 ID 목록.
    inserted_ids: list[int] = field(default_factory=list)

    def fingerprint(self) -> str:
        """미리보기와 생성 결과가 같은 계획인지 비교하는 해시(신규 ID 는 생성 순번으로 정규화)."""
        ordinal = {mid: f"new#{i}" for i, mid in enumerate(self.inserted_ids)}
        items = []
        for a in self.actions:
            target = None
            if a.action in ("append", "exists", "too_long"):
                target = ordinal.get(a.measSetId, a.measSetId)
            items.append([a.subVerifId, a.branch, a.action, a.comments, target, a.row])
        blob = json.dumps(items, sort_keys=True, default=str)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        return {
            "actions": [a.to_dict() for a in self.actions],
            "planHash": self.fingerprint(),
            "summary": {
                kind: sum(1 for a in self.actions if a.action == kind)
                for kind in ("insert", "append", "exists", "too_long", "skip")
            },
        }


def _handle_duplicate(store: MeasStore, dup: dict, sub_id: int, purpose: str, report_term: str,
                      base: MsiAction) -> MsiAction:
    meas_id = _row_id(dup)
    excel = str(dup.get("excelfilename") or "")
    base.measSetId = meas_id
    if has_sub_verif_ref(excel, sub_id):
        base.action, base.message = "exists", "이미 같은 subVerifId 가 연결된 설정이 있습니다."
        return base
    if len(excel) > EXCEL_NAME_LIMIT:
        base.action = "too_long"
        base.message = "기존 설정의 ExcelFileName 이 너무 길어 subVerifId 를 추가하지 않았습니다."
        return base
    store.update_excel_name(meas_id, f"{excel}; subVerifId={sub_id},{purpose},{report_term}")
    base.action, base.message = "append", "기존 설정의 ExcelFileName 에 subVerifId 를 추가합니다."
    return base


def process_selection(
    store: MeasStore,
    probe_id: int,
    sub_verif_ids: list[int],
    purpose_mode: str,
    min_meas_set_id: int = 0,
) -> MsiPlan:
    if purpose_mode not in PURPOSE_MODES:
        raise MsiInputError("지원하지 않는 purpose 모드입니다.")
    if not sub_verif_ids:
        raise MsiInputError("선택된 subVerif 가 없습니다.")
    if len(sub_verif_ids) > MAX_SELECTION:
        raise MsiInputError(f"한 번에 최대 {MAX_SELECTION}개까지 처리할 수 있습니다.")
    geom_row = store.probe_geometry(probe_id)
    if geom_row is None:
        raise MsiInputError("Probe_info 에 해당 Probe 가 없습니다.")
    geom = ProbeGeometry.from_row(geom_row)
    elements2 = 2 * geom.az_pitch_cm

    plan = MsiPlan()
    seen: set[int] = set()
    for sub_id in sub_verif_ids:
        if sub_id in seen:
            continue
        seen.add(sub_id)
        sub = store.sub_verif(sub_id)
        if sub is None:
            plan.actions.append(MsiAction(sub_id, None, "-", "skip", "imag_subverif 에 없습니다."))
            continue
        verif_id = int(_num(sub.get("verifid")) or 0)
        verif = store.verification(verif_id)
        if verif is None or not _num_eq(verif.get("probeid"), probe_id):
            plan.actions.append(MsiAction(sub_id, verif_id, "-", "skip", "선택한 Probe 의 Verification 이 아닙니다."))
            continue
        purpose = str(verif.get("purpose") or "")
        report_term = str(verif.get("reportterm") or "")
        try:
            p = compute_base_params(sub, geom, probe_id, purpose, report_term)
        except MsiRowError as exc:
            plan.actions.append(MsiAction(sub_id, verif_id, "-", "skip", str(exc)))
            continue
        _process_one(store, plan, p, sub, sub_id, verif_id, purpose, report_term, purpose_mode,
                     min_meas_set_id, elements2)
    return plan


def _process_one(store: MeasStore, plan: MsiPlan, p: dict, sub: dict, sub_id: int, verif_id: int,
                 purpose: str, report_term: str, mode: str, min_id: int, elements2: float) -> None:
    submode = str(sub.get("submodename") or "")
    pulse_rate_hz = 0.0
    candidates = store.meas_candidates(int(p["probeId"]), str(p["PMPulseType"]))

    if "Power" not in mode or "Auto" in mode:
        rule = _main_dup_rule(purpose, report_term, submode)
        if rule is None:
            plan.actions.append(MsiAction(sub_id, verif_id, "main", "skip",
                                          f"purpose '{purpose}' 는 측정 설정 생성 대상(SSR/IEC/FDA)이 아닙니다."))
        else:
            comments, use_focus, use_volt, nonscan = rule
            p["comments"] = comments

            def is_dup(r: dict) -> bool:
                if purpose == "SSR":
                    if not _str_eq(r.get("comments"), "Sample"):
                        return False
                elif r.get("comments") is None or _str_eq(r.get("comments"), "Power"):
                    return False
                if not _common_dup(r, p, min_id):
                    return False
                if use_focus and not _focus_match(r, p, elements2):
                    return False
                if use_volt and not _abs_lt(r.get("profvoltagevolt"), p["profVoltageVolt"], 0.02):
                    return False
                return _abs_lt(r.get("pulsewidthusec"), p["pulseWidthUsec"], 0.02)

            dup = _first((r for r in candidates if is_dup(r)), newest=False)
            base = MsiAction(sub_id, verif_id, "main", "", comments=comments)
            if dup is not None:
                plan.actions.append(_handle_duplicate(store, dup, sub_id, purpose, report_term, base))
            else:
                ref = _first((r for r in candidates if (
                    _str_eq(r.get("comments"), "RTP")
                    and _num_eq(r.get("probeid"), p["probeId"])
                    and _str_eq(r.get("pmpulsetype"), p["PMPulseType"])
                    and _abs_lt(r.get("fmmhz"), p["FmMhz"], 0.01)
                    and _str_eq(r.get("azapodtype"), p["azApodType"])
                    and _str_eq(r.get("elapertype"), p["elAperType"])
                    and _num_eq(r.get("elevindex"), p["elevIndex"])
                )), newest=True)
                if ref is not None:
                    for key, term in (("edgetreatment", "edgeTreatment"), ("cpatype", "cpaType"), ("apexcm", "apexCm")):
                        if ref.get(key) is not None:
                            p[term] = ref.get(key)
                    if not nonscan:
                        p["profVoltageVolt"] = _num(ref.get("profvoltagevolt"))
                    for key, term in (("ceiltxgain", "ceilTxGain"), ("maxvoltagevolt", "MaxVoltageVolt"),
                                      ("nummeasvoltage", "numMeasVoltage"), ("totalvoltagept", "totalVoltagePt")):
                        p[term] = _num(ref.get(key))
                    pulse_rate_hz = _num(ref.get("pulseratehz")) or 0.0
                    base.message = f"RTP 기준 measSetId={_row_id(ref)} 의 전압 설정을 사용합니다."
                else:
                    base.message = "RTP 기준 설정이 없어 전압 관련 값 없이 생성합니다."
                row = build_insert_row(p, pulse_rate_hz)
                base.measSetId = store.insert_meas(row)
                base.action, base.row = "insert", row
                if base.measSetId is not None:
                    plan.inserted_ids.append(base.measSetId)
                if base.measSetId is not None and base.measSetId > 0:
                    plan.created_ids.append(base.measSetId)
                plan.actions.append(base)
                candidates = store.meas_candidates(int(p["probeId"]), str(p["PMPulseType"]))

    power_needed = "Power" in mode or (
        "Auto" in mode and purpose in ("FDA", "IEC") and "MI" not in report_term
    )
    if not power_needed:
        return

    p["comments"] = "Power"
    p["azApodType"] = "Rectangle"
    p["elAperType"] = "rect"
    base = MsiAction(sub_id, verif_id, "power", "", comments="Power")

    def power_base(r: dict) -> bool:
        return (
            _str_eq(r.get("comments"), "Power")
            and _num_eq(r.get("probeid"), p["probeId"])
            and _str_eq(r.get("pmpulsetype"), p["PMPulseType"])
            and _abs_lt(r.get("fmmhz"), p["FmMhz"], 0.01)
            and _str_eq(r.get("azapodtype"), "Rectangle")
            and _str_eq(r.get("elapertype"), "rect")
            and _num_eq(r.get("elevindex"), p["elevIndex"])
        )

    dup = _first((r for r in candidates if power_base(r)
                  and _contains_ci(r.get("excelfilename"), "subVerifId")
                  and _meets_min(r, min_id)), newest=False)
    if dup is not None:
        plan.actions.append(_handle_duplicate(store, dup, sub_id, purpose, report_term, base))
        return

    ref = _first((r for r in candidates if power_base(r)), newest=True)
    if ref is None:
        base.action, base.message = "skip", "Power 기준 설정(comments='Power')이 없어 생성하지 않습니다."
        plan.actions.append(base)
        return

    num_tx = _num(ref.get("numtxcycles"))
    if num_tx is not None:
        p["numTxCycles"] = num_tx
        p["pulseWidthUsec"] = num_tx / p["FmMhz"]
    else:
        p["numTxCycles"] = None
        p["pulseWidthUsec"] = _num(ref.get("pulsewidthusec"))
    if not p["pulseWidthUsec"]:
        base.action, base.message = "skip", "Power 기준 설정의 펄스폭이 없어 생성하지 않습니다."
        plan.actions.append(base)
        return
    p["pulseBandwidthMHz"] = 1 / p["pulseWidthUsec"]
    p["FocusPMm"] = _num(ref.get("focuspmm"))
    p["azAperSizeMm"] = _num(ref.get("azapersizemm"))
    p["edgeTreatment"] = _str(ref.get("edgetreatment"))
    if ref.get("cpatype") is not None:
        p["cpaType"] = ref.get("cpatype")
    if ref.get("apexcm") is not None:
        p["apexCm"] = ref.get("apexcm")
    p["profVoltageVolt"] = _num(sub.get("txgain")) if "FDA" in mode else _num(ref.get("profvoltagevolt"))
    for key, term in (("ceiltxgain", "ceilTxGain"), ("maxvoltagevolt", "MaxVoltageVolt"),
                      ("nummeasvoltage", "numMeasVoltage"), ("totalvoltagept", "totalVoltagePt")):
        p[term] = _num(ref.get(key))
    ref_rate = _num(ref.get("pulseratehz"))
    if ref_rate is not None:
        pulse_rate_hz = ref_rate
    elif str(p["PMPulseType"]) == "Cw":
        pulse_rate_hz = 1.0
    # 그 외에는 레거시처럼 일반 분기에서 정한 pulseRateHz 를 이어 쓴다.

    row = build_insert_row(p, pulse_rate_hz)
    base.measSetId = store.insert_meas(row)
    base.action, base.row = "insert", row
    base.message = f"Power 기준 measSetId={_row_id(ref)} 의 설정을 사용합니다."
    if base.measSetId is not None:
        plan.inserted_ids.append(base.measSetId)
    if base.measSetId is not None and base.measSetId > 0:
        plan.created_ids.append(base.measSetId)
    plan.actions.append(base)
