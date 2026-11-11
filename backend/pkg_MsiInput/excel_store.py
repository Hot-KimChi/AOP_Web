"""measSetInput(msiReader) DB 저장소 — 엔진(excel_engine)이 쓰는 저장소 구현.

- 모든 SQL 은 ``?`` 파라미터. 열 이름은 허용 목록으로만 조립한다.
- 쓰기 버튼(Save Tank/Power/Temp, Update Prf)은 단일 트랜잭션 + ``sp_getapplock`` 으로 직렬화하고,
  엔진이 중단 메시지(MsiExcelError)를 올리면 전체 롤백한다.
"""

from __future__ import annotations

from typing import Callable

from .excel_engine import MEAS_INSERT_COLUMNS, MEAS_UPDATE_COLUMNS, TEMP_INSERT_COLUMNS
from .excel_vb import MsiExcelError
from .store import APPLOCK_RESOURCE, APPLOCK_TIMEOUT_MS, commit_all, grid, open_raw_connection, records

TEMP_APPLOCK_RESOURCE = "AOP_Web_MsiExcel_temp_setting"
PRF_TIMEOUT_S = 2000
NEW_ROWS_LIMIT = 5000

_MEAS_CRITERIA = frozenset({
    "comments", "probeId", "PMpulseType", "PMPulseType", "azApodType", "elAperType", "isPhaseInverse",
    "splitFocusEnable", "FmMHz", "FmMhz", "FocusPMm", "elevIndex", "speedOfSoundMPerS", "measSetId",
    "ABS_AZAPER",
})
_TEMP_CRITERIA = frozenset({
    "probeId", "PMPulseType", "FmMhz", "azAperSizeMm", "measVoltage", "azApodType", "measSetNum", "elevIndex",
})
_OPS = frozenset({"=", ">=", "<=", ">", "<", "<>"})


def _where(criteria: list, allowed: frozenset) -> tuple[str, list]:
    parts, params = [], []
    for col, op, value in criteria:
        if col not in allowed or op not in _OPS:
            raise MsiExcelError(f"허용되지 않은 조회 조건: {col} {op}")
        if col == "ABS_AZAPER":
            parts.append(f"ABS(azAperSizeMm - ?) {op} ?")
            params.extend(value)
        else:
            parts.append(f"{col} {op} ?")
            params.append(value)
    return " AND ".join(parts), params


