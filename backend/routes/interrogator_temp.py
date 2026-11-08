"""Interrogator Temperature API — 레거시 frmTemp(intTemp) · frmTemp10 · frmWobbler 이식.

원본 VB 의 SQL 순서·조건을 그대로 따르되 모든 값은 ``?`` 바인딩이다. 사용자 스키마
테이블(trtp_temp, trtp_wobbler, temp_setting)은 원본처럼 같은 연결에서 스키마 없이
참조해 접속 사용자의 기본 스키마(gDBUser)로 해석되게 한다.
"""

from __future__ import annotations

from contextlib import contextmanager

from flask import Blueprint, g, jsonify

from pkg_Interrogator import temp_analysis as ta
from pkg_Interrogator.temperature_fit import FitInputError, fit_aperture_1d, fit_aperture_2d, fit_temp10, solve_tr_spectrum
from pkg_MsiInput.store import fetch_dicts, grid, json_value, open_raw_connection
from routes._input import RouteInputError, int_param, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger

interrogator_temp_bp = Blueprint("interrogator_temp", __name__, url_prefix="/api/interrogator/temp")

PROC_TIMEOUT_S = 2000
T10_PROC_TIMEOUT_S = 3000
MAX_ITEMS = 500
MAX_SW_VERSIONS = 3
GRAPHS = ("Spectrum", "Voltage", "HPSF", "TrSpectrum")
MATERIALS = ("A", "T")

SHOW_SELECTED_SQL = (
    "SELECT tempId, FmMHz, pulseVoltage, tempData, isDataUsable,  elevIndex, PMpulseType,  sysFmMHz, "
    "PulseBandWidthMHz, trRef,  azAperSizeCm, elAperSizeCm, measDate, measSetNum, TrRefVoltV, mark, swVersion, "
    "material, isCw, pulseWidthUsec  FROM trtp_temp WHERE isDataUsable = 'Yes' "
    "ORDER BY measSetNum, elevIndex, PMpulseType, FmMHz, pulseBandWidthMHz, azAperSizeCm, elAperSizeCm, pulseVoltage"
)
# 원본 dataGridUpdate 는 "trRef " 뒤 콤마가 빠져 trRef 가 azAperSizeCm 별칭으로 표시된다(그대로 재현).
GRID_UPDATE_SQL = (
    "SELECT tempId, FmMHz, pulseVoltage, tempData, isDataUsable,  elevIndex, PMpulseType,  sysFmMHz, "
    "PulseBandWidthMHz, trRef  azAperSizeCm, elAperSizeCm, measDate, measSetNum, TrRefVoltV, mark, swVersion, "
    "material, isCw, pulseWidthUsec  FROM trtp_temp WHERE measSetNum = ? and  PMPulseType = ? "
    "and azAperSizeCm = ? and elevIndex = ? and pulseVoltage = ? and isDataUsable = 'Yes' "
    " ORDER BY measSetNum, elevIndex, PMpulseType, FmMHz, pulseBandWidthMHz, azAperSizeCm, elAperSizeCm, pulseVoltage"
)
LIST_SQL = {
    "1": ("SELECT mtempId=min(tempId),measSetNum, elevIndex, PMpulseType, FmMHz,  mazAperSizeCm=azAperSizeCm, mark "
          "FROM trtp_temp  WHERE measSetNum = 1{u} GROUP BY measSetNum, elevIndex, PMpulseType, FmMHz, azAperSizeCm,  mark"),
    "4": ("SELECT mtempId=min(tempId),measSetNum, elevIndex, PMpulseType, pulseVoltage,  mazAperSizeCm=azAperSizeCm, mark "
          "FROM trtp_temp  WHERE measSetNum = 4{u} GROUP BY measSetNum, elevIndex, PMpulseType, pulseVoltage, azAperSizeCm, mark"),
    "3": ("SELECT mtempId=min(tempId), measSetNum, elevIndex, PMpulseType, FmMHz, mazAperSizeCm=min(azAperSizeCm),  mark "
          "FROM trtp_temp  WHERE measSetNum =3{u} GROUP BY measSetNum, elevIndex, PMpulseType, FmMHz,  mark"),
    "14": ("SELECT mtempId=min(tempId), measSetNum, elevIndex, PMpulseType, pulseVoltage, mazAperSizeCm=min(azAperSizeCm),  mark "
           "FROM trtp_temp  WHERE measSetNum =14{u} GROUP BY measSetNum, elevIndex, PMpulseType, pulseVoltage,  mark"),
}
PWR_SQL = (
    "SELECT {cols} FROM dbo.PwrSpectrum WHERE probeId= ?  and (DATEDIFF(Dy, recordDate, GETDATE()) -4 <= ALL("
    " Select MIN(DateDiff(Dy, recordDate, GETDATE())) FROM dbo.PwrSpectrum WHERE probeId= ? ) ) ORDER by fmMHz"
)
GRAPH_COLUMNS = {"Spectrum": "FmMHz", "Voltage": "FmMHz", "HPSF": "azAperSizeCm", "TrSpectrum": "FmMHz"}


# ─── 공통 ────────────────────────────────────────────────────────────────────


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _guard(fn):
    try:
        require_business_db()
        return fn()
    except (RouteInputError, FitInputError) as exc:
        return error_response(str(exc), 400)


@contextmanager
def _cursor(write: bool = False, timeout: int | None = None):
    conn = open_raw_connection(g.current_db)
    driver = getattr(conn, "driver_connection", None) or getattr(conn, "dbapi_connection", None) or conn
    previous = getattr(driver, "timeout", 0)
    done = False
    try:
        if timeout:
            driver.timeout = timeout
        yield conn.cursor()
        if write:
            conn.commit()
        done = True
    finally:
        if write and not done:
            try:
                conn.rollback()
            except Exception:
                pass
        if timeout:
            try:
                driver.timeout = previous
            except Exception:
                pass
        conn.close()


def _confirm(body: dict) -> None:
    if body.get("confirm") is not True:
        raise RouteInputError("DB 변경 확인(confirm)이 필요합니다.")


def _float(source: dict, key: str) -> float:
    value = source.get(key)
    if isinstance(value, bool) or value is None or value == "":
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.")
    try:
        out = float(value)
    except (TypeError, ValueError) as exc:
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.") from exc
    if out != out or out in (float("inf"), float("-inf")):
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.")
    return out


def _num(text: str, name: str) -> float:
    try:
        return float(str(text).replace(",", ""))
    except ValueError as exc:
        raise RouteInputError(f"{name} 값이 올바르지 않습니다.") from exc


def _text(value, name: str, max_len: int = 100) -> str:
    if not isinstance(value, str) or len(value) > max_len:
        raise RouteInputError(f"{name} 값이 올바르지 않습니다.")
    return value


