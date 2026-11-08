"""Interrogator(레거시 intRtpDisplay1 / frmMain RTP / frmTemp10) DB 접근.

모든 SQL 은 상수 문자열 + ``?`` 바인딩이다. 쓰기는 ``RTP_main`` 계열 실행과
``temp10_fit_coeff`` 신규 저장 두 가지뿐이다.
"""

from __future__ import annotations

import math

from pkg_MsiInput.store import MAX_LIST_ROWS, open_raw_connection, records

from .temperature_fit import _PENALTY, fit_temp10

RTP_PROCEDURES = {"standard": "dbo.RTP_main", "modified": "dbo.RTP_main_modified"}
RTP_TIMEOUT_S = 3000
MAX_NAME_LEN = 128


class InterrogatorInputError(ValueError):
    pass


def _escape_like(value: str) -> str:
    return value.replace("[", "[[]").replace("%", "[%]").replace("_", "[_]")


def _read(sql_obj, fn):
    conn = open_raw_connection(sql_obj)
    try:
        return fn(conn.cursor())
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def list_probes(sql_obj) -> list[dict]:
    return _read(sql_obj, lambda cur: records(
        cur, f"SELECT TOP ({MAX_LIST_ROWS}) probeId, probeName FROM dbo.probe_info ORDER BY probeName"))


def list_rtp_names(sql_obj, probe_id: int) -> list[str]:
    rows = _read(sql_obj, lambda cur: records(
        cur,
        f"SELECT DISTINCT TOP ({MAX_LIST_ROWS}) RTPName FROM dbo.RTP_LUT WHERE probeId = ? ORDER BY RTPName",
        [probe_id],
    ))
    return [r["RTPName"] for r in rows if r.get("RTPName") is not None]


def _check_name(rtp_name: str) -> str:
    if not isinstance(rtp_name, str) or not rtp_name.strip() or len(rtp_name) > MAX_NAME_LEN:
        raise InterrogatorInputError("RTP 이름이 올바르지 않습니다.")
    return rtp_name


def rtp_display(sql_obj, probe_id: int, rtp_name: str) -> dict:
    name = _check_name(rtp_name)
    like = f"%{_escape_like(name)}%"

    def run(cur):
        rtp = records(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) * FROM dbo.RTP_LUT WHERE ProbeId = ? AND RTPName = ? ORDER BY pmRTPId",
            [probe_id, name],
        )
        temp_prb = records(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) * FROM dbo.tempPrb_LUT WHERE ProbeId = ? AND LUTname LIKE ? ORDER BY tempPrbLUTId",
            [probe_id, like],
        )
        temp_pulse = records(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) * FROM dbo.tempPulse_LUT WHERE ProbeId = ? AND LUTname LIKE ? ORDER BY tempPulseId",
            [probe_id, like],
        )
        temp_volt = records(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) v.* FROM dbo.tempPrbVolt_LUT v "
            "JOIN dbo.tempPrb_LUT p ON v.tempPrbLUTId = p.tempPrbLUTId "
            "WHERE p.ProbeId = ? AND p.LUTname LIKE ? ORDER BY v.tempPrbVoltID",
            [probe_id, like],
        )
        problems = records(
            cur,
            "SELECT COUNT(*) AS n FROM dbo.RTP_LUT WHERE probeId = ? AND RTPName = ? AND problemReport > 0",
            [probe_id, name],
        )
        return rtp, temp_prb, temp_pulse, temp_volt, int(problems[0]["n"] or 0) if problems else 0

    rtp, temp_prb, temp_pulse, temp_volt, problems = _read(sql_obj, run)
    warnings = []
    if problems:
        warnings.append(f"problemReport 가 표시된 RTP 행이 {problems}개 있습니다.")
    return {
        "rtpLut": rtp,
        "tempPrbLut": temp_prb,
        "tempPulseLut": temp_pulse,
        "tempPrbVoltLut": temp_volt,
        "warnings": warnings,
        "truncated": any(len(t) >= MAX_LIST_ROWS for t in (rtp, temp_prb, temp_pulse, temp_volt)),
    }


def generate_rtp(sql_obj, probe_id: int, variant: str) -> None:
    proc = RTP_PROCEDURES.get(variant)
    if proc is None:
        raise InterrogatorInputError("지원하지 않는 RTP 생성 방식입니다.")
    conn = open_raw_connection(sql_obj)
    # 풀 프록시가 아닌 실제 pyodbc 연결에 설정해야 드라이버 쿼리 timeout 이 적용된다.
    driver = getattr(conn, "driver_connection", None) or getattr(conn, "dbapi_connection", None) or conn
    previous_timeout = getattr(driver, "timeout", 0)
    committed = False
    try:
        driver.timeout = RTP_TIMEOUT_S
        cur = conn.cursor()
        cur.execute(f"EXEC {proc} ?", [int(probe_id)])
        while cur.nextset():
            pass
        conn.commit()
        committed = True
    finally:
        if not committed:
            try:
                conn.rollback()
            except Exception:
                pass
        try:
            driver.timeout = previous_timeout
        except Exception:
            pass
        conn.close()


