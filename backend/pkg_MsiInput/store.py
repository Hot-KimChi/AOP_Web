"""MSI input DB 저장소·서비스.

- ``DbStore``: pyodbc 커서 1개로 읽기·쓰기를 수행한다. 커밋·롤백은 호출자가 맡는다.
- ``DryRunStore``: 읽기는 위임하고 INSERT/UPDATE 는 메모리에만 반영한다(미리보기).
- ``preview`` / ``create``: 같은 계산 엔진을 두 저장소로 실행한다. ``create`` 는
  ``sp_getapplock`` 으로 직렬화된 단일 트랜잭션에서 계획을 다시 계산하고,
  미리보기 해시와 다르면 롤백한다.
"""

from __future__ import annotations

import datetime as _dt
import decimal
from typing import Any

from .calculator import (
    MAX_SELECTION,
    MEAS_TERMS,
    INSERT_EXCLUDED,
    MsiInputError,
    MsiPlan,
    parse_verif_filter,
    process_selection,
)

MAX_LIST_ROWS = 5000
MAX_CANDIDATES = 20000
APPLOCK_RESOURCE = "AOP_Web_MsiInput_meas_setting"
APPLOCK_TIMEOUT_MS = 15000
SQL_INT_MAX = 2_147_483_647

_INSERT_COLUMNS = tuple(t for t in MEAS_TERMS if t not in INSERT_EXCLUDED) + ("ePulseString", "pulseRateHz")

_CANDIDATE_COLUMNS = (
    "measSetId, probeId, comments, PMPulseType, FmMHz, azApodType, elAperType, elevIndex, "
    "isPhaseInverse, splitFocusEnable, ExcelFileName, FocusPMm, azAperSizeMm, profVoltageVolt, "
    "pulseWidthUsec, numTxCycles, edgeTreatment, cpaType, apexCm, ceilTxGain, MaxVoltageVolt, "
    "numMeasVoltage, totalVoltagePt, pulseRateHz"
)

SUBVERIF_COLUMNS = (
    "subVerifId, verifId, submodeName, PulseType, ApodType, AperType, FmMHz, FocusPCm, FocusQCm, "
    "AzimFnum, ElevFnum, ElevIndex, IsPhaseInverse, splitFocusEnable, PulseDurUs, TxGain, SoundSpeed"
)


class MsiConflictError(RuntimeError):
    """미리보기 이후 DB 상태가 바뀌어 생성 계획이 달라졌다."""

    def __init__(self, plan: MsiPlan):
        super().__init__("미리보기 이후 데이터가 변경되었습니다. 다시 미리보기 해 주세요.")
        self.plan = plan