def _choice(value, allowed, name: str) -> str:
    if value not in allowed:
        raise RouteInputError(f"{name} 값이 올바르지 않습니다.")
    return value


def _items(body: dict) -> list[list[str]]:
    raw = body.get("items", [])
    if not isinstance(raw, list) or len(raw) > MAX_ITEMS:
        raise RouteInputError("items 값이 올바르지 않습니다.")
    return [ta.parse_item(_text(it, "items", 300)) for it in raw]


def _first(cur, sql: str, params=()) -> dict | None:
    rows = fetch_dicts(cur, sql, params)
    return rows[0] if rows else None


def _drain(cur) -> None:
    # 프로시저 후속 문장의 DB 오류를 삼키면 부분 변경이 커밋되므로 그대로 전파한다.
    while cur.nextset():
        pass


def _route(path: str):
    def deco(fn):
        @interrogator_temp_bp.route(path, methods=["POST"], endpoint=fn.__name__)
        @handle_exceptions
        @require_auth
        @with_db_connection()
        def wrapped():
            return _guard(lambda: _ok(fn(json_body())))

        return wrapped

    return deco


# ─── frmTemp ─────────────────────────────────────────────────────────────────


def _list_items(cur, usable: bool, sets=("1", "4", "3", "14")) -> list[str]:
    items = []
    for ms in sets:
        sql = LIST_SQL[ms].format(u=" and isDataUsable = 'Yes'" if usable else "")
        cur.execute(sql)
        for row in cur.fetchall():
            items.append(ta.lst_item([json_value(v) for v in row], cdbl_fm=ms in ("3",)))
    return items


@_route("/load")
def load(body):
    """intTemp_Load: TempSwVersion 목록 + Show_Selected_Data."""
    probe_id = int_param(body, "probeId")
    with _cursor() as cur:
        cur.execute("SELECT DISTINCT imagSwVersion FROM dbo.temp_station_setup WHERE probeid = ? "
                    "ORDER BY imagSwVersion", [probe_id])
        versions = [" "] + [ta.vb_trim(r[0]) for r in cur.fetchall()]
        return {"swVersions": versions, "grid": grid(cur, SHOW_SELECTED_SQL)}


@_route("/focus")
def focus(body):
    """intTemp_GotFocus: EXEC pre_RTP_temp → lstFreq(measSetNum 1·4·3, usable)."""
    _confirm(body)
    probe_id = int_param(body, "probeId")
    with _cursor(write=True, timeout=PROC_TIMEOUT_S) as cur:
        cur.execute("EXEC pre_RTP_temp ?", [probe_id])
        _drain(cur)
        items = _list_items(cur, usable=True, sets=("1", "4", "3"))
    logger.info(f"pre_RTP_temp by {g.current_user}: probeId={probe_id}")
    return {"items": items}


@_route("/records")
def get_records(body):
    """cmdGetRecords_Click."""
    _confirm(body)
    probe_id = int_param(body, "probeId")
    versions = body.get("swVersions") or []
    if not isinstance(versions, list) or len(versions) > MAX_SW_VERSIONS:
        raise RouteInputError("Please limit your selection of 'measImgSwVersion' values to a maximum of three (3).")
    selected = ";".join(_text(v, "swVersions").strip() for v in versions if isinstance(v, str) and v.strip())
    if len(selected) > 100:
        raise RouteInputError("imagSwVersion 은 100자 이하여야 합니다.")
    with _cursor(write=True, timeout=PROC_TIMEOUT_S) as cur:
        if selected:
            cur.execute("EXEC pre_RTP_temp1 ?, ?", [probe_id, selected])
        else:
            cur.execute("EXEC pre_RTP_temp ?", [probe_id])
        _drain(cur)
        items = _list_items(cur, usable=False)
        data = {"items": items, "grid": grid(cur, SHOW_SELECTED_SQL)}
    logger.info(f"temp get records by {g.current_user}: probeId={probe_id}, sw={selected!r}")
    return data


@_route("/grid")
def show_selected(body):
    with _cursor() as cur:
        return {"grid": grid(cur, SHOW_SELECTED_SQL)}


@_route("/mark")
def mark(body):
    """chkMark_CheckStateChanged: 해당 항목 mark 반전."""
    _confirm(body)
    p = ta.parse_item(_text(body.get("item"), "item", 300))
    new_mark = "unchecked" if p[7] == "checked" else "checked"
    col = "pulseVoltage" if p[2] == "4" else "FmMHz"
    params = [new_mark, int(_num(p[1], "tempId")), int(_num(p[2], "measSetNum")), int(_num(p[3], "elevIndex")),
              p[4], _num(p[5], col), _num(p[6], "azAperSizeCm")]
    with _cursor(write=True) as cur:
        cur.execute(f"UPDATE trtp_temp SET mark = ? WHERE tempId= ? AND measSetNum = ? AND elevIndex = ? "
                    f"AND PMpulseType = ? AND ABS({col} - ?) < 0.00001 AND ABS(azAperSizeCm - ?) < 0.00001", params)
        item = ta.TAB.join(["", *p[1:7], new_mark])
        return {"item": item, "grid": grid(cur, SHOW_SELECTED_SQL)}


@_route("/mark-all")
def mark_all(body):
    _confirm(body)
    with _cursor(write=True) as cur:
        cur.execute("UPDATE trtp_temp SET mark = 'checked'")
        return {"grid": grid(cur, SHOW_SELECTED_SQL)}


@_route("/usable")
def toggle_usable(body):
    """dgvTemp_CellDoubleClick(isDataUsable 열)."""
    _confirm(body)
    temp_id = int_param(body, "tempId")
    current = body.get("value")
    new_value = "No" if isinstance(current, str) and "Yes" in current else "Yes"
    with _cursor(write=True) as cur:
        cur.execute("UPDATE trtp_temp SET isDataUsable = ? WHERE tempId = ?", [new_value, temp_id])
        cur.execute("UPDATE dbo.ws_temperature SET isDataUsable = ? WHERE tempId = ?", [new_value, temp_id])
    return {"value": new_value}


def _az_pitch(cur, probe_id: int):
    row = _first(cur, "SELECT  azPitchCm FROM Probe_info WHERE probeId=?", [probe_id])
    return json_value(row["azPitchCm"]) if row else None


def _el_list(cur, material: str) -> list[float]:
    cur.execute("SELECT DISTINCT elAperSizeCm FROM trtp_temp WHERE  measSetNum = 3 and material = ? ", [material])
    return [float(r[0]) for r in cur.fetchall() if r[0] is not None]


