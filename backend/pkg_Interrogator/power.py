"""Interrogator "Power Data Analysis"(레거시 intPower, frmPower.vb) 계산·DB 접근.

원본 SQL 문자열 연결은 모두 ``?`` 파라미터로 바꿨다. 데이터셋 키(measFmMhz 등)는 원본이 목록 문자열을
그대로 SQL 숫자 리터럴로 넣었으므로 ``Decimal`` 로 넘겨 SQL Server 의 numeric 비교 의미를 유지한다.
사용자 스키마 테이블 ``trtp_power`` 는 원본 ``gDBUser.trtp_power`` 와 같이 로그인 사용자 기본 스키마로 해석된다.
"""

from __future__ import annotations

import decimal
import math
import re

import numpy as np

from pkg_MsiInput.store import grid, json_value

VB_SPACE = "     "
ORDER_COLUMNS = ("PmPulseType", "measFmMHz", "sysFmMHz", "elAper")
MAX_POINTS = 5000
SW_VERSION_MAX = 3
PROC_TIMEOUT = 2000

_NUM_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")


class PowerInputError(ValueError):
    """사용자 입력·데이터 상태 오류(400)."""


# ---------------------------------------------------------------- VB 형식 재현

def vb_str(value) -> str:
    """VB ``CStr``/문자열 연결 결과를 재현한다(Null → "", Double → G15, Single → G7)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, decimal.Decimal):
        return format(value, "f")
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        f32 = np.float32(value)
        if float(f32) == value:
            text = format(float(f32), ".7g")
            if float(np.float32(float(text))) != value:
                text = format(value, ".15g")
        else:
            text = format(value, ".15g")
        return text.replace("e", "E")
    if hasattr(value, "strftime"):
        if hasattr(value, "hour"):
            hour = value.hour % 12 or 12
            ampm = "PM" if value.hour >= 12 else "AM"
            date_part = f"{value.month}/{value.day}/{value.year}"
            if value.hour == 0 and value.minute == 0 and value.second == 0:
                return date_part
            return f"{date_part} {hour}:{value.minute:02d}:{value.second:02d} {ampm}"
        return f"{value.month}/{value.day}/{value.year}"
    return str(value)


def sng(value: float) -> float:
    """VB ``Single`` 변수에 담았다가 문자열로 SQL 에 넣은 값(유효숫자 7자리)."""
    return float(format(float(np.float32(value)), ".7g"))


def num_param(text) -> decimal.Decimal:
    s = str(text).strip()
    if not _NUM_RE.match(s):
        raise PowerInputError(f"숫자 형식이 아닙니다: {text!r}")
    return decimal.Decimal(s)


# ---------------------------------------------------------------- 목록 문자열

def list_item(row: dict) -> dict:
    """lstFreq 항목 하나(원본: vbSpace & PMPulseType & vbSpace & ... & mark)."""
    vals = [vb_str(row.get(k)).strip() for k in ("PMpulseType", "measFmMhz", "sysFmMhz", "elAper", "Mark")]
    return {
        "pulseType": vals[0], "measFm": vals[1], "sysFm": vals[2], "elAper": vals[3], "mark": vals[4],
        "text": VB_SPACE + VB_SPACE.join(vals),
    }


def dataset_text(item: dict) -> str:
    """mnuEditDataSet 메뉴 텍스트(= 원본 mEditDataset)."""
    return (f"PMpulseType:  {item['pulseType']},   measFmMhz:  {item['measFm']},   "
            f"sysFmMhz:  {item['sysFm']},   elAper:  {item['elAper']}")


def dataset_key(body: dict) -> tuple:
    if not isinstance(body, dict):
        raise PowerInputError("데이터셋 정보가 없습니다.")
    pulse = str(body.get("pulseType", "")).strip()
    if not pulse or len(pulse) > 100:
        raise PowerInputError("PMpulseType 값이 올바르지 않습니다.")
    return pulse, num_param(body.get("measFm")), num_param(body.get("sysFm")), num_param(body.get("elAper"))


def order_clause(orders) -> str:
    """cmdUpdate 의 1st~4th order 콤보 → ORDER BY (컬럼명은 allowlist 에서만)."""
    cols = []
    for o in orders or []:
        o = (o or "").strip()
        if not o:
            continue
        match = next((c for c in ORDER_COLUMNS if c.lower() == o.lower()), None)
        if match is None:
            raise PowerInputError(f"허용되지 않은 정렬 컬럼: {o}")
        cols.append(match)
    return (" ORDER BY " + ", ".join(cols)) if cols else ""


def sw_version_param(versions) -> str:
    """lstMeasSwVersion 다중 선택 → 세미콜론 연결(최대 3개)."""
    picked = [str(v).strip() for v in (versions or []) if str(v).strip()]
    if len(picked) > SW_VERSION_MAX:
        raise PowerInputError("Please limit your selection of 'measImgSwVersion' values to a maximum of three (3).")
    joined = ";".join(picked)
    if len(joined) > 100:
        raise PowerInputError("imagSwVersion 값이 너무 깁니다.")
    return joined


# ---------------------------------------------------------------- dip 보정(fdaPower.CheckPowerData "INT")

def _div(a: float, b: float) -> float:
    try:
        return a / b
    except ZeroDivisionError:
        if a == 0 or math.isnan(a):
            return float("nan")
        return math.copysign(float("inf"), a)


def check_power_data(rows: list) -> tuple[int, list]:
    """원본 CheckPowerData 이식. rows = [(powerId, voltage, power), ...] (전압 오름차순).

    반환: (dipFound, out) — out[j] = [powerId 또는 0(보정 없음), voltage, 보정 power], j=1..n (out[0] 은 0 행).
    원본 계산식(``(x_j^2 - x_{j-1})^2`` 포함)은 그대로 보존했다. 원본은 j+2 가 범위를 넘으면 예외로 종료되므로
    그 경우만 '보정 불가'(dipFound = 1000) 분기로 처리한다.
    """
    n = len(rows)
    if n < 2:
        raise PowerInputError("데이터 점이 2개 미만이라 dip 검사를 할 수 없습니다.")
    out = [[0.0, 0.0, 0.0]] + [[float(r[0]), float(r[1]), float(r[2])] for r in rows]
    dip = 0

    def p(j):
        return out[j][2]

    def x(j):
        return out[j][1]

    for j in range(2, n):
        if p(j) < p(j - 1):
            if p(j - 1) < p(j + 1):
                dip += 1
                out[j][2] = _div((x(j) ** 2 - x(j - 1)) ** 2, x(j + 1) ** 2 - x(j - 1) ** 2) * (p(j + 1) - p(j - 1)) + p(j - 1)
            elif j + 2 <= n and p(j - 1) < p(j + 2):
                dip += 1
                out[j][2] = _div((x(j) ** 2 - x(j - 1)) ** 2, x(j + 2) ** 2 - x(j - 1) ** 2) * (p(j + 2) - p(j - 1)) + p(j - 1)
            else:
                dip = 1000
        else:
            out[j][0] = 0
    if p(n) < p(n - 1):
        dip += 1
        out[n][2] = _div(x(n) ** 2 - x(n - 2) ** 2, x(n - 1) ** 2 - x(n - 2) ** 2) * (p(n - 1) - p(n - 2)) + p(n - 2)
    else:
        out[n][0] = 0
    return dip, out


def auto_save_plan(out: list, originals: dict) -> list[dict]:
    """SaveAutoCheck: out[l][0] > 0 인 행마다 trtp_power 값과 ws_power 배율(Single 연산)을 만든다."""
    plan = []
    for l in range(1, len(out)):
        pid = out[l][0]
        if pid > 0:
            pid = int(pid)
            orig = originals.get(pid)
            if orig is None:
                raise PowerInputError(f"PowerId {pid} 행을 찾을 수 없습니다.")
            new_val = sng(out[l][2])
            ratio = sng(_div(out[l][2], float(np.float32(orig))))
            plan.append({"powerId": pid, "powerData": new_val, "ratio": ratio})
    return plan


# ---------------------------------------------------------------- DB

_WHERE_EQ = "WHERE PMpulseType = ? AND measFmMhz = ? AND sysFmMhz = ? AND elAper = ?"


def sw_versions(cur, probe_id: int) -> list[str]:
    cur.execute(
        "SELECT DISTINCT(imagSwVersion) AS imagSwVersion FROM dbo.power_station_setup "
        "WHERE probeid = ? ORDER BY imagSwVersion ASC",
        [str(probe_id)],
    )
    return [vb_str(r[0]) for r in cur.fetchall()]


def list_items(cur, orders=None, default_order=True) -> list[dict]:
    order = " ORDER BY PMpulseType, measFmMhz, elAper" if default_order else order_clause(orders)
    cur.execute("SELECT DISTINCT PMpulseType, measFmMhz, sysFmMhz, elAper, Mark FROM trtp_power" + order)
    cols = [c[0] for c in cur.description]
    out = []
    for row in cur.fetchmany(MAX_POINTS + 1)[:MAX_POINTS]:
        rec = {}
        for c, v in zip(cols, row):
            rec[{"pmpulsetype": "PMpulseType", "measfmmhz": "measFmMhz", "sysfmmhz": "sysFmMhz",
                 "elaper": "elAper", "mark": "Mark"}[c.lower()]] = v
        out.append(list_item(rec))
    return out


def get_records(cur, probe_id: int, sw_version: str) -> dict:
    """cmdGetRecords: pre_RTP_power(또는 pre_RTP_Power1) 실행 → 목록·그리드."""
    if sw_version and sw_version != " ":
        cur.execute("EXEC pre_RTP_Power1 ?, ?", [probe_id, sw_version])
    else:
        cur.execute("EXEC pre_RTP_power ?", [probe_id])
    while cur.nextset():
        pass
    items = list_items(cur)
    data = grid(cur, "SELECT * FROM trtp_power ORDER BY PMpulseType, measFmMhz, elAper", limit=MAX_POINTS)
    return {"items": items, "grid": data}


def dataset_range(cur, key: tuple) -> dict | None:
    cur.execute(
        "SELECT XMin = MIN(pulseVoltageVolt), XMax = MAX(pulseVoltageVolt), "
        "YMin = MIN(PowerData), YMax = MAX(PowerData) FROM trtp_power " + _WHERE_EQ,
        list(key),
    )
    row = cur.fetchone()
    if row is None or row[0] is None:
        return None
    return {"xMin": float(row[0]), "xMax": float(row[1]), "yMin": float(row[2]), "yMax": float(row[3])}


def dataset_points(cur, key: tuple) -> list[list]:
    cur.execute(
        "SELECT PowerId, pulseVoltageVolt, PowerData FROM trtp_power " + _WHERE_EQ + " ORDER BY pulseVoltageVolt ASC",
        list(key),
    )
    rows = cur.fetchmany(MAX_POINTS + 1)
    if len(rows) > MAX_POINTS:
        raise PowerInputError("데이터 점이 너무 많습니다.")
    return [[int(r[0]), json_value(r[1]), json_value(r[2])] for r in rows]


def plot_datasets(cur, keys: list[tuple]) -> list[dict]:
    """DrawGraph / EditGraph: 데이터셋별 min/max 와 (PowerId, x, y) 점."""
    return [{"range": dataset_range(cur, k), "points": dataset_points(cur, k)} for k in keys]


def auto_check(cur, key: tuple) -> dict:
    """DrawAutoPowerCheck: CheckPowerData + 그래프용 데이터."""
    cur.execute(
        "SELECT powerId, TxGain = pulseVoltageVolt, PowerData FROM trtp_power " + _WHERE_EQ
        + " ORDER BY pulseVoltageVolt ASC",
        list(key),
    )
    rows = cur.fetchall()
    dip, out = check_power_data([(r[0], r[1], r[2]) for r in rows])
    rng = dataset_range(cur, key)
    points = []
    if rng is not None:
        pulse, meas, sys_fm, el = key
        cur.execute(
            "SELECT powerId, pulseTxGain = pulseVoltageVolt, PowerData FROM trtp_power "
            "WHERE PMpulseType = ? AND measFmMHz = ? AND ABS(sysFmMHz - ?) < 0.01 AND elAper = ? "
            "ORDER BY pulseVoltageVolt ASC",
            [pulse, meas, sys_fm, el],
        )
        points = [[int(r[0]), json_value(r[1]), json_value(r[2])] for r in cur.fetchall()]
    fixed = [json_value(out[j][2]) if j < len(out) else 0.0 for j in range(1, len(points) + 1)]
    return {"dip": dip, "range": rng, "points": points, "fixed": fixed}


def auto_save(cur, key: tuple) -> dict:
    """SaveAutoCheck: 같은 트랜잭션에서 다시 계산해 trtp_power·ws_power 갱신."""
    cur.execute(
        "SELECT powerId, TxGain = pulseVoltageVolt, PowerData FROM trtp_power " + _WHERE_EQ
        + " ORDER BY pulseVoltageVolt ASC",
        list(key),
    )
    rows = cur.fetchall()
    dip, out = check_power_data([(r[0], r[1], r[2]) for r in rows])
    originals = {int(r[0]): float(r[2]) for r in rows if r[2] is not None}
    plan = auto_save_plan(out, originals)
    for item in plan:
        cur.execute("UPDATE trtp_power SET PowerData = ? WHERE PowerId = ?", [item["powerData"], item["powerId"]])
        cur.execute("UPDATE ws_power SET PowerData = PowerData * ? WHERE PowerId = ?", [item["ratio"], item["powerId"]])
    return {"dip": dip, "updated": len(plan)}


def save_point(cur, power_id: int, x: float, y: float) -> None:
    """SaveEdit: UPDATE trtp_power SET pulseVoltageVolt, PowerData (Single 값)."""
    cur.execute(
        "UPDATE trtp_power SET pulseVoltageVolt = ?, PowerData = ? WHERE PowerId = ?",
        [sng(x), sng(y), power_id],
    )
    if cur.rowcount not in (-1, 1):
        raise PowerInputError("갱신 대상이 1행이 아닙니다.")


def set_mark(cur, key: tuple, mark: str) -> None:
    if mark not in ("checked", "unchecked"):
        raise PowerInputError("mark 값이 올바르지 않습니다.")
    cur.execute("UPDATE trtp_power SET mark = ? " + _WHERE_EQ, [mark, *key])


def mark_all(cur) -> None:
    cur.execute("UPDATE trtp_power SET mark = 'checked'")