def json_value(value: Any) -> Any:
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (_dt.datetime, _dt.date, _dt.time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return None
    if isinstance(value, float) and value != value:
        return None
    return value


def fetch_dicts(cursor, sql: str, params: list | tuple = (), lower: bool = False) -> list[dict]:
    cursor.execute(sql, list(params))
    if cursor.description is None:
        return []
    cols = [c[0].lower() if lower else c[0] for c in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def records(cursor, sql: str, params: list | tuple = ()) -> list[dict]:
    return [{k: json_value(v) for k, v in row.items()} for row in fetch_dicts(cursor, sql, params)]


def grid(cursor, sql: str, params: list | tuple = (), limit: int = MAX_LIST_ROWS) -> dict:
    """DataGridView 표시용 ``{columns, rows, truncated}``. Flask JSON 은 dict 키를 정렬하므로
    원본 SELECT 열 순서를 보존하려면 이 형식을 쓴다."""
    cursor.execute(sql, list(params))
    if cursor.description is None:
        return {"columns": [], "rows": [], "truncated": False}
    cols = [c[0] for c in cursor.description]
    fetched = cursor.fetchmany(limit + 1)
    rows = [[json_value(v) for v in row] for row in fetched[:limit]]
    return {"columns": cols, "rows": rows, "truncated": len(fetched) > limit}


class DbStore:
    def __init__(self, cursor):
        self.cur = cursor
        self._sub_cache: dict[int, dict | None] = {}
        self._verif_cache: dict[int, dict | None] = {}
        self._created: set[int] = set()

    def _one(self, sql: str, params: list) -> dict | None:
        rows = fetch_dicts(self.cur, sql, params, lower=True)
        return rows[0] if rows else None

    def probe_geometry(self, probe_id: int) -> dict | None:
        return self._one(
            "SELECT azPitchCm, elPitchCm, elPitch1Cm, MechFocusCm, MechFocus1Cm "
            "FROM dbo.Probe_info WHERE probeId = ?",
            [probe_id],
        )

    def sub_verif(self, sub_verif_id: int) -> dict | None:
        if sub_verif_id not in self._sub_cache:
            self._sub_cache[sub_verif_id] = self._one(
                f"SELECT {SUBVERIF_COLUMNS} FROM dbo.imag_subverif WHERE subVerifId = ?",
                [sub_verif_id],
            )
        return self._sub_cache[sub_verif_id]

    def verification(self, verif_id: int) -> dict | None:
        if verif_id not in self._verif_cache:
            self._verif_cache[verif_id] = self._one(
                "SELECT verifId, probeId, purpose, reportTerm FROM dbo.imag_verification WHERE verifId = ?",
                [verif_id],
            )
        return self._verif_cache[verif_id]

    def meas_candidates(self, probe_id: int, pulse_type: str) -> list[dict]:
        rows = fetch_dicts(
            self.cur,
            f"SELECT TOP ({MAX_CANDIDATES + 1}) {_CANDIDATE_COLUMNS} FROM dbo.meas_setting "
            "WHERE probeId = ? AND PMPulseType = ?",
            [probe_id, pulse_type],
            lower=True,
        )
        if len(rows) > MAX_CANDIDATES:
            raise MsiInputError("비교 대상 meas_setting 행이 너무 많아 안전하게 처리할 수 없습니다.")
        for r in rows:
            mid = r.get("meassetid")
            if mid is not None and int(mid) in self._created:
                r["_created_in_run"] = True
        return rows

    def insert_meas(self, row: dict) -> int | None:
        cols = [c for c in _INSERT_COLUMNS if c in row]
        unknown = set(row) - set(_INSERT_COLUMNS)
        if unknown:
            raise MsiInputError(f"허용되지 않은 컬럼: {sorted(unknown)}")
        sql = (
            "SET NOCOUNT ON; "
            f"INSERT INTO dbo.meas_setting ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)}); "
            "SELECT CAST(SCOPE_IDENTITY() AS INT) AS newId;"
        )
        self.cur.execute(sql, [row[c] for c in cols])
        new_id = None
        while True:
            if self.cur.description is not None:
                fetched = self.cur.fetchone()
                if fetched is not None and fetched[0] is not None:
                    new_id = int(fetched[0])
                    break
            if not self.cur.nextset():
                break
        if new_id is None:
            raise RuntimeError("새 measSetId 를 확인하지 못했습니다.")
        self._created.add(new_id)
        return new_id

    def update_excel_name(self, meas_set_id: int, value: str) -> None:
        self.cur.execute("UPDATE dbo.meas_setting SET ExcelFileName = ? WHERE measSetId = ?", [value, meas_set_id])
        if self.cur.rowcount not in (-1, 1):
            raise RuntimeError("ExcelFileName 갱신 대상이 1행이 아닙니다.")


class DryRunStore:
    """읽기는 실제 DB, 쓰기는 가상. 가상 INSERT 는 음수 ID 를 받는다."""

    def __init__(self, inner):
        self.inner = inner
        self._virtual: list[dict] = []
        self._updates: dict[int, str] = {}
        self._next_id = -1

    def probe_geometry(self, probe_id):
        return self.inner.probe_geometry(probe_id)

    def sub_verif(self, sub_verif_id):
        return self.inner.sub_verif(sub_verif_id)

    def verification(self, verif_id):
        return self.inner.verification(verif_id)

    def meas_candidates(self, probe_id, pulse_type):
        out = []
        for r in self.inner.meas_candidates(probe_id, pulse_type):
            mid = r.get("meassetid")
            if mid is not None and int(mid) in self._updates:
                r = {**r, "excelfilename": self._updates[int(mid)]}
            out.append(r)
        for r in self._virtual:
            if r["probeid"] == probe_id and str(r.get("pmpulsetype", "")).rstrip().casefold() == str(pulse_type).rstrip().casefold():
                out.append(dict(r))
        return out

    def insert_meas(self, row):
        new_id = self._next_id
        self._next_id -= 1
        # 가상 행은 정렬상 최신이어야 하므로 measSetId 비교용 값은 큰 양수로 둔다.
        virtual = {k.lower(): v for k, v in row.items()}
        virtual["meassetid"] = 10**12 - new_id
        virtual["_virtual_id"] = new_id
        virtual["_created_in_run"] = True
        self._virtual.append(virtual)
        return new_id

    def update_excel_name(self, meas_set_id, value):
        for r in self._virtual:
            if r["_virtual_id"] == meas_set_id:
                r["excelfilename"] = value
                return
        self._updates[int(meas_set_id)] = value


def _validate_ids(sub_verif_ids) -> list[int]:
    if not isinstance(sub_verif_ids, list) or not sub_verif_ids:
        raise MsiInputError("subVerifIds 는 비어 있지 않은 정수 배열이어야 합니다.")
    if len(sub_verif_ids) > MAX_SELECTION:
        raise MsiInputError(f"한 번에 최대 {MAX_SELECTION}개까지 처리할 수 있습니다.")
    out = []
    for v in sub_verif_ids:
        if isinstance(v, bool) or not isinstance(v, int) or not 0 < v <= SQL_INT_MAX:
            raise MsiInputError("subVerifIds 에 잘못된 값이 있습니다.")
        out.append(v)
    return out


def open_raw_connection(sql_obj):
    conn = sql_obj.engine.raw_connection()
    try:
        conn.autocommit = False
    except Exception:
        pass
    return conn


def commit_all(conn, cur) -> None:
    """``IF @@TRANCOUNT = 0 BEGIN TRANSACTION`` 으로 연 트랜잭션을 끝까지 커밋한다.

    ODBC 수동 커밋 모드는 IMPLICIT_TRANSACTIONS ON 이라 이때의 BEGIN TRANSACTION 은
    @@TRANCOUNT 를 2로 만든다. ``conn.commit()`` 은 한 단계만 커밋하므로, 그대로 두면
    연결 반환 시 롤백되어 쓴 데이터가 사라진다(#47).
    """
    cur.execute("WHILE @@TRANCOUNT > 0 COMMIT TRANSACTION;")
    conn.commit()


def list_probes(sql_obj) -> list[dict]:
    conn = open_raw_connection(sql_obj)
    try:
        cur = conn.cursor()
        return records(cur, f"SELECT TOP ({MAX_LIST_ROWS}) probeId, probeName FROM dbo.probe_info ORDER BY probeName")
    finally:
        conn.rollback()
        conn.close()


def list_verifications(sql_obj, probe_id: int, verif_filter: str | None) -> dict:
    clause, params = parse_verif_filter(verif_filter)
    where = (
        "WHERE probeId = ? AND isDataUsable = 'Yes' "
        "AND reportTerm NOT LIKE '%Temp' AND purpose NOT LIKE '%WCS'"
    )
    if clause:
        where += f" AND {clause}"
    conn = open_raw_connection(sql_obj)
    try:
        cur = conn.cursor()
        verifs = records(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) * FROM dbo.imag_verification {where} ORDER BY verifId",
            [probe_id, *params],
        )
        subs = records(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) {SUBVERIF_COLUMNS} FROM dbo.imag_subverif "
            f"WHERE verifId IN (SELECT verifId FROM dbo.imag_verification {where}) "
            "ORDER BY verifId, submodeName, FocusPCm",
            [probe_id, *params],
        )
        return {
            "verifications": verifs,
            "subVerifications": subs,
            "truncated": len(verifs) >= MAX_LIST_ROWS or len(subs) >= MAX_LIST_ROWS,
        }
    finally:
        conn.rollback()
        conn.close()