def _tr_graph(cur, probe_id: int, items: list[list[str]]) -> dict:
    messages: list[str] = []
    if len(items) > 1:
        return {"messages": ["Please select one item for plot."], "exit": True}
    elev = int(_num(items[0][3], "elevIndex")) if items else 0
    avail = True
    row = _first(cur, "SELECT TrSpectra FROM dbo.trSpectrum WHERE probeId = ? and elevIndex =?", [probe_id, elev])
    tr_spec = ta.split_tr_spectra(row["TrSpectra"]) if row and row["TrSpectra"] is not None else None
    if tr_spec is None:
        avail = False
    pwr = fetch_dicts(cur, PWR_SQL.format(cols="fmMHz, normSpectra"), [probe_id, probe_id])
    fm_a: list[float] = []
    convalue: list[float] = []
    if not pwr:
        avail = False
    elif avail:
        fm_a = [float(r["fmMHz"]) for r in pwr]
        conv, msg = ta.convolve_spectra([r["normSpectra"] for r in pwr], tr_spec)
        if msg:
            messages.append(msg)
        if conv is None:
            avail = False
        else:
            convalue = conv
    meas = fetch_dicts(cur, "SELECT fmMHz, tempData FROM trtp_temp WHERE measSetNum=14 and elevIndex=? "
                            "ORDER by fmMHz", [elev])
    if not meas:
        return {"messages": messages + ["no measured spectrum data!"], "exit": True}
    fx = [float(r["fmMHz"]) for r in meas]
    fy = [float(r["tempData"]) for r in meas]
    x_min, x_max, y_min, y_max = fx[0], fx[-1], min(fy), max(fy)
    lines = [{"points": [[x, y] for x, y in zip(fx, fy)], "color": "darkblue"}]
    errs = [0.0] * len(fx)
    if avail:
        x_min, x_max = fm_a[0], fm_a[-1]
        if len(convalue) > 1:
            y_min = min(y_min, min(convalue[1:]))
            y_max = max(y_max, max(convalue[1:]))
        lines.append({"points": [[x, y] for x, y in zip(fm_a, convalue)], "color": "cyan"})
        errs = ta.tr_errors(fm_a, convalue, fx, fy)
    y_min, y_max = ta.expand_range(y_min, y_max)
    if x_min == x_max:
        return {"messages": messages, "exit": True}
    return {"messages": messages, "lines": lines, "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max,
            "showLine": True, "error": {"x": fx, "y": errs, "label": ta.error_label("TrSpectrum", fx, errs)}}


def _part_sql(graph: str, ms: str, pulse_t: str, fm_volt: float, material: str, for_range: bool):
    if graph == "Voltage" and (for_range or ms == "4"):
        return "PMpulseType = ? AND ABS(pulseVoltage - ?)<0.0001 AND ", [pulse_t, fm_volt]
    if graph == "HPSF" and (for_range or ms == "3"):
        return "material = ? AND ", [material]
    if graph == "Spectrum":
        return "PMpulseType = ? AND ", [pulse_t]
    return " ", []


def _draw_graph(cur, probe_id: int, graph: str, items: list[list[str]], material: str, two_d: bool) -> dict:
    """DrawGraph(GraphName) — 원본 쿼리·범위·선 구성 순서를 그대로 따른다."""
    title, xl, yl = ta.GRAPH_TITLES[graph]
    base = {"title": title, "xLabel": xl, "yLabel": yl}
    el_nums = _el_list(cur, material) if graph == "HPSF" else []
    loop_count = len(el_nums) if graph == "HPSF" else 1
    if graph == "TrSpectrum":
        return {**base, **_tr_graph(cur, probe_id, items)}

    x_col = GRAPH_COLUMNS[graph]
    graph_ms = ta.GRAPH_MEAS_SET[graph]
    y = [0.0] * 5
    rng = None
    for p in items:
        elev = int(_num(p[3], "elevIndex"))
        fm_volt = _num(p[5], "Fm/Volt")
        coeff = _first(cur, "SELECT hpsfcoeff0, hpsfcoeff1, hpsfcoeff2, hpsfcoeff3, hpsfcoeff4 FROM temp_coeff "
                            "WHERE  probeId = ? and material = ?  and elevIndex = ?", [probe_id, material, elev])
        if coeff:
            y = [float(coeff[f"hpsfcoeff{k}"] or 0) for k in range(5)]
        part, params = _part_sql(graph, graph_ms, p[4], fm_volt, material, True)
        r = _first(cur, f"SELECT XMin = MIN({x_col}), XMax = MAX({x_col}), YMin = MIN(tempData), YMax =  MAX(tempData) "
                        f"FROM trtp_temp WHERE {part} measSetNum = ? and elevIndex = ? and isDataUsable = 'Yes' ",
                   params + [int(graph_ms), elev])
        if r and r["XMin"] is not None:
            vals = [float(r[k]) for k in ("XMin", "XMax", "YMin", "YMax")]
            if rng is None:
                rng = vals
            else:
                rng = [min(rng[0], vals[0]), max(rng[1], vals[1]), min(rng[2], vals[2]), max(rng[3], vals[3])]
    if rng is None:
        return {**base, "exit": True, "messages": []}
    x_min, x_max = rng[0], rng[1]
    y_min, y_max = ta.expand_range(rng[2], rng[3])
    if x_min == x_max:
        return {**base, "exit": True, "messages": []}

    lines = []
    error = None
    for idx, p in enumerate(items):
        ms, elev, pulse_t = p[2], int(_num(p[3], "elevIndex")), p[4]
        fm_volt = _num(p[5], "Fm/Volt")
        for n in range(1, loop_count + 1):
            part, params = _part_sql(graph, ms, pulse_t, fm_volt, material, False)
            cur.execute(f"SELECT DataPointX = {x_col}, DataPointY = tempData FROM trtp_temp WHERE {part} "
                        f"measSetNum = ? and elevIndex = ? and isDataUsable = 'Yes' ORDER BY {x_col} ASC",
                        params + [int(_num(ms, "measSetNum")), elev])
            pts = [[float(a), float(b)] for a, b in cur.fetchall()]
            if graph == "HPSF" and ms == "3":
                el = el_nums[n - 1]
                xs = [q[0] for q in pts]
                errs = ta.hpsf_errors(y, xs, [q[1] for q in pts], two_d, el)
                error = {"x": xs, "y": errs, "label": ta.error_label("HPSF", xs, errs)}
                lines.append({"points": pts, "item": idx})
                lines.append({"points": ta.hpsf_curve(y, x_min, x_max, two_d, el), "color": "lightcyan"})
            else:
                lines.append({"points": pts, "item": idx})
    out = {**base, "lines": lines, "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max,
           "showLine": graph != "HPSF", "messages": []}
    if error is not None:
        out["error"] = error
    return out