class ExcelRepo:
    def __init__(self, cursor) -> None:
        self.cur = cursor

    def _scalar(self, sql: str, params: list | tuple = ()):
        self.cur.execute(sql, list(params))
        row = self.cur.fetchone()
        return None if row is None else row[0]

    # --- 공통
    def max_meas_set_id(self) -> int | None:
        v = self._scalar("SELECT MAX(measSetId) FROM dbo.meas_setting")
        return None if v is None else int(v)

    def max_temp_set_id(self) -> int | None:
        v = self._scalar("SELECT MAX(tempSetId) FROM dbo.temp_setting")
        return None if v is None else int(v)

    def probe_info(self, probe_id) -> dict | None:
        rows = records(
            self.cur,
            "SELECT TOP (1) azPitchCm, elPitchCm, elPitch1Cm, MechFocusCm, MechFocus1Cm, azNumElements, "
            "elNumElements, probeDescription FROM dbo.probe_info WHERE probeId = ?",
            [probe_id],
        )
        return rows[0] if rows else None

    # --- meas_setting
    def find_meas(self, criteria: list) -> list[dict]:
        where, params = _where(criteria, _MEAS_CRITERIA)
        return records(
            self.cur,
            f"SELECT TOP (100) measSetId, pulseWidthUsec, ePulseString FROM dbo.meas_setting WHERE {where} "
            "ORDER BY measSetId",
            params,
        )

    def count_meas(self, criteria: list) -> int:
        where, params = _where(criteria, _MEAS_CRITERIA)
        return int(self._scalar(f"SELECT COUNT(*) FROM dbo.meas_setting WHERE {where}", params) or 0)

    def update_meas(self, meas_set_id, values: dict) -> None:
        cols = [c for c in MEAS_UPDATE_COLUMNS if c in values]
        if not cols or set(values) - set(MEAS_UPDATE_COLUMNS):
            raise MsiExcelError(f"허용되지 않은 갱신 컬럼: {sorted(values)}")
        sets = ", ".join(f"{c} = ?" for c in cols)
        self.cur.execute(f"UPDATE dbo.meas_setting SET {sets} WHERE measSetId = ?",
                         [values[c] for c in cols] + [int(meas_set_id)])

    def insert_meas(self, values: dict) -> int | None:
        cols = [c for c in MEAS_INSERT_COLUMNS if c in values]
        if set(values) - set(MEAS_INSERT_COLUMNS):
            raise MsiExcelError(f"허용되지 않은 컬럼: {sorted(set(values) - set(MEAS_INSERT_COLUMNS))}")
        self.cur.execute(
            "SET NOCOUNT ON; "
            f"INSERT INTO dbo.meas_setting ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)}); "
            "SELECT CAST(SCOPE_IDENTITY() AS INT) AS newId;",
            [values[c] for c in cols],
        )
        while True:
            if self.cur.description is not None:
                row = self.cur.fetchone()
                if row is not None and row[0] is not None:
                    return int(row[0])
            if not self.cur.nextset():
                return None

    def new_set_range(self, max_id: int, probe_id) -> tuple:
        self.cur.execute(
            "SELECT MIN(measSetId), MAX(measSetId) FROM dbo.meas_setting WHERE measSetId > ? AND probeId = ?",
            [int(max_id), probe_id],
        )
        row = self.cur.fetchone()
        return (None, None) if row is None else (row[0], row[1])

    def new_meas_grid(self, probe_id, max_id: int) -> dict:
        return grid(self.cur, "SELECT * FROM dbo.meas_setting WHERE probeId = ? AND measSetId > ? ORDER BY measSetId",
                    [probe_id, int(max_id)], limit=NEW_ROWS_LIMIT)

    def update_probe_apex(self, apex, probe_id) -> None:
        self.cur.execute("UPDATE dbo.probe_info SET ApexCm = ? WHERE ProbeId = ? AND ApexCm IS NULL", [apex, probe_id])

    # --- temp_setting
    def count_temp(self, criteria: list) -> int:
        where, params = _where(criteria, _TEMP_CRITERIA)
        return int(self._scalar(f"SELECT COUNT(*) FROM dbo.temp_setting WHERE {where}", params) or 0)

    def insert_temp(self, values: dict) -> None:
        cols = [c for c in TEMP_INSERT_COLUMNS if c in values]
        if set(values) - set(TEMP_INSERT_COLUMNS):
            raise MsiExcelError("허용되지 않은 temp_setting 컬럼입니다.")
        self.cur.execute(
            f"INSERT INTO dbo.temp_setting ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
            [values[c] for c in cols],
        )

    def new_temp_grid(self, probe_id, max_id: int) -> dict:
        return grid(self.cur, "SELECT * FROM dbo.temp_setting WHERE probeId = ? AND tempSetId > ? ORDER BY tempSetId",
                    [probe_id, int(max_id)], limit=NEW_ROWS_LIMIT)

    # --- 기타
    def power_set_id(self, meas_set_id: int):
        return self._scalar(
            "SELECT TOP (1) b.measSetId AS pwrSetId FROM dbo.meas_setting AS a INNER JOIN dbo.meas_setting AS b "
            "ON a.probeId = b.probeId AND a.PMpulseType = b.PMpulseType AND a.FmMHz = b.FmMHz "
            "AND a.elevIndex = b.elevIndex AND a.measSetId <> b.measSetId "
            "WHERE a.measSetId = ? AND b.comments = 'Power' AND a.comments <> 'Power' ORDER BY b.measSetId DESC",
            [int(meas_set_id)],
        )

    def has_init_temp(self, probe_id) -> bool:
        return self._scalar(
            "SELECT TOP (1) 1 FROM dbo.temperature WHERE measSetNum = 0 AND isDataUsable = 'Yes' AND probeId = ?",
            [probe_id],
        ) is not None

    def run_update_prf(self, probe_id: int, temp_limit: int) -> None:
        self.cur.execute("SET NOCOUNT ON; EXEC dbo.update_Prf_From_Init ?, ?", [probe_id, temp_limit])
        while self.cur.nextset():
            pass


def _set_timeout(conn, seconds: int) -> None:
    for target in (getattr(conn, "driver_connection", None), getattr(conn, "connection", None), conn):
        if target is not None and hasattr(target, "timeout"):
            try:
                target.timeout = seconds
                return
            except Exception:
                continue


def run_write(sql_obj, fn: Callable[[ExcelRepo], dict], resource: str = APPLOCK_RESOURCE,
              timeout_s: int | None = None) -> dict:
    conn = open_raw_connection(sql_obj)
    committed = False
    try:
        if timeout_s:
            _set_timeout(conn, timeout_s)
        cur = conn.cursor()
        cur.execute(
            "SET NOCOUNT ON; IF @@TRANCOUNT = 0 BEGIN TRANSACTION; DECLARE @rc INT; "
            "EXEC @rc = sp_getapplock @Resource = ?, @LockMode = 'Exclusive', "
            "@LockOwner = 'Transaction', @LockTimeout = ?; SELECT @rc;",
            [resource, APPLOCK_TIMEOUT_MS],
        )
        rc = cur.fetchone()
        if rc is None or rc[0] is None or int(rc[0]) < 0:
            raise MsiExcelError("다른 사용자가 저장 중입니다. 잠시 후 다시 시도하십시오.")
        result = fn(ExcelRepo(cur))
        commit_all(conn, cur)
        committed = True
        return result
    finally:
        if not committed:
            try:
                conn.rollback()
            except Exception:
                pass
        conn.close()


def run_read(sql_obj, fn: Callable[[ExcelRepo], dict]) -> dict:
    conn = open_raw_connection(sql_obj)
    try:
        return fn(ExcelRepo(conn.cursor()))
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()