def preview(sql_obj, probe_id: int, sub_verif_ids, purpose_mode: str, min_meas_set_id: int) -> MsiPlan:
    ids = _validate_ids(sub_verif_ids)
    conn = open_raw_connection(sql_obj)
    try:
        store = DryRunStore(DbStore(conn.cursor()))
        return process_selection(store, probe_id, ids, purpose_mode, min_meas_set_id)
    finally:
        conn.rollback()
        conn.close()


def create(sql_obj, probe_id: int, sub_verif_ids, purpose_mode: str, min_meas_set_id: int,
           expected_hash: str) -> MsiPlan:
    ids = _validate_ids(sub_verif_ids)
    if not isinstance(expected_hash, str) or len(expected_hash) != 64:
        raise MsiInputError("미리보기 결과(planHash)가 필요합니다.")
    conn = open_raw_connection(sql_obj)
    committed = False
    try:
        cur = conn.cursor()
        cur.execute(
            "SET NOCOUNT ON; IF @@TRANCOUNT = 0 BEGIN TRANSACTION; DECLARE @rc INT; "
            "EXEC @rc = sp_getapplock @Resource = ?, @LockMode = 'Exclusive', "
            "@LockOwner = 'Transaction', @LockTimeout = ?; SELECT @rc;",
            [APPLOCK_RESOURCE, APPLOCK_TIMEOUT_MS],
        )
        rc = cur.fetchone()
        if rc is None or rc[0] is None or int(rc[0]) < 0:
            raise MsiConflictError(MsiPlan())
        # 계획 비교는 DB 쓰기 전에 가상 실행으로 먼저 한다(락을 잡은 상태라 상태가 고정됨).
        dry = process_selection(DryRunStore(DbStore(cur)), probe_id, ids, purpose_mode, min_meas_set_id)
        if dry.fingerprint() != expected_hash:
            raise MsiConflictError(dry)
        plan = process_selection(DbStore(cur), probe_id, ids, purpose_mode, min_meas_set_id)
        if plan.fingerprint() != expected_hash:
            # 확인받은 계획과 실제 실행이 다르면 커밋하지 않는다(finally 에서 롤백).
            raise RuntimeError("미리보기와 실제 실행 계획이 달라 생성을 취소했습니다.")
        commit_all(conn, cur)
        committed = True
        return plan
    finally:
        if not committed:
            try:
                conn.rollback()
            except Exception:
                pass
        conn.close()