@_route("/plot")
def plot(body):
    probe_id = int_param(body, "probeId")
    graph = _choice(body.get("graph"), GRAPHS, "graph")
    material = _choice(body.get("material", "A"), MATERIALS, "material")
    items = _items(body)
    with _cursor() as cur:
        return _draw_graph(cur, probe_id, graph, items, material, bool(body.get("isTwoD")))


def _edit_where(graph: str, ds: dict, material: str):
    if graph == "Voltage":
        return "PMpulseType = ? AND ABS(pulseVoltage - ?) < 0.0001 AND ", [ds["pulseT"], _num(ds["fmVolt"], "Fm/Volt")]
    if graph == "HPSF":
        return "material = ? AND ", [material]
    if graph == "Spectrum":
        return "PMpulseType = ? AND ", [ds["pulseT"]]
    return "", []


def _grid_update(cur, ds: dict):
    if ds["mSetNum"] != "4":
        return None
    return grid(cur, GRID_UPDATE_SQL, [4, ds["pulseT"], _num(ds["azAperS"], "AzAperS"),
                                       int(_num(ds["elevIndex"], "ElevIndex")), _num(ds["fmVolt"], "Fm/Volt")])


@_route("/edit-data")
def edit_data(body):
    """mnuEditGraph 데이터셋 선택 → EditGraph + dataGridUpdate."""
    graph = _choice(body.get("graph"), GRAPHS, "graph")
    material = _choice(body.get("material", "A"), MATERIALS, "material")
    ds = ta.parse_edit_menu(_text(body.get("dataset"), "dataset", 300))
    if ds["mSetNum"] != ta.GRAPH_MEAS_SET[graph]:
        return {"skip": True}
    x_col = GRAPH_COLUMNS[graph]
    part, params = _edit_where(graph, ds, material)
    ms = int(ta.GRAPH_MEAS_SET[graph])
    with _cursor() as cur:
        r = _first(cur, f"SELECT XMin = MIN({x_col}), XMax = MAX({x_col}), YMin =  MIN(tempData), YMax = MAX(tempData) "
                        f"FROM trtp_temp WHERE {part} measSetNum = ? ", params + [ms])
        cur.execute(f"SELECT tempId, DataPointX = {x_col}, DataPointY = tempData FROM trtp_temp WHERE {part} "
                    f"measSetNum = ? and isDataUsable = 'Yes' ORDER BY {x_col} ASC", params + [ms])
        pts = [[json_value(a), float(b), float(c)] for a, b, c in cur.fetchall()]
        data = {"graphName": graph, "fmVolt": ds["fmVolt"], "points": pts, "grid": _grid_update(cur, ds)}
    if r and r["XMin"] is not None:
        y_min, y_max = ta.expand_range(float(r["YMin"]), float(r["YMax"]))
        data.update(xMin=float(r["XMin"]), xMax=float(r["XMax"]), yMin=y_min, yMax=y_max)
    return data


@_route("/save-edit")
def save_edit(body):
    """SaveEdit(GraphName, DataPoint)."""
    _confirm(body)
    graph = _choice(body.get("graph"), GRAPHS, "graph")
    material = _choice(body.get("material", "A"), MATERIALS, "material")
    ds = ta.parse_edit_menu(_text(body.get("dataset"), "dataset", 300))
    x, y = _float(body, "x"), _float(body, "y")
    out: dict = {"graph": graph}
    if graph == "TrSpectrum":
        return out
    with _cursor(write=True) as cur:
        if graph == "Voltage":
            # 원본은 PMPulseType= ' X' (따옴표 안 선행 공백)로 매칭되지 않던 결함이 있어 수정한다.
            old_x = _float(body, "oldX")
            cur.execute("UPDATE trtp_temp SET tempData = ? WHERE measSetNum = ? and PMPulseType= ? "
                        "and ABS(azAperSizeCm - ?) < 0.00001 and elevIndex = ? and ABS(pulseVoltage - ?) < 0.0001 "
                        "and ABS(FmMhz - ?) < 0.0001",
                        [y, int(_num(ds["mSetNum"], "mSetNum")), ds["pulseT"], _num(ds["azAperS"], "AzAperS"),
                         int(_num(ds["elevIndex"], "ElevIndex")), _num(ds["fmVolt"], "Fm/Volt"), old_x])
            out["grid"] = _grid_update(cur, ds)
        elif graph == "Spectrum":
            key = int_param(body, "tempId")
            r = _first(cur, "SELECT azAperSizeCm, elAperSizeCm FROM trtp_temp WHERE tempId= ?", [key])
            if not r:
                raise RouteInputError("tempId 에 해당하는 데이터가 없습니다.")
            cur.execute("UPDATE trtp_temp SET FmMHz = ?, tempData = ? WHERE tempId = ?", [x, y, key])
            cur.execute("UPDATE ws_temperature SET temperatureC = ? * pulseRateHz WHERE tempId = ?",
                        [y * float(r["azAperSizeCm"]) * float(r["elAperSizeCm"]), key])
        else:
            key = int_param(body, "tempId")
            r = _first(cur, "SELECT  azAperSizeCm, elAperSizeCm FROM trtp_temp WHERE tempId= ? AND material = ?",
                       [key, material])
            if not r:
                raise RouteInputError("tempId 에 해당하는 데이터가 없습니다.")
            cur.execute("UPDATE trtp_temp SET azAperSizeCm = ?, tempData = ? WHERE tempId = ? AND material = ?",
                        [x, y, key, material])
            cur.execute("UPDATE ws_temperature SET temperatureC = ? * pulseRateHz  WHERE tempId = ? AND material = ?",
                        [y * x * float(r["elAperSizeCm"]), key, material])
            out["aperRunEnabled"] = True
    logger.info(f"temp SaveEdit by {g.current_user}: graph={graph}")
    return out