def temp10_stations(sql_obj, probe_id: int) -> list[dict]:
    return _read(sql_obj, lambda cur: records(
        cur,
        f"SELECT TOP ({MAX_LIST_ROWS}) * FROM dbo.temp_station_setup WHERE probeId = ? ORDER BY tempSSId",
        [probe_id],
    ))


def temp10_sets(sql_obj, probe_id: int, temp_ss_id: int) -> list[int]:
    rows = _read(sql_obj, lambda cur: records(
        cur,
        f"SELECT DISTINCT TOP ({MAX_LIST_ROWS}) tempSetId FROM dbo.temperature10mins "
        "WHERE probeId = ? AND tempSSId = ? ORDER BY tempSetId",
        [probe_id, temp_ss_id],
    ))
    return [int(r["tempSetId"]) for r in rows if r.get("tempSetId") is not None]


def _temp10_points(cur, probe_id: int, temp_ss_id: int, temp_set_id: int) -> dict:
    base = records(
        cur,
        "SELECT TOP (1) temperatureC FROM dbo.temperature10mins "
        "WHERE probeId = ? AND tempSSId = ? AND tempSetId = ? AND timeElapsedS = 0",
        [probe_id, temp_ss_id, temp_set_id],
    )
    if not base or base[0].get("temperatureC") is None:
        raise InterrogatorInputError("timeElapsedS = 0 인 기준 온도 데이터가 없습니다.")
    temp0 = float(base[0]["temperatureC"])
    rows = records(
        cur,
        "SELECT TOP (10001) timeElapsedS, temperatureC FROM dbo.temperature10mins "
        "WHERE probeId = ? AND tempSSId = ? AND tempSetId = ? ORDER BY timeElapsedS",
        [probe_id, temp_ss_id, temp_set_id],
    )
    t, y = [], []
    for r in rows:
        if r.get("timeElapsedS") is None or r.get("temperatureC") is None:
            continue
        t.append(float(r["timeElapsedS"]))
        y.append(float(r["temperatureC"]) - temp0)
    if len(t) < 6:
        raise InterrogatorInputError("fitting 에 필요한 데이터 점이 부족합니다(최소 6개).")
    return {"temp0": temp0, "timeElapsedS": t, "tempRiseC": y}


def _existing_coeff(cur, probe_id, temp_ss_id, temp_set_id) -> dict | None:
    rows = records(
        cur,
        "SELECT TOP (1) * FROM dbo.temp10_fit_coeff WHERE probeId = ? AND tempSSId = ? AND tempSetId = ?",
        [probe_id, temp_ss_id, temp_set_id],
    )
    return rows[0] if rows else None


def temp10_fit(sql_obj, probe_id: int, temp_ss_id: int, temp_set_id: int) -> dict:
    def run(cur):
        return _temp10_points(cur, probe_id, temp_ss_id, temp_set_id), _existing_coeff(cur, probe_id, temp_ss_id, temp_set_id)

    points, existing = _read(sql_obj, run)
    fit = fit_temp10(points["timeElapsedS"], points["tempRiseC"])
    return {**points, "fit": fit.to_dict(), "existing": existing}


def temp10_save(sql_obj, probe_id: int, temp_ss_id: int, temp_set_id: int) -> dict:
    """서버에서 다시 fitting 한 결과를 기존 행이 없을 때만 저장한다(레거시와 동일)."""
    conn = open_raw_connection(sql_obj)
    committed = False
    try:
        cur = conn.cursor()
        points = _temp10_points(cur, probe_id, temp_ss_id, temp_set_id)
        fit = fit_temp10(points["timeElapsedS"], points["tempRiseC"])
        if not all(map(math.isfinite, fit.coefficients)) or fit.error >= _PENALTY:
            raise InterrogatorInputError("유효한 fitting 해를 찾지 못해 저장하지 않았습니다.")
        tau1, tau2, c1, c2, c3, c4 = fit.coefficients
        cur.execute(
            "SET NOCOUNT ON; "
            "INSERT INTO dbo.temp10_fit_coeff (probeId, tempSetId, tempSSId, tau1, tau2, c1, c2, c3, c4, error) "
            "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? "
            "WHERE NOT EXISTS (SELECT 1 FROM dbo.temp10_fit_coeff WITH (UPDLOCK, HOLDLOCK) "
            "WHERE probeId = ? AND tempSSId = ? AND tempSetId = ?); "
            "SELECT @@ROWCOUNT;",
            [probe_id, temp_set_id, temp_ss_id, tau1, tau2, c1, c2, c3, c4, fit.error,
             probe_id, temp_ss_id, temp_set_id],
        )
        inserted = 0
        while True:
            if cur.description is not None:
                row = cur.fetchone()
                if row is not None:
                    inserted = int(row[0] or 0)
                    break
            if not cur.nextset():
                break
        conn.commit()
        committed = True
        return {"saved": inserted > 0, "fit": fit.to_dict()}
    finally:
        if not committed:
            try:
                conn.rollback()
            except Exception:
                pass
        conn.close()