# ─── msiFromDump 화면(원본 열 순서 그대로 표시) ─────────────────────────────

DUMP_VERIF_COLUMNS = (
    "verifId, probeId, swVersion, purpose, reportTerm, comments, probeSn, sysSn, recordDate, ExamId, "
    "Ispta3Limit, MiLimit, TiLimit, TraLimit, TrtLimit, apcIspta3, apcIspta, apcMI, apcTempRiseAir, "
    "apcTempRiseTmm, apcTis, apcTib, apcTic, apcMif, measTempRiseAir, measTempRiseTmm, isDataUsable, "
    "imageMode, apcTTIb, apcTTIsb, apcTTIs, ProbeName"
)
DUMP_SUBVERIF_COLUMNS = (
    "subVerifId, verifId, submodeName, PulseType, ApodType, AperType, FmMHz, FocusPCm, FocusQCm, AzimFnum, "
    "ElevFnum, ElevIndex, IsPhaseInverse, splitFocusEnable, PulseDurUs, FrameDurationTimeUsec, "
    "NumTimesFiredInFrame, NumLinesPerSlice, NumSlices, NumCollinearFirings, LineSpaceAt0cm, LineSpaceAt1cm, "
    "SliceSpaceAt0cm, SliceSpaceAt1cm, MaskCoefficient, EffectiveAreaCm2, Active12DbArea, txPowerUserSel, "
    "TxGain, ArfiDutyFactor, DisplayMultiHz, SpaceTimeIndex, ZoomFactor, RoiAxialSpanMm, RoiAzimSpan, "
    "RoiAzimMin, RoiAxialMinMm, NumFocalZones, FocusOrder, isReportable, PatternPrMPa, PatternIspta3, "
    "PatternIspta, PatternMI, PatternMIF, PatternTRair, PatternTRtmm, PatternTISass, PatternTISasu, "
    "PatternTISbsu, PatternTIBu, PatternTIC, PatternTTIb, PatternTTIsb, PatternTTIs, DepthCm, isCompound, "
    "SieClearIndex, InFocus, DisplayedPrfHz, IsHprfEnabled, RequestedPrfHz, splitFocusEnable, IsAutoHzEn, "
    "SoundSpeed"
)


