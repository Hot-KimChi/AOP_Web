"""Tank Data Analysis(레거시 frmTank·frmDetail·frmVoltageS) SQL·계산 로직.

원본은 로그인 사용자 스키마의 작업 테이블(trtp_measurement, ws_X_profile, ws_Y_profile,
ws_Z_profile, ws_voltage_dep, tmeasure_set)을 ``pre_RTP_tank`` 로 만들고 이후 조회·수정한다.
웹 DB 연결도 사용자 자격증명으로 열리므로 스키마 없는 이름이 같은 테이블을 가리킨다.

- 동적 식별자(z 위치 컬럼·정렬 컬럼·그래프 컬럼)는 이 모듈의 상수 allowlist 에서만 고른다.
- 값은 모두 ``?`` 파라미터. 사용자가 입력한 z 위치는 원본 SQL 리터럴과 같은 비교 의미를
  갖도록 ``CAST(? AS decimal(38, 10))`` 로 넘긴다(real 컬럼과 비교 시 real 로 변환).
"""

from __future__ import annotations

import decimal
import io
import math
import re
import struct
from typing import Any, Iterable, Sequence

from pkg_MsiInput.store import fetch_dicts, grid, json_value

GRID_LIMIT = 5000
MAX_SW_VERSIONS = 3
MAX_RESIDS = 600
MAX_WAVE_POINTS = 20000

ZLOC_COLUMNS = (
    "ztsii31Cm", "ztsii32Cm", "zmpii3Cm", "zmpiiCm", "zb3Cm", "z1Cm", "ztsii1Cm", "ztsii2Cm", "zmiCm",
)
ORDER_COLUMNS = (
    "PmPulseType", "azApodType", "elAperType", "FmMHz", "FocusPCm", "FocusQCm", "azFnum", "elFnum",
    "ePulseDurUs",
)
GRAPH_NAMES = ("Lateral", "Elevation", "Z", "Voltage", "MI", "MIF")
AUTO_GRAPHS = ("Voltage", "MI", "MIF")

# (XColumn, YColumn, SQLTable, KeyColumn, join 종류) — DrawGraph/EditGraph 의 Select Case 와 동일.
GRAPHS: dict[str, tuple[str, str, str, str, str]] = {
    "Lateral": ("xDistanceCm", "PII", "ws_X_profile", "xProfId", "zloc"),
    "Elevation": ("yDistanceCm", "PII", "ws_Y_profile", "yProfId", "zloc"),
    "Z": ("zDistanceCm", "Q.PII", "ws_Z_profile", "zProfId", ""),
    "Voltage": ("TxGain", "PII", "ws_voltage_dep", "voltId", "zloc"),
    "MI": ("TxGain", "MI", "ws_voltage_dep", "voltId", "zmi"),
    "MIF": ("TxGain", "MI", "ws_voltage_dep", "voltId", ""),
}

# SaveEdit: 그래프별 UPDATE (X 컬럼, Y 컬럼, 테이블, 키)
SAVE_EDIT: dict[str, tuple[str, str, str, str]] = {
    "Lateral": ("xDistanceCm", "PII", "ws_X_profile", "xProfId"),
    "Elevation": ("yDistanceCm", "PII", "ws_Y_profile", "yProfId"),
    "Z": ("zDistanceCm", "PII", "ws_Z_profile", "zProfId"),
    "Voltage": ("TxGain", "PII", "ws_voltage_dep", "voltId"),
    "MI": ("TxGain", "MI", "ws_voltage_dep", "voltId"),
    "MIF": ("TxGain", "MI", "ws_voltage_dep", "voltId"),
}

DEFAULT_ORDER = "PMpulseType, azApodType, elAperType, FmMHz, FocusPCm, azFnum, elFnum"
MRI_LIST_SQL = (
    "SELECT resId, PMpulseType, azApodType, elAperType, FmMHz, FocusPCm, azFnum, elFnum, mark "
    "FROM trtp_measurement ORDER BY "
)

_FOCUS_Z_SQL = (
    "SELECT zDis = d.zDistanceCm FROM dbo.meas_res_detail AS d "
    "INNER JOIN trtp_measurement AS r ON r.resId = d.resId "
    "WHERE (d.resId = ?) AND (ABS(d.zDistanceCm - r.FocusPCm) <= ALL "
    "(SELECT MIN(ABS(d.zDistanceCm - r.FocusPCm)) AS Expr1 FROM dbo.meas_res_detail AS d "
    "INNER JOIN trtp_measurement AS r ON r.resId = d.resId WHERE (d.resId = ?)))"
)

_DEC_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