@_route("/aper-run")
def aper_run(body):
    """cmdAperRun_Click — fmincon 대체 fit_aperture_1d/2d, 그룹별 temp_coeff INSERT."""
    _confirm(body)
    probe_id = int_param(body, "probeId")
    material = _choice(body.get("material", "A"), MATERIALS, "material")
    msgs: list[str] = []
    state = {"plotEnabled": None, "aperRunEnabled": None, "isTwoD": None, "messages": msgs}
    with _cursor(write=True) as cur:
        cur.execute("SELECT DISTINCT elevIndex FROM trtp_temp WHERE measSetNum=3 and material = ? ORDER BY elevIndex",
                    [material])
        elevs = [int(r[0]) for r in cur.fetchall()]
        if not elevs:
            msgs.append("No aperture data is found")
            return state
        groups = fetch_dicts(cur, "SELECT DISTINCT elevIndex, PMpulseType, FmMHz, pulseBandWidthMHz, pulseVoltage "
                                  "FROM trtp_temp WHERE measSetNum=3 AND material = ? ", [material])
        if len(groups) > len(elevs):
            msgs.append("error: data of each elevIndex should all have same pulse parameters, voltage, "
                        "apodization Rectangle/rect, zero scan range")
            return state
        if not groups:
            msgs.append("error: zero record found")
            return {**state, "plotEnabled": True, "aperRunEnabled": False}
        for i, elev in enumerate(elevs, start=1):
            exist = _first(cur, "SELECT  * FROM temp_coeff WHERE probeId= ? and material = ? and elevIndex = ?",
                           [probe_id, material, elev])
            if exist and exist.get("tempCoeffId") is not None:
                msgs.append("There is a record set of temp coeff in db.")
                continue
            probe = _first(cur, "SELECT  azPitchCm, elPitchCm, elPitch1Cm, azNumElements, elNumElements "
                                "FROM Probe_info WHERE probeId=?", [probe_id])
            if not probe:
                raise RouteInputError("Probe_info 에 프로브가 없습니다.")
            az_pitch = float(probe["azPitchCm"] or 0)
            el_pitch = float(probe["elPitchCm"] or 0)
            el_num = int(probe["elNumElements"] or 0)
            if i > 1:
                el_pitch = float(probe["elPitch1Cm"] or 0)
                el_num = 1
            if len(elevs) == 1 and el_num <= 3:
                el_num = 1
            two_d = el_num not in (1, 3)
            state["isTwoD"] = two_d
            rows = fetch_dicts(cur, "SELECT measDate, FmMHz, tempData, azAperSizeCm, elAperSizeCm, normCoeff "
                                    "FROM trtp_temp WHERE measSetNum=3 AND material = ? and elevIndex = ?",
                               [material, elev])
            if len(rows) - 1 <= 0:
                msgs.append("No data is found for MeasSetNum = 3")
                return state
            az = [float(r["azAperSizeCm"]) for r in rows]
            el = [float(r["elAperSizeCm"]) for r in rows]
            tr = [float(r["tempData"]) for r in rows]
            if not two_d:
                res = fit_aperture_1d(az, tr, [float(r["normCoeff"]) for r in rows])
                x1 = res.coefficients
                msgs.append(f"x1(0) = {x1[0]}, x1(1) = {x1[1]}, x1(2) = {x1[2]}")
                cur.execute("INSERT INTO dbo.temp_coeff VALUES (?, ?, ?, ?, 0, 0, ?, ?)",
                            [probe_id, x1[0], x1[1], x1[2], material, elev])
                if az_pitch and x1[2] / az_pitch < 10:
                    msgs.append("X1(2)/pitch is less than 10, Please check the fitting coefficients!!!")
            else:
                res = fit_aperture_2d(az, el, tr)
                x2 = res.coefficients
                # 원본 MsgBox 는 x2(1) 자리에 X2(2) 를 출력한다(그대로 재현).
                msgs.append(f"x2(0) = {x2[0]}, x2(1) = {x2[2]}, x2(2) = {x2[2]}, x2(3) = {x2[3]}, x2(4) = {x2[4]}")
                cur.execute("INSERT INTO dbo.temp_coeff VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                            [probe_id, *x2, material])
                if (az_pitch and x2[3] / az_pitch < 10) or (el_pitch and x2[4] / el_pitch < 10):
                    msgs.append("(X2(3)/azPitch) or (X2(4)/elPitch) is less than 10, "
                                "Please check the fitting coefficients!!!")
    logger.info(f"temp_coeff generation by {g.current_user}: probeId={probe_id}, material={material}")
    return {**state, "plotEnabled": True, "aperRunEnabled": False}


@_route("/tr-spec")
def tr_spec(body):
    """cmdTrSpec_Click — sys_spectrum\\TR_meas 를 최소제곱으로 풀어 dbo.trSpectrum INSERT."""
    _confirm(body)
    probe_id = int_param(body, "probeId")
    msgs: list[str] = []
    inserted = []
    with _cursor(write=True) as cur:
        cur.execute("SELECT DISTINCT(elevIndex) FROM trtp_temp WHERE measSetNum=14 ")
        elevs = [int(r[0]) for r in cur.fetchall()][:3]
        if not elevs:
            msgs.append("No spectrum data is found")
        for elev in elevs:
            if _first(cur, "SELECT * FROM dbo.trSpectrum WHERE probeId = ? and elevIndex = ?", [probe_id, elev]):
                msgs.append("TR Spectrum is already in database. If you want a new one, please delete the old one "
                            f"first. (elevIndex = {elev})")
                break
            meas = fetch_dicts(cur, "SELECT fmMHz, tempData FROM trtp_temp WHERE measSetNum=14 and elevIndex = ? "
                                    "ORDER by fmMHz", [elev])
            if not meas:
                msgs.append("no measured spectrum data!")
                break
            pwr = fetch_dicts(cur, PWR_SQL.format(cols="spectrumStartMHz, spectrumStepMHz, fmMHz, normSpectra"),
                              [probe_id, probe_id])
            if not pwr:
                msgs.append("no system power spectrum data!")
                break
            try:
                matrix = ta.parse_pwr_matrix([r["normSpectra"] for r in pwr])
                fm_a = [float(r["fmMHz"]) for r in pwr]
                norm_tr = ta.array_interp([float(r["fmMHz"]) for r in meas], [float(r["tempData"]) for r in meas],
                                          fm_a)
            except FitInputError as exc:
                msgs.append(str(exc))
                break
            sol = solve_tr_spectrum(matrix, norm_tr)
            text = ta.tr_spectrum_string(sol["probeSpectrum"])
            if text:
                cur.execute("INSERT INTO dbo.trSpectrum VALUES (?, GETDATE(), ?, ?)", [probe_id, text, elev])
                inserted.append(elev)
    if inserted:
        logger.info(f"trSpectrum insert by {g.current_user}: probeId={probe_id}, elev={inserted}")
    return {"messages": msgs, "inserted": inserted}


@_route("/nonlinear-error")
def nonlinear_error(body):
    """DrawError("Voltage") — NonLinearity Error in Db."""
    probe_id = int_param(body, "probeId")
    with _cursor() as cur:
        lut = _first(cur, "SELECT   l.* FROM dbo.tempPrb_LUT AS l INNER JOIN dbo.tempPrbVolt_LUT AS v "
                          "ON l.tempPrbLUTId = v.tempPrbLUTId WHERE (l.probeId = ?) ORDER BY l.tempPrbLUTId desc",
                     [probe_id])
        if not lut:
            return {"messages": ["No records of nonlinear data!"], "exit": True}
        lut_id = lut["tempPrbLUTId"]
        start = float(lut["SpectrumStartMHz"])
        step = float(lut["SpectrumStepMHz"])
        cur.execute("SELECT DISTINCT pulseVoltage FROM trtp_temp WHERE  measSetNum = 4  ")
        volts = [float(r[0]) for r in cur.fetchall() if r[0] is not None]
        lines = []
        nonlinear: list[float] = []
        for n, v in enumerate(volts):
            r = _first(cur, "SELECT probeTrNonlinear FROM dbo.tempPrbVolt_LUT WHERE TempPrbLutId = ? "
                            "AND abs(TrVoltPointV - ?) <0.01", [lut_id, v])
            if r:
                nonlinear = ta.parse_nonlinear(r["probeTrNonlinear"])
            cur.execute("SELECT DataPointX = FmMHz, DataPointY = tempData FROM trtp_temp "
                        "WHERE  measSetNum = 4 AND pulseVoltage = ? ORDER BY FmMHz", [v])
            data = [(float(a), float(b)) for a, b in cur.fetchall()]
            pts = ta.nonlinear_errors(start, step, nonlinear, [d[0] for d in data], [d[1] for d in data])
            lines.append({"points": pts, "color": ["blue", "cyan", "darkmagenta", "medyellow", "purple",
                                                   "medgreen", "medgrey"][n % 7]})
    xs = [p[0] for ln in lines for p in ln["points"]]
    ys = [p[1] for ln in lines for p in ln["points"] if p[1] is not None]
    x_min, x_max = (min(xs + [1000.0]), max(xs + [0.0]))
    y_min, y_max = ta.expand_range(min(ys + [1000.0]), max(ys + [0.0]))
    if x_min == x_max:
        return {"exit": True, "messages": []}
    return {"title": "NonLinearity Error in Db", "lines": lines, "xMin": x_min, "xMax": x_max,
            "yMin": y_min, "yMax": y_max, "showLine": True, "messages": []}


# ─── frmTemp10 ───────────────────────────────────────────────────────────────

T10_PART = " probeId = ? and TempSSId = ? and TempSetId = ?"


def _t10_ids(body: dict) -> list[int]:
    return [int_param(body, "probeId"), int_param(body, "tempSSId"), int_param(body, "tempSetId")]


@_route("/t10/probes")
def t10_probes(body):
    with _cursor() as cur:
        cur.execute("SELECT ProbeId FROM dbo.probe_info ORDER BY ProbeId ASC")
        return {"probes": [json_value(r[0]) for r in cur.fetchall()]}


@_route("/t10/probe")
def t10_probe(body):
    """cboProbeId_SelectedIndexChanged: temp_station_setup, EXEC get10TempSetId, temp_setting."""
    _confirm(body)
    probe_id = int_param(body, "probeId")
    with _cursor(write=True, timeout=T10_PROC_TIMEOUT_S) as cur:
        ss = grid(cur, "SELECT * FROM dbo.temp_station_setup WHERE probeId = ? ORDER BY tempSSId", [probe_id])
        cur.execute("EXEC get10TempSetId ?", [probe_id])
        _drain(cur)
        sets = grid(cur, "SELECT * FROM temp_setting WHERE probeId = ? ORDER BY tempSetId", [probe_id])
    return {"stations": ss, "sets": sets}


@_route("/t10/rows")
def t10_rows(body):
    """dgvTempSet 행 헤더 더블클릭: temperature10mins."""
    ss, ts = int_param(body, "tempSSId"), int_param(body, "tempSetId")
    with _cursor() as cur:
        return {"grid": grid(cur, "SELECT * FROM dbo.temperature10mins WHERE tempSSId = ? and  tempSetId = ? "
                                  "ORDER BY temp10Id", [ss, ts])}


def _t10_fit(cur, probe_id: int, ss: int, ts: int) -> tuple[bool, dict]:
    """cmdConverter 데이터 수집 + MatlabTemp10Fit. 반환: (데이터 있음, 결과)."""
    r = _first(cur, f"Select temperatureC, tempId from dbo.temperature10mins WHERE {T10_PART} and timeElapsedS = 0 ",
               [probe_id, ss, ts])
    if not r or r["temperatureC"] is None:
        return False, {}
    temp0 = float(r["temperatureC"])
    cur.execute(f"Select timeElapsedS, temperatureC from dbo.temperature10mins WHERE {T10_PART} "
                "order by timeElapsedS desc", [probe_id, ss, ts])
    rows = [(float(a), float(b)) for a, b in cur.fetchall()]
    if not rows:
        return False, {}
    t, y = ta.temp10_rise_arrays(rows, temp0)
    res = fit_temp10(t, y)
    c = res.coefficients
    saved = False
    if not _first(cur, f"Select * from dbo.temp10_fit_coeff WHERE {T10_PART}", [probe_id, ss, ts]):
        cur.execute("INSERT INTO dbo.temp10_fit_coeff (probeId, tempSetId,tempSSId, tau1, tau2, c1, c2, c3, c4, error)"
                    "  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [probe_id, ts, ss, *c, res.error])
        saved = True
    return True, {"coefficients": c, "error": res.error, "inserted": saved, "warnings": res.warnings}


def _save30(cur, probe_id: int, ss: int, ts: int) -> str | None:
    """saveTemp30 — 30분 온도를 dbo.temperature 로 저장."""
    params = [probe_id, ss, ts]
    coeff = _first(cur, f"SELECT temp10FitId, tau1, tau2, c1, c2, c3, c4 FROM dbo.temp10_fit_coeff WHERE {T10_PART}",
                   params)
    if not coeff:
        return "No temp coefficients found!"
    c = [float(coeff[k]) for k in ("tau1", "tau2", "c1", "c2", "c3", "c4")]
    first = _first(cur, f"SELECT measDate, roomTempC FROM dbo.temperature10mins WHERE {T10_PART} and timeElapsedS<= "
                        f"(SELECT min(timeElapsedS)  FROM dbo.temperature10mins WHERE {T10_PART})", params + params)
    last = _first(cur, f"SELECT roomTempC FROM dbo.temperature10mins WHERE {T10_PART} and timeElapsedS>= "
                       f"(SELECT max(timeElapsedS)  FROM dbo.temperature10mins WHERE {T10_PART})", params + params)
    if not first or not last:
        return "No data is found for this tempSetId and TempSSId"
    t30 = ta.temp30(c, float(first["roomTempC"] or 0), float(last["roomTempC"] or 0))
    meta = fetch_dicts(cur, f"SELECT distinct measSetNum, TrRefVoltV, pulseRateHz, material  "
                            f"FROM dbo.temperature10mins WHERE {T10_PART}", params)
    if len(meta) > 1:
        return "Multiple values of TrRefVoltV, pulseRateHz, material in temperature10mins"
    if not meta:
        return "No data is found for this tempSetId and TempSSId"
    m = meta[0]
    cur.execute("INSERT INTO dbo.temperature (probeId, tempSetId, tempSSId, measDate, measSetNum, roomTempC, "
                "TrRefVoltV, temperatureC,  pulseRateHz, material, comments)  VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, "
                "'Converted from short period measurement')",
                [probe_id, ts, ss, first["measDate"], m["measSetNum"], m["TrRefVoltV"], t30, m["pulseRateHz"],
                 m["material"]])
    tid = _first(cur, "SELECT mTempId=max(tempId) FROM dbo.temperature WHERE probeId = ? AND tempSetId = ?",
                 [probe_id, ts])
    cur.execute("UPDATE dbo.temp10_fit_coeff SET tempId = ? WHERE temp10FitId= ?",
                [tid["mTempId"] if tid else None, coeff["temp10FitId"]])
    return None


@_route("/t10/convert")
def t10_convert(body):
    """cmdConverter_Click."""
    _confirm(body)
    if not body.get("material"):
        return {"messages": ["Please select material Air or Tmm!"], "ok": False}
    ids = _t10_ids(body)
    with _cursor(write=True) as cur:
        found, result = _t10_fit(cur, *ids)
    if not found:
        return {"messages": ["No data is found for this tempSetId and TempSSId"], "ok": False}
    logger.info(f"temp10 convert by {g.current_user}: ids={ids}")
    return {"messages": [], "ok": True, **result}


@_route("/t10/plot")
def t10_plot(body):
    """frmTemp10.DrawGraph."""
    ids = _t10_ids(body)
    msgs: list[str] = []
    with _cursor() as cur:
        r = fetch_dicts(cur, f"SELECT XMin = MIN(timeElapsedS), XMax = MAX(timeElapsedS), YMin = MIN(temperatureC), "
                             f"YMax = MAX(temperatureC) FROM dbo.temperature10mins WHERE {T10_PART}", ids)
        init = _first(cur, f"SELECT temperatureC FROM dbo.temperature10mins WHERE {T10_PART} and timeElapsedS<= "
                           f"(SELECT min(timeElapsedS)  FROM dbo.temperature10mins WHERE {T10_PART})", ids + ids)
        cur.execute(f"SELECT DataPointX = timeElapsedS, DataPointY = temperatureC FROM dbo.temperature10mins "
                    f"WHERE {T10_PART} ORDER BY timeElapsedS ASC", ids)
        raw = [(float(a), float(b)) for a, b in cur.fetchall()]
        coeff = _first(cur, f"SELECT tau1, tau2, c1, c2, c3, c4 FROM dbo.temp10_fit_coeff WHERE {T10_PART}", ids)
    if not r or r[0]["XMin"] is None or not init:
        return {"exit": True, "messages": msgs}
    t0 = float(init["temperatureC"])
    x_min, x_max = float(r[0]["XMin"]), 1800.0
    y_min, y_max = 0.0, float(r[0]["YMax"]) - t0
    if x_min == x_max or y_min == y_max:
        return {"exit": True, "messages": msgs}
    lines = [{"points": [[x, yv - t0] for x, yv in raw], "color": "black"}]
    if coeff:
        c = [float(coeff[k]) for k in ("tau1", "tau2", "c1", "c2", "c3", "c4")]
        lines.append({"points": ta.temp10_curve(c), "color": "red"})
        end = ta.finite(ta.temp10_value(c, 1800.0))
        if end is not None:
            y_max = max(y_max, end)
    else:
        msgs.append("No temp coefficients found!")
    return {"title": "TempRise vs. Time elapse", "xLabel": "Time elapse (s)", "yLabel": "TempRise (C)",
            "lines": lines, "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max, "showLine": True,
            "messages": msgs}


@_route("/t10/save30")
def t10_save30(body):
    _confirm(body)
    ids = _t10_ids(body)
    with _cursor(write=True) as cur:
        msg = _save30(cur, *ids)
    logger.info(f"temp10 save30 by {g.current_user}: ids={ids}, msg={msg}")
    return {"messages": [msg] if msg else []}


def _set_ids(body: dict) -> list[int]:
    raw = body.get("tempSetIds")
    if not isinstance(raw, list) or len(raw) > MAX_ITEMS:
        raise RouteInputError("tempSetIds 값이 올바르지 않습니다.")
    return [int_param({"v": v}, "v") for v in raw]


@_route("/t10/multi-rows")
def t10_multi_rows(body):
    """cmdGetRecords / cmdAllRecords: 선택된 세트별 temperature10mins 를 차례로 이어 붙인다."""
    ss = int_param(body, "tempSSId")
    out = {"columns": [], "rows": [], "truncated": False}
    with _cursor() as cur:
        for ts in _set_ids(body):
            part = grid(cur, "SELECT * FROM dbo.temperature10mins WHERE tempSSId = ? and  tempSetId = ? "
                             "ORDER BY temp10Id", [ss, ts])
            if part["columns"]:
                out["columns"] = part["columns"]
            out["rows"].extend(part["rows"])
            out["truncated"] = out["truncated"] or part["truncated"]
            if len(out["rows"]) >= 5000:
                out["rows"] = out["rows"][:5000]
                out["truncated"] = True
                break
    return {"grid": out}


@_route("/t10/multi-convert")
def t10_multi_convert(body):
    """cmdMultiConvt_Click: 세트마다 fitting → saveTemp30."""
    _confirm(body)
    probe_id, ss = int_param(body, "probeId"), int_param(body, "tempSSId")
    msgs: list[str] = []
    done = []
    with _cursor(write=True) as cur:
        for ts in _set_ids(body):
            found, _ = _t10_fit(cur, probe_id, ss, ts)
            if not found:
                msgs.append("No data is found for this tempSetId and TempSSId")
                break
            msg = _save30(cur, probe_id, ss, ts)
            if msg:
                msgs.append(msg)
            done.append(ts)
    logger.info(f"temp10 multi convert by {g.current_user}: probeId={probe_id}, ss={ss}, sets={done}")
    return {"messages": msgs, "converted": done}


# ─── frmWobbler ─────────────────────────────────────────────────────────────

WOBB_GRID_SQL = "SELECT * FROM trtp_wobbler ORDER BY effectiveArea, wobbAngleDeg "


@_route("/wob/records")
def wob_records(body):
    _confirm(body)
    probe_id = int_param(body, "probeId")
    with _cursor(write=True, timeout=PROC_TIMEOUT_S) as cur:
        cur.execute("EXEC pre_RTP_wobbler ?", [probe_id])
        _drain(cur)
        cur.execute("SELECT DISTINCT effectiveArea, wobbAngleDeg FROM trtp_wobbler ORDER BY effectiveArea, wobbAngleDeg")
        items = [ta.wobbler_item(a, b) for a, b in cur.fetchall()]
        return {"items": items, "grid": grid(cur, WOBB_GRID_SQL)}


@_route("/wob/run")
def wob_run(body):
    """cmdWobbRun_Click → fmincon 대체 fit_wobbler → dbo.temp_wobbler_coeff INSERT."""
    _confirm(body)
    probe_id = int_param(body, "probeId")
    msgs: list[str] = []
    with _cursor(write=True) as cur:
        exist = _first(cur, "SELECT  * FROM temp_wobbler_coeff WHERE probeId= ?", [probe_id])
        if exist and exist.get("tempWobbCoeffId") is not None:
            return {"messages": ["There is a record set of temp wobbler coeff in database."], "finish": True}
        rows = fetch_dicts(cur, "SELECT effectiveArea, volumeRateHz, wobbAngleDeg, normTR FROM trtp_wobbler ")
        if not rows:
            return {"messages": ["There is no any record for wobbling data."], "finish": False}
        if len(rows) - 1 <= 0:
            return {"messages": ["No data is found for wobbling"], "finish": False}
        res = ta.fit_wobbler([r["effectiveArea"] for r in rows], [r["volumeRateHz"] for r in rows],
                             [r["wobbAngleDeg"] for r in rows], [r["normTR"] for r in rows])
        x = res.coefficients
        msgs.append(", ".join(f"x({i}) = {v}" for i, v in enumerate(x)))
        cur.execute("INSERT INTO dbo.temp_wobbler_coeff VALUES (?, ?, ?, ?, ?, ?, ?)", [probe_id, *x])
    logger.info(f"temp_wobbler_coeff insert by {g.current_user}: probeId={probe_id}")
    return {"messages": msgs, "finish": True, "coefficients": x}


def _wob_key(p: list[str]) -> tuple[float, float]:
    return _num(p[1], "effectiveArea"), _num(p[2], "wobbAngleDeg")


@_route("/wob/plot")
def wob_plot(body):
    probe_id = int_param(body, "probeId")
    raw = body.get("items", [])
    if not isinstance(raw, list) or len(raw) > MAX_ITEMS:
        raise RouteInputError("items 값이 올바르지 않습니다.")
    items = [_text(it, "items", 100).split(ta.TAB) for it in raw]
    coeffs = body.get("coefficients")
    msgs: list[str] = []
    with _cursor() as cur:
        x = None
        if isinstance(coeffs, list) and len(coeffs) == 6 and coeffs[0]:
            x = [_float({"v": c}, "v") for c in coeffs]
        else:
            rows = fetch_dicts(cur, "SELECT wobbcoeff0, wobbcoeff1, wobbcoeff2, wobbcoeff3, wobbcoeff4, wobbcoeff5 "
                                    "FROM dbo.temp_wobbler_coeff WHERE probeId = ?", [probe_id])
            if len(rows) == 1:
                x = [float(rows[0][f"wobbcoeff{i}"]) for i in range(6)]
            else:
                msgs.append("No wobbling coefficients available, plot measured data only")
        rng = None
        for p in items:
            area, ang = _wob_key(p)
            r = _first(cur, "Select XMin = MIN(volumeRateHz), XMax = MAX(volumeRateHz), YMin = MIN(normTR), "
                            "YMax = MAX(normTR) FROM trtp_wobbler  WHERE abs(effectiveArea - ?)< 0.001 "
                            "  And abs(wobbAngleDeg - ?)<0.01", [area, ang])
            if r and r["XMin"] is not None:
                v = [float(r[k]) for k in ("XMin", "XMax", "YMin", "YMax")]
                rng = v if rng is None else [min(rng[0], v[0]), max(rng[1], v[1]), min(rng[2], v[2]),
                                             max(rng[3], v[3])]
        if rng is None:
            return {"messages": msgs, "exit": True, "coefficients": x}
        lines = []
        for idx, p in enumerate(items):
            area, ang = _wob_key(p)
            cur.execute("Select volumeRateHz, normTR FROM trtp_wobbler  WHERE abs(effectiveArea - ?)< 0.001 "
                        "  And abs(wobbAngleDeg - ?)<0.01 ORDER BY volumeRateHz ASC", [area, ang])
            lines.append({"points": [[float(a), float(b)] for a, b in cur.fetchall()], "item": idx})
            if x is not None:
                lines.append({"points": ta.wobbler_curve(x, rng[0], rng[1], ang, area), "item": idx})
    return {"title": "Wobbler", "xLabel": "Volume", "yLabel": "NormTR", "lines": lines, "xMin": rng[0],
            "xMax": rng[1], "yMin": rng[2] * 0.9, "yMax": rng[3] * 1.1, "showLine": True, "messages": msgs,
            "coefficients": x}


@_route("/wob/edit-data")
def wob_edit_data(body):
    area, ang = _float(body, "effectiveArea"), _float(body, "wobbAngleDeg")
    with _cursor() as cur:
        r = _first(cur, "SELECT XMin = MIN(volumeRateHz), XMax = MAX(volumeRateHz), YMin = MIN(normTR), "
                        "YMax = MAX(normTR) FROM trtp_wobbler  WHERE abs(effectiveArea - ?)< 0.00001 "
                        "  AND abs(wobbAngleDeg - ?)<0.001", [area, ang])
        cur.execute("SELECT tempWobbId, volumeRateHz, normTR FROM trtp_wobbler  WHERE abs(effectiveArea - ?)< 0.00001 "
                    "  AND abs(wobbAngleDeg - ?)<0.001 ORDER BY volumeRateHz ASC", [area, ang])
        pts = [[json_value(a), float(b), float(c)] for a, b, c in cur.fetchall()]
    out = {"graphName": "Wobbler", "points": pts}
    if r and r["XMin"] is not None:
        out.update(xMin=float(r["XMin"]), xMax=float(r["XMax"]), yMin=float(r["YMin"]), yMax=float(r["YMax"]))
    return out


@_route("/wob/save-edit")
def wob_save_edit(body):
    _confirm(body)
    key = int_param(body, "tempWobbId")
    x, y = _float(body, "x"), _float(body, "y")
    with _cursor(write=True) as cur:
        cur.execute("UPDATE trtp_wobbler SET volumeRateHz = ?, normTR = ? WHERE tempWobbId = ?", [x, y, key])
        data = {"grid": grid(cur, WOBB_GRID_SQL)}
    logger.info(f"trtp_wobbler edit by {g.current_user}: tempWobbId={key}")
    return data