def _read_only(sql_obj, fn):
    conn = open_raw_connection(sql_obj)
    try:
        return fn(conn.cursor())
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def list_probe_ids(sql_obj) -> list[int]:
    """msiFromDump/frmMain Load: ``SELECT ProbeId FROM probe_info ORDER BY ProbeId``."""
    rows = _read_only(sql_obj, lambda cur: fetch_dicts(
        cur, f"SELECT TOP ({MAX_LIST_ROWS}) probeId FROM dbo.probe_info ORDER BY probeId ASC", lower=True))
    return [int(r["probeid"]) for r in rows if r.get("probeid") is not None]


def dump_records(sql_obj, probe_id: int, verif_filter: str | None) -> dict:
    """msiFromDump ``Get Records``: imag_verification / imag_subverif 를 원본 열 순서 그대로."""
    clause, params = parse_verif_filter(verif_filter)
    where = (
        "WHERE probeId = ? AND isDataUsable = 'Yes' "
        "AND reportTerm NOT LIKE '%Temp' AND purpose NOT LIKE '%WCS'"
    )
    if clause:
        where += f" AND {clause}"

    def run(cur):
        verif = grid(cur, f"SELECT TOP ({MAX_LIST_ROWS}) {DUMP_VERIF_COLUMNS} FROM dbo.imag_verification {where}",
                     [probe_id, *params])
        sub = grid(
            cur,
            f"SELECT TOP ({MAX_LIST_ROWS}) {DUMP_SUBVERIF_COLUMNS} FROM dbo.imag_subverif "
            f"WHERE verifId IN (SELECT verifId FROM dbo.imag_verification {where}) "
            "ORDER BY verifId, submodeName, FocusPCm",
            [probe_id, *params],
        )
        return {"verification": verif, "subVerification": sub}

    return _read_only(sql_obj, run)


def meas_setting_rows(sql_obj, meas_set_ids: list[int]) -> dict:
    """msiFromDump ``Created records``: 이번 실행에서 새로 만든 meas_setting 행."""
    ids = sorted({int(i) for i in meas_set_ids if isinstance(i, int) and not isinstance(i, bool) and i > 0})[:MAX_SELECTION]
    if not ids:
        return {"columns": [], "rows": [], "truncated": False}
    marks = ",".join("?" * len(ids))
    return _read_only(sql_obj, lambda cur: grid(
        cur, f"SELECT * FROM dbo.meas_setting WHERE measSetId IN ({marks}) ORDER BY measSetId", ids))