class TankInputError(ValueError):
    pass


# ---------------------------------------------------------------- 값 변환
def _is_single(v: float) -> bool:
    try:
        return struct.unpack("f", struct.pack("f", v))[0] == v
    except (OverflowError, struct.error):
        return False


def vb_str(value: Any) -> str:
    """VB ``Trim(CStr(x))`` 표현. Single 로 표현 가능한 실수는 7 유효숫자, 그 밖은 15 자리."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, decimal.Decimal):
        value = float(value)
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        if value == int(value) and abs(value) < 1e15:
            return str(int(value))
        return format(value, ".7g" if _is_single(value) else ".15g").upper()
    return str(value).strip()


def decimal_text(value: Any, name: str = "값") -> str:
    """사용자 입력 숫자를 지수 표기 없는 10진 문자열로(SQL ``CAST(? AS decimal)`` 용)."""
    text = str(value).strip() if value is not None else ""
    if not _DEC_RE.match(text):
        raise TankInputError(f"{name} 값이 올바르지 않습니다.")
    d = decimal.Decimal(text)
    if not d.is_finite() or abs(d) >= decimal.Decimal(10) ** 27:
        raise TankInputError(f"{name} 값이 올바르지 않습니다.")
    if d.as_tuple().exponent < -10:
        d = d.quantize(decimal.Decimal("1e-10"))
    return format(d, "f")


def to_float(value: Any, name: str = "값") -> float:
    if isinstance(value, bool) or value is None or value == "":
        raise TankInputError(f"{name} 값이 필요합니다.")
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise TankInputError(f"{name} 값이 올바르지 않습니다.") from None
    if math.isnan(f) or math.isinf(f):
        raise TankInputError(f"{name} 값이 올바르지 않습니다.")
    return f


def to_single(value: Any, name: str = "값") -> float:
    """VB ``CSng`` → Single 정밀도 → ``CStr`` 로 SQL 에 들어가던 값."""
    f = to_float(value, name)
    try:
        s = struct.unpack("f", struct.pack("f", f))[0]
    except OverflowError:
        raise TankInputError(f"{name} 값이 Single 범위를 벗어났습니다.") from None
    if math.isinf(s):
        raise TankInputError(f"{name} 값이 Single 범위를 벗어났습니다.")
    return float(format(s, ".7g"))


def check_zloc(zloc: Any) -> str:
    if zloc not in ZLOC_COLUMNS:
        raise TankInputError("Profile z loc 값이 올바르지 않습니다.")
    return zloc


def check_graph(name: Any, allowed: Sequence[str] = GRAPH_NAMES) -> str:
    if name not in allowed:
        raise TankInputError("Unable to draw graph. Invalid graphname.")
    return name


def check_resid(value: Any) -> int:
    if isinstance(value, bool):
        raise TankInputError("resId 값이 올바르지 않습니다.")
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        value = int(value.strip())
    if not isinstance(value, int) or not 0 < value <= 2_147_483_647:
        raise TankInputError("resId 값이 올바르지 않습니다.")
    return value


def check_resids(values: Any) -> list[int]:
    if not isinstance(values, list) or len(values) > MAX_RESIDS:
        raise TankInputError("resIds 목록이 올바르지 않습니다.")
    return [check_resid(v) for v in values]


def order_clause(orders: Iterable[Any]) -> str:
    """cmdUpdate: 1st~6th order 콤보를 ", " 로 잇는다. 비면 기본 정렬."""
    cols = []
    for o in orders or []:
        if o in (None, ""):
            continue
        if o not in ORDER_COLUMNS:
            raise TankInputError("정렬 컬럼이 올바르지 않습니다.")
        cols.append(o)
    return ", ".join(cols) if cols else DEFAULT_ORDER


def sw_version_param(versions: Any) -> str:
    if not isinstance(versions, list) or not versions:
        raise TankInputError("MeasSwVersion 을 선택하세요.")
    if len(versions) > MAX_SW_VERSIONS:
        raise TankInputError(
            "Please limit your selection of 'measImgSwVersion' values to a maximum of three (3).")
    out = [str(v).strip() for v in versions]
    text = ";".join(out)
    if len(text) > 100 or any(not v for v in out):
        raise TankInputError("MeasSwVersion 값이 올바르지 않습니다.")
    return text


# ---------------------------------------------------------------- MRI 목록
def mri_item(row: dict) -> list[str]:
    """lstMRI 항목 필드(resid, pulse, azApod, elAper, Fm, Focus, azF, elF, mark 첫 글자)."""
    vals = [vb_str(row.get(k)) for k in
            ("resId", "PMpulseType", "azApodType", "elAperType", "FmMHz", "FocusPCm", "azFnum", "elFnum")]
    vals.append(vb_str(row.get("mark"))[:1])
    return vals


def mri_list(cur, order: str = DEFAULT_ORDER, skip_null_azfnum: bool = False) -> list[list[str]]:
    rows = fetch_dicts(cur, MRI_LIST_SQL + order)
    norm = [{k.lower(): v for k, v in r.items()} for r in rows]
    out = []
    for r in norm:
        if skip_null_azfnum and r.get("azfnum") is None:
            continue
        out.append(mri_item({
            "resId": r.get("resid"), "PMpulseType": r.get("pmpulsetype"), "azApodType": r.get("azapodtype"),
            "elAperType": r.get("elapertype"), "FmMHz": r.get("fmmhz"), "FocusPCm": r.get("focuspcm"),
            "azFnum": r.get("azfnum"), "elFnum": r.get("elfnum"), "mark": r.get("mark"),
        }))
    return out


def toggled_mark(mark_char: str) -> str:
    """chkMark: checked/c → unchecked, 그 밖 → checked."""
    m = (mark_char or "").strip()
    return "unchecked" if m in ("checked", "c") else "checked"


def sw_versions(cur, probe_id: int) -> list[str]:
    rows = fetch_dicts(
        cur, "SELECT DISTINCT(imagingSwVersion) AS v FROM dbo.meas_station_setup WHERE probeid = ? "
        "ORDER BY v ASC", [probe_id])
    return [vb_str(r["v"]) for r in rows if r["v"] is not None]


def run_pre_rtp_tank(cur, probe_id: int, rtp_name: str, sw_version: str) -> None:
    # 원본 ADO adCmdStoredProc 는 위치 기반 바인딩, 스키마 미지정(사용자 스키마 → dbo 순 해석)
    cur.execute("SET NOCOUNT ON; EXEC pre_RTP_tank ?, ?, ?", [probe_id, rtp_name, sw_version])
    # 후속 문장의 DB 오류는 삼키지 않고 전파해 호출자가 전체 롤백하게 한다.
    while cur.nextset():
        pass


def mark_all(cur) -> None:
    cur.execute("UPDATE trtp_measurement SET mark = 'checked'")


def set_mark(cur, resid: int, mark: str) -> None:
    if mark not in ("checked", "unchecked"):
        raise TankInputError("mark 값이 올바르지 않습니다.")
    cur.execute("UPDATE trtp_measurement SET mark = ? WHERE resId = ?", [mark, resid])


def voltage_grid_exists(cur, probe_id: int, pulse_type: str) -> bool:
    rows = fetch_dicts(cur, "SELECT TOP 1 1 AS x FROM voltage_grid WHERE probeId = ? AND PmPulseType = ?",
                       [probe_id, pulse_type])
    return bool(rows)


def insert_voltage_grid(cur, probe_id: int, pulse_type: str, voltage_string: str) -> None:
    if not str(voltage_string or ""):
        raise TankInputError("Please input Voltage String befor save.")
    cur.execute("INSERT INTO voltage_grid (probeId, PmPulseType, voltageGrid) VALUES (?, ?, ?)",
                [probe_id, pulse_type, voltage_string])


# ---------------------------------------------------------------- 그리드
def grid_sqls(zloc: str, zmin: float) -> dict[str, tuple[str, list]]:
    zloc = check_zloc(zloc)
    return {
        "Lateral": (
            "SELECT Q.resId AS MRI, zDistanceCm, xDistanceCm, PII FROM ws_X_profile AS Q "
            f"JOIN trtp_measurement AS R ON Q.resId = R.resId AND Q.zDistanceCm = R.{zloc} "
            "ORDER BY Q.resId, xDistanceCm ASC", []),
        "Elevation": (
            "SELECT Q.resId AS MRI, zDistanceCm, yDistanceCm, PII FROM ws_Y_profile AS Q "
            f"JOIN trtp_measurement AS R ON Q.resId = R.resId AND Q.zDistanceCm = R.{zloc} "
            "ORDER BY Q.resId, yDistanceCm ASC", []),
        "Z": (
            "SELECT Q.resId AS MRI, Q.zDistanceCm, Q.PII FROM ws_Z_profile AS Q "
            "JOIN trtp_measurement AS R ON Q.resId = R.resId ORDER BY Q.resId, zDistanceCm ASC", []),
        "Voltage": (
            "SELECT Q.resId AS MRI, zDistanceCm, TxGain, PII FROM ws_voltage_dep AS Q "
            f"JOIN trtp_measurement AS R ON Q.resId = R.resId AND Q.zDistanceCm = R.{zloc} "
            "ORDER BY Q.resId, TxGain ASC", []),
        "MI": (
            "SELECT Q.resId AS MRI, zDistanceCm, TxGain, MI FROM ws_voltage_dep AS Q "
            "JOIN trtp_measurement AS R ON Q.resId = R.resId AND Q.zDistanceCm = R.zmiCm "
            "ORDER BY Q.resId, TxGain ASC", []),
        "MIF": (
            "SELECT Q.resId AS MRI, zDistanceCm, TxGain, MI FROM ws_voltage_dep AS Q "
            "JOIN trtp_measurement AS R ON Q.resId = R.resId "
            "WHERE (R.FocusPCm <= 15 AND R.FocusPCm >= ? AND Q.zDistanceCm = R.FocusPCm) "
            "OR (R.FocusPCm > 15 AND Q.zDistanceCm = 15) "
            "OR (R.FocusPCm < ? AND Q.zDistanceCm = ?) OR (R.FocusPCm <= 0 AND Q.zDistanceCm = R.zbpCm) "
            "ORDER BY Q.resId, TxGain ASC", [zmin, zmin, zmin]),
    }


ZMIN_SQL = "SELECT zmin = MIN(zDistanceCm) FROM ws_voltage_dep AS Q JOIN trtp_measurement AS R ON Q.resId = R.resId"


def load_grids(cur, zloc: str, zmin: float) -> dict[str, dict]:
    sqls = grid_sqls(zloc, zmin)
    out = {}
    for name in GRAPH_NAMES:
        if name == "MIF":
            continue
        sql, params = sqls[name]
        out[name] = grid(cur, sql, params, limit=GRID_LIMIT)
    return out


def records_payload(cur, zloc: str, zmin: float | None, *, after_proc: bool) -> dict:
    """Get Records(프로시저 후) / OK(기존 작업 테이블) 공통: 목록 → 그리드 6개 → (zmin)."""
    check_zloc(zloc)
    items = mri_list(cur, DEFAULT_ORDER, skip_null_azfnum=after_proc)
    grids = load_grids(cur, zloc, zmin if zmin is not None else 0.5)
    if after_proc:
        rows = fetch_dicts(cur, ZMIN_SQL)
        zmin = next(iter(rows[0].values()), None) if rows else None
        zmin = float(zmin) if zmin is not None else 0.5
    elif zmin is None:
        zmin = 0.5
    sql, params = grid_sqls(zloc, zmin)["MIF"]
    grids["MIF"] = grid(cur, sql, params, limit=GRID_LIMIT)
    return {"items": items, "grids": grids, "zmin": zmin}


# ---------------------------------------------------------------- 그래프 SQL
def _join(kind: str, zloc: str) -> str:
    if kind == "zloc":
        return f"AND Q.zDistanceCm = R.{check_zloc(zloc)}"
    if kind == "zmi":
        return "AND Q.zDistanceCm = R.zmiCm"
    return ""


def draw_where(graph: str, resid: int, zmin: float) -> tuple[str, list]:
    """DrawGraph 의 whereCriteria1/2. MIF 는 MRI 별로 깨끗한 절을 만든다(원본 누적 버그 교정)."""
    if graph != "MIF":
        return "", []
    return (
        " AND ((R.FocusPCm <= 15 AND R.FocusPCm > 0 AND Q.zDistanceCm = R.FocusPCm) "
        "OR (R.FocusPCm <= 0 AND Q.zDistanceCm = R.zbpCm) "
        "OR (R.FocusPCm > 15 AND Q.zDistanceCm = (SELECT max(zDistanceCm) FROM ws_voltage_dep WHERE resId = ?)) "
        "OR (R.FocusPCm < ? AND Q.zDistanceCm = (SELECT min(zDistanceCm) FROM ws_voltage_dep WHERE resId = ?))) ",
        [resid, zmin, resid],
    )


def edit_zloc_clause(edit_zloc: Any, zloc: str) -> tuple[str, list]:
    """EditGraph(Voltage) ``AND Q.zDistanceCm = gEditZloc``. gEditZloc 이 컬럼명(초기값 cmdZloc.Text)이면
    원본은 SQL 오류였으므로 R.{zloc} 비교로 해석한다."""
    if edit_zloc in (None, "") or (isinstance(edit_zloc, str) and edit_zloc in ZLOC_COLUMNS):
        return f"AND Q.zDistanceCm = R.{check_zloc(zloc)}", []
    return "AND Q.zDistanceCm = ?", [to_float(edit_zloc, "zDistance")]


def edit_where(graph: str, resid: int, edit_zloc: Any, zloc: str) -> tuple[str, str, list]:
    """EditGraph: (join, where, params)."""
    if graph in ("Lateral", "Elevation"):
        return _join("zloc", zloc), "", []
    if graph == "Z":
        return "", "", []
    if graph == "Voltage":
        where, params = edit_zloc_clause(edit_zloc, zloc)
        return "", where, params
    if graph == "MI":
        return "", "AND Q.zDistanceCm = R.zmiCm", []
    return "", (
        " AND ((R.FocusPCm <= 15 AND R.FocusPCm > 0 AND Q.zDistanceCm = R.FocusPCm) "
        "OR (R.FocusPCm <= 0 AND Q.zDistanceCm = R.zbpCm) "
        "OR (R.FocusPCm > 15 AND Q.zDistanceCm = (SELECT max(zDistanceCm) FROM ws_voltage_dep WHERE resId = ?))) "
    ), [resid]


def auto_where(graph: str, resid: int, edit_zloc: Any, zloc: str, zmin: float) -> tuple[str, list]:
    """DrawAutoMiPiiCheck 의 WhereCriteria."""
    if graph == "Voltage":
        return edit_zloc_clause(edit_zloc, zloc)
    if graph == "MI":
        return "AND Q.zDistanceCm = R.zmiCm", []
    return (
        " AND ((R.FocusPCm <= 15 AND R.FocusPCm >= ? AND Q.zDistanceCm = R.FocusPCm) "
        "OR (R.FocusPCm < ? AND Q.zDistanceCm = ?) "
        "OR (R.FocusPCm > 15 AND Q.zDistanceCm = (SELECT max(zDistanceCm) FROM ws_voltage_dep WHERE resId = ?))) "
    ), [zmin, zmin, zmin, resid]


def minmax_sql(graph: str, join: str, where: str) -> str:
    x, y, table, _key, _ = GRAPHS[graph]
    return (
        f"SELECT XMin = MIN({x}), XMax = MAX({x}), YMin = MIN({y}), YMax = MAX({y}) "
        f"FROM {table} AS Q JOIN trtp_measurement AS R ON Q.resId = R.resId {join} "
        f"WHERE Q.resId = ? {where}"
    )


def points_sql(graph: str, join: str, where: str, bookmark: bool = False) -> str:
    x, y, table, key, _ = GRAPHS[graph]
    head = f"SELECT Bookmark = {key}, " if bookmark else "SELECT "
    return (
        f"{head}DataPointX = {x}, DataPointY = {y} "
        f"FROM {table} AS Q JOIN trtp_measurement AS R ON Q.resId = R.resId {join} "
        f"WHERE Q.resId = ? {where} ORDER BY {x} ASC"
    )


def _num(v: Any) -> float | None:
    v = json_value(v)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _minmax(cur, sql: str, params: list) -> dict | None:
    rows = fetch_dicts(cur, sql, params, lower=True)
    if not rows or rows[0].get("xmin") is None:
        return None
    r = rows[0]
    return {"xMin": _num(r.get("xmin")), "xMax": _num(r.get("xmax")),
            "yMin": _num(r.get("ymin")), "yMax": _num(r.get("ymax"))}


def _points(cur, sql: str, params: list, bookmark: bool = False) -> tuple[list, list]:
    rows = fetch_dicts(cur, sql, params, lower=True)
    pts = [[_num(r.get("datapointx")), _num(r.get("datapointy"))] for r in rows]
    marks = [json_value(r.get("bookmark")) for r in rows] if bookmark else []
    return pts, marks


def draw_graph(cur, graph: str, resids: list[int], zloc: str, zmin: float) -> dict:
    """DrawGraph: 체크된 MRI 순서대로 축 범위를 합치고 선 데이터를 만든다. 한 MRI 라도 범위가 없으면 중단."""
    graph = check_graph(graph)
    kind = GRAPHS[graph][4]
    join = _join(kind, zloc)
    rng = None
    for rid in resids:
        where, wparams = draw_where(graph, rid, zmin)
        mm = _minmax(cur, minmax_sql(graph, join, where), [rid] + wparams)
        if mm is None:
            return {"graph": graph, "aborted": True}
        if rng is None:
            rng = mm
        else:
            rng["xMin"] = min(rng["xMin"], mm["xMin"])
            rng["xMax"] = max(rng["xMax"], mm["xMax"])
            rng["yMin"] = min(rng["yMin"], mm["yMin"])
            rng["yMax"] = max(rng["yMax"], mm["yMax"])
    lines = []
    for rid in resids:
        where, wparams = draw_where(graph, rid, zmin)
        pts, _ = _points(cur, points_sql(graph, join, where), [rid] + wparams)
        lines.append({"resId": rid, "points": pts})
    return {"graph": graph, "aborted": False, "range": rng, "lines": lines}


def edit_graph(cur, graph: str, resid: int, zloc: str, edit_zloc: Any) -> dict:
    graph = check_graph(graph)
    join, where, wparams = edit_where(graph, resid, edit_zloc, zloc)
    mm = _minmax(cur, minmax_sql(graph, join, where), [resid] + wparams)
    if mm is None:
        return {"graph": graph, "aborted": True}
    pts, marks = _points(cur, points_sql(graph, join, where, bookmark=True), [resid] + wparams, bookmark=True)
    return {"graph": graph, "aborted": False, "range": mm, "points": pts, "bookmarks": marks}


def edit_zloc_lookup(cur, resid: int, zloc: str) -> Any:
    """OnMenuItemClick: tmeasure_set 의 zloc 값(1행일 때만)."""
    rows = fetch_dicts(cur, f"SELECT {check_zloc(zloc)} AS Zloc FROM tmeasure_set WHERE resId = ?", [resid])
    return json_value(rows[0]["Zloc"]) if len(rows) == 1 else None


def save_edit(cur, graph: str, bookmark: Any, x: Any, y: Any) -> None:
    graph = check_graph(graph)
    xcol, ycol, table, key = SAVE_EDIT[graph]
    cur.execute(f"UPDATE {table} SET {xcol} = ?, {ycol} = ? WHERE {key} = ?",
                [to_single(x, "X"), to_single(y, "Y"), check_resid(bookmark)])


# ---------------------------------------------------------------- 자동 보정
def _div(a: float, b: float) -> float:
    if b == 0:
        if a == 0 or math.isnan(a):
            return math.nan
        return math.copysign(math.inf, a)
    return a / b


def check_mi_and_pii(gains: Sequence[float], ys: Sequence[float], key: float, is_mi: bool) -> dict:
    """CheckMiAndPii 이식. 배열은 1-based(0 번 원소는 0), 수정값을 이어서 사용한다.

    원본 PII 보간식 ``(g_j^2 - g_{j-1})^2`` 오타도 그대로 보존한다. 원본에서 범위를 벗어나
    예외가 나던 인덱스(j+2 > n, n-2 < 0)는 해당 분기를 건너뛴다.
    """
    n = len(gains)
    g = [0.0] + [float(v) if v is not None else 0.0 for v in gains]
    y = [0.0] + [float(v) if v is not None else 0.0 for v in ys]
    flag = [0.0] * (n + 1)
    dip = 0
    for j in range(2, n):
        if y[j] < y[j - 1]:
            if y[j - 1] < y[j + 1]:
                k = j + 1
            elif j + 2 <= n and y[j - 1] < y[j + 2]:
                k = j + 2
            else:
                dip = 1000
                continue
            dip += 1
            flag[j] = key
            if is_mi:
                y[j] = _div(g[j] - g[j - 1], g[k] - g[j - 1]) * (y[k] - y[j - 1]) + y[j - 1]
            else:
                y[j] = _div((g[j] ** 2 - g[j - 1]) ** 2, g[k] ** 2 - g[j - 1] ** 2) * (y[k] - y[j - 1]) + y[j - 1]
    if n >= 2 and y[n] < y[n - 1]:
        dip += 1
        flag[n] = key
        a, b = n - 2, n - 1
        if is_mi:
            y[n] = _div(g[n] - g[a], g[b] - g[a]) * (y[b] - y[a]) + y[a]
        else:
            y[n] = _div(g[n] ** 2 - g[a] ** 2, g[b] ** 2 - g[a] ** 2) * (y[b] - y[a]) + y[a]
    return {"dip": dip, "gains": g[1:], "values": y[1:], "flags": flag[1:]}


def check_values(cur, resid: int, key: float, ycol: str) -> dict:
    if ycol not in ("PII", "MI"):
        raise TankInputError("Y 컬럼이 올바르지 않습니다.")
    rows = fetch_dicts(
        cur,
        f"SELECT TxGain, DataPointY = {ycol} FROM ws_Voltage_dep WHERE resId = ? AND zDistanceCm = ? "
        "ORDER BY TxGain ASC",
        [resid, key], lower=True)
    gains = [_num(r.get("txgain")) or 0.0 for r in rows]
    ys = [_num(r.get("datapointy")) or 0.0 for r in rows]
    raw_gains = [r.get("txgain") for r in rows]
    res = check_mi_and_pii(gains, ys, key, ycol == "MI")
    res["rawGains"] = raw_gains
    return res


def auto_check(cur, graph: str, resid: int, key: float, edit_zloc: Any, zloc: str, zmin: float) -> dict:
    """DrawAutoMiPiiCheck: 점검(CheckMiAndPii) + 원래 선(0) + 보정 선(1, dip>0 일 때)."""
    graph = check_graph(graph, AUTO_GRAPHS)
    ycol = GRAPHS[graph][1]
    chk = check_values(cur, resid, key, ycol)
    out = {
        "graph": graph, "resId": resid, "key": key, "dip": chk["dip"],
        "multiDipMessage": (f"There are multiple dips found in resId={resid}. Please check the results carefully"
                            if chk["dip"] > 2 else None),
        "aborted": True,
    }
    where, wparams = auto_where(graph, resid, edit_zloc, zloc, zmin)
    mm = _minmax(cur, minmax_sql(graph, "", where), [resid] + wparams)
    if mm is None:
        return out
    pts, marks = _points(cur, points_sql(graph, "", where, bookmark=True), [resid] + wparams, bookmark=True)
    corrected = None
    if chk["dip"] > 0:
        corrected = []
        for i, p in enumerate(pts):
            v = chk["values"][i] if i < len(chk["values"]) else 0.0
            v = None if (v is None or math.isnan(v) or math.isinf(v)) else v
            corrected.append([p[0], v])
            if v is not None:
                mm["yMin"] = min(mm["yMin"], v)
                mm["yMax"] = max(mm["yMax"], v)
    out.update({"aborted": False, "range": mm, "points": pts, "bookmarks": marks, "corrected": corrected})
    return out


def save_auto_check(cur, graph: str, resid: int, key: float) -> int:
    """SaveAutoCheck: 플래그된 점만 UPDATE. 같은 입력으로 다시 점검해 결과를 얻는다."""
    graph = check_graph(graph, AUTO_GRAPHS)
    ycol = GRAPHS[graph][1]
    chk = check_values(cur, resid, key, ycol)
    n = 0
    for i, f in enumerate(chk["flags"]):
        if f > 0:
            v = chk["values"][i]
            if v is None or math.isnan(v) or math.isinf(v):
                continue
            cur.execute(
                f"UPDATE ws_voltage_dep SET {ycol} = ? WHERE resId = ? AND TxGain = ? AND zDistanceCm = ?",
                [to_single(v), resid, chk["rawGains"][i], f])
            n += 1
    return n


def zdis(cur, resid: int, kind: str, zloc: str) -> Any:
    """cmdAutoCheck 의 zRequest/zmiCm/초점 z 조회."""
    if kind == "zloc":
        rows = fetch_dicts(cur, f"SELECT zDis = {check_zloc(zloc)} FROM dbo.Meas_res_summary WHERE resId = ?", [resid])
    elif kind == "zmi":
        rows = fetch_dicts(cur, "SELECT zDis = zmiCm FROM dbo.Meas_res_summary WHERE resId = ?", [resid])
    elif kind == "focus":
        rows = fetch_dicts(cur, _FOCUS_Z_SQL, [resid, resid])
    else:
        raise TankInputError("kind 값이 올바르지 않습니다.")
    return json_value(rows[0]["zDis"]) if rows else None


def z_locations(cur, resid: int) -> list:
    rows = fetch_dicts(cur, "SELECT DISTINCT zDistanceCm FROM dbo.meas_res_detail WHERE resId = ?", [resid])
    return [json_value(r["zDistanceCm"]) for r in rows]


def auto_check_all_mri(cur, zloc: str, zmin: float) -> dict:
    """cmdAutoCheckAllMRI: 모든 MRI·모든 z 에서 Voltage/MI 점검 후 확인 없이 저장."""
    mris = [json_value(r["resId"]) for r in fetch_dicts(cur, "SELECT resId FROM trtp_measurement")]
    messages, saved, checked = [], 0, 0
    for rid in mris:
        if rid is None:
            continue
        for z in z_locations(cur, rid):
            if z is None:
                continue
            for graph in ("Voltage", "MI"):
                ycol = GRAPHS[graph][1]
                chk = check_values(cur, rid, z, ycol)
                checked += 1
                if chk["dip"] > 2:
                    messages.append(f"There are multiple dips found in resId={rid}. Please check the results carefully")
                if chk["dip"] > 0:
                    saved += save_auto_check(cur, graph, rid, z)
    return {"mriCount": len(mris), "checks": checked, "updated": saved, "messages": messages}


# ---------------------------------------------------------------- frmDetail
def detail_grid(cur, resids: list[int], select_all: bool) -> dict:
    """cmdDetail: 체크된 MRI(없거나 Select All 이면 전체)의 trtp_measurement."""
    if select_all or not resids:
        return grid(cur, "SELECT * FROM trtp_measurement", [], limit=GRID_LIMIT)
    where = " OR ".join("resId = ?" for _ in resids)
    return grid(cur, f"SELECT * FROM trtp_measurement WHERE {where}", list(resids), limit=GRID_LIMIT)


def parse_waveform(text: Any) -> tuple[list[float], float]:
    """waveform 문자열: 공백 분리, Params(3) 의 마지막 글자를 뗀 값이 scale, Params(4..) 가 표본."""
    params = str(text or "").split(" ")
    if len(params) < 5:
        raise TankInputError("waveform 형식이 올바르지 않습니다.")
    try:
        scale = float(params[3][:-1])
        vals = [float(p) for p in params[4:]]
    except ValueError:
        raise TankInputError("waveform 형식이 올바르지 않습니다.") from None
    if len(vals) > MAX_WAVE_POINTS:
        raise TankInputError("waveform 이 너무 깁니다.")
    return vals, scale


def build_waveforms(waves: list[tuple[list[float], float] | None], delay: int) -> dict:
    """frmDetail.cmdPlot: 지연 이동, min/max(원 신호 기준), xMax=(len-6)/100. vbplot 은 1..Datapairs 를 그린다."""
    max_p, min_p = 0.0, 1000.0
    lines = []
    last_len = None
    for i, w in enumerate(waves):
        if w is None:
            lines.append({"points": []})
            continue
        vals, scale = w
        plen = len(vals) + 4
        last_len = plen
        ys = []
        for j in range(len(vals)):
            v = vals[j] * scale
            max_p = max(max_p, v)
            min_p = min(min_p, v)
            if (i == 0 and delay >= 0) or (i == 1 and delay < 0):
                ys.append(v)
            elif (i == 1 and j < delay) or (i == 0 and j < -delay):
                ys.append(0.0)
            elif i == 1:
                ys.append(vals[j - delay] * scale)
            else:
                ys.append(vals[j + delay] * scale)
        pairs = plen - 5
        lines.append({"points": [[round(j * 0.01, 10), ys[j]] for j in range(1, pairs + 1)]})
    x_max = (last_len - 6) / 100 if last_len is not None else 0.0
    return {"range": {"xMin": 0.0, "xMax": x_max, "yMin": min_p, "yMax": max_p}, "lines": lines}


def fetch_waveform(cur, resid: int, zloc_text: str) -> tuple[list[float], float] | None:
    rows = fetch_dicts(
        cur, "SELECT waveform FROM meas_res_detail WHERE resId = ? AND zDistanceCm = CAST(? AS decimal(38, 10))",
        [resid, zloc_text])
    if not rows:
        return None
    return parse_waveform(rows[0]["waveform"])


def _col_name(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


_XLSX_STATIC = {
    "[Content_Types].xml": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
        'officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
        'worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
}


def waveform_xlsx(cases: list[tuple[int, str, tuple[list[float], float] | None]]) -> bytes:
    """cmdSave: 열마다 "{resId} @{z}cm" 머리글 + 값. (openpyxl 미설치 → 최소 OOXML 직접 작성)"""
    import zipfile
    from xml.sax.saxutils import escape

    cells: dict[int, list[str]] = {}
    for i, (rid, z, w) in enumerate(cases):
        if w is None:
            continue
        vals, scale = w
        col = _col_name(i + 1)
        cells.setdefault(1, []).append(
            f'<c r="{col}1" t="inlineStr"><is><t>{escape(f"{rid} @{z}cm")}</t></is></c>')
        for j, v in enumerate(vals):
            x = v * scale
            if math.isfinite(x):
                cells.setdefault(j + 2, []).append(f'<c r="{col}{j + 2}"><v>{x!r}</v></c>')
    rows = "".join(f'<row r="{r}">{"".join(cells[r])}</row>' for r in sorted(cells))
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             f'<sheetData>{rows}</sheetData></worksheet>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, text in _XLSX_STATIC.items():
            zf.writestr(name, text)
        zf.writestr("xl/worksheets/sheet1.xml", sheet)
    return buf.getvalue()


def excel_filename(name: Any) -> str:
    base = re.split(r"[\\/]", str(name or "").strip())[-1]
    base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", base).strip() or "waveform"
    if not base.lower().endswith((".xlsx", ".xls")):
        base += ".xlsx"
    elif base.lower().endswith(".xls"):
        base += "x"
    return base[:150]
