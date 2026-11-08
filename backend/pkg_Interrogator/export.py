"""Interrogator "RTP Export"(레거시 IntExport, IntExport.vb) DB 접근·CSV 생성.

frmMain 의 ``intExport.Show()`` 는 VB 대소문자 무시 규칙에 따라 Compass2.vbproj 가 컴파일하는
``IntExport.vb`` 클래스로 해석된다(``frmExport.vb`` 는 vbproj 에 포함되지 않음).
원본 R:\\ 경로 CSV 쓰기는 같은 파일명·같은 내용의 브라우저 다운로드로 대체한다.
"""

from __future__ import annotations

import datetime as _dt

from pkg_MsiInput.store import grid

from .power import vb_str

GRID_LIMIT = 5000
CSV_ROW_LIMIT = 200000
DUPLICATE_TIMEOUT = 3000

# (이름, SELECT * 조회, 제외 컬럼(CSV), CSV ORDER BY) — DataToCSV 의 Select Case 와 같은 순서·조건
_WHERE = {
    "Limits": ("dbo.Limits", "probeId = ? AND (Comments != 'unused' or Comments IS NULL)", "limitId", False),
    "PrbTypeList": ("dbo.prbTypeList", "probeId = ? AND (Comments != 'unused' or Comments IS NULL)", "typesId", False),
    "TempPrb_LUT": ("dbo.TempPrb_LUT",
                    "probeId = ? AND LUTname = ? AND (Comments != 'unused' or Comments IS NULL)", "tempPrbLUTId", True),
    "TempPulse_LUT": ("dbo.TempPulse_LUT",
                      "probeId = ? AND LUTname = ? AND (Comments != 'unused' OR Comments IS NULL)", "tempPulseId", True),
}
EXCLUDED = {
    "Limits": ("rtpName", "limitId", "Comments"),
    "TempPrb_LUT": ("Comments", "createPerson", "createDate"),
    "TempPulse_LUT": ("tempPulseId", "Comments"),
    "PrbTypeList": ("Comments",),
    "RTP_LUT": ("problemReport",),
    "TempPrbVolt_LUT": ("Comments",),
}
CSV_ORDER = ("RTP_LUT", "PrbTypeList", "Limits", "TempPrb_LUT", "TempPrbVolt_LUT", "TempPulse_LUT")

RTP_ORDER = " ORDER BY typesId, FmMHz, FocusPCm, azFnum"
VOLT_ORDER = " ORDER BY elevIndex, TrVoltPointV desc"


class ExportInputError(ValueError):
    pass


def check_rtp_name(name) -> str:
    name = "" if name is None else str(name)
    if len(name) > 100:
        raise ExportInputError("RTP Name 이 너무 깁니다.")
    return name


def list_probes(cur) -> list:
    cur.execute("SELECT distinct (probeId) AS probeId FROM dbo.RTP_LUT ORDER BY probeId")
    return [vb_str(r[0]) for r in cur.fetchall()]


def list_rtp_names(cur, probe_id: int) -> list:
    cur.execute("SELECT distinct (RTPName) AS RTPName FROM dbo.RTP_LUT WHERE probeId = ? ORDER BY RTPName", [probe_id])
    return [vb_str(r[0]) for r in cur.fetchall()]


def _table_sql(name: str, probe_id: int, rtp: str, temp_prb_ids: list | None = None) -> tuple[str, list]:
    if name == "RTP_LUT":
        return "SELECT * FROM dbo.RTP_LUT WHERE probeId = ? AND RTPName = ?" + RTP_ORDER, [probe_id, rtp]
    if name == "TempPrbVolt_LUT":
        where, params = temp_prb_where(temp_prb_ids or [])
        return ("SELECT * FROM dbo.TempPrbVolt_LUT WHERE (" + where
                + ") AND (Comments != 'unused' OR Comments IS NULL)" + VOLT_ORDER), params
    table, where, order, with_rtp = _WHERE[name]
    params = [probe_id, rtp] if with_rtp else [probe_id]
    return f"SELECT * FROM {table} WHERE {where} ORDER BY {order}", params


def temp_prb_where(ids: list) -> tuple[str, list]:
    """원본 tempPrbIdQuery("tempPrbLUTId = a OR ..." / 없으면 "tempPrbLUTId = -1")."""
    clean = [int(i) for i in ids if i is not None]
    if not clean:
        return "tempPrbLUTId = -1", []
    return " OR ".join("tempPrbLUTId = ?" for _ in clean), clean


def _temp_prb_ids(cur, probe_id: int, rtp: str) -> list:
    sql, params = _table_sql("TempPrb_LUT", probe_id, rtp)
    cur.execute(sql, params)
    cols = [c[0].lower() for c in cur.description]
    idx = cols.index("tempprblutid")
    return [r[idx] for r in cur.fetchall()]


def get_records(cur, probe_id: int, rtp: str) -> dict:
    """cmdGet_Click: 6개 테이블 조회 + RTP_LUT 문제 보고 여부."""
    cur.execute("SELECT isWobbler FROM dbo.Probe_info WHERE probeId = ?", [probe_id])
    row = cur.fetchone()
    is_wobbler = bool(row is not None and row[0] is not None and row[0] > 0)

    cur.execute("SELECT COUNT(*) FROM dbo.RTP_LUT WHERE probeId = ? AND RTPName = ? AND problemReport>0",
                [probe_id, rtp])
    rtp_report = 1 if (cur.fetchone() or [0])[0] > 0 else 0

    out = {"isWobbler": is_wobbler, "rtpReport": rtp_report, "tables": {}}
    for name in ("RTP_LUT", "PrbTypeList", "Limits", "TempPrb_LUT", "TempPulse_LUT"):
        sql, params = _table_sql(name, probe_id, rtp)
        out["tables"][name] = _counted_grid(cur, sql, params)
    ids = _temp_prb_ids(cur, probe_id, rtp)
    sql, params = _table_sql("TempPrbVolt_LUT", probe_id, rtp, ids)
    out["tables"]["TempPrbVolt_LUT"] = _counted_grid(cur, sql, params)
    return out


def _counted_grid(cur, sql: str, params: list) -> dict:
    data = grid(cur, sql, params, limit=GRID_LIMIT)
    count = len(data["rows"])
    if data["truncated"]:
        cnt_sql = "SELECT COUNT(*) FROM (" + sql.rsplit(" ORDER BY ", 1)[0] + ") q"
        cur.execute(cnt_sql, params)
        count = cur.fetchone()[0]
    data["count"] = count
    return data


def run_duplicate(cur, probe_id: int, rtp: str) -> dict:
    """cmdCopy_Click: rtp_M_duplicate 실행 후 RTP_LUT 다시 조회."""
    cur.execute("EXEC dbo.rtp_M_duplicate ?, ?", [probe_id, rtp])
    while cur.nextset():
        pass
    sql, params = _table_sql("RTP_LUT", probe_id, rtp)
    return _counted_grid(cur, sql, params)


def export_columns(all_columns: list, name: str) -> list:
    excluded = EXCLUDED[name]
    return [c for c in all_columns if c not in excluded]


def csv_text(columns: list, rows: list) -> str:
    """DataToCSV: 헤더·값을 ',' 로 연결, 줄 끝 CRLF(따옴표 처리 없음 — 원본 그대로)."""
    nl = "\r\n"
    parts = [",".join(columns) + nl]
    for row in rows:
        parts.append(",".join(vb_str(v) for v in row) + nl)
    return "".join(parts)


def vb_timestamp(now: _dt.datetime) -> str:
    """VB6.Format(Now, "mm.dd.yyyy") & "_" & VB6.Format(Now, "hh.mm.ss.am/pm")."""
    hour = now.hour % 12 or 12
    ampm = "pm" if now.hour >= 12 else "am"
    return f"{now:%m.%d.%Y}_{hour:02d}.{now:%M.%S}.{ampm}"


def build_csv_files(cur, probe_id: int, rtp: str, now: _dt.datetime | None = None) -> list[dict]:
    """cmdConvert_Click: 6개 CSV(같은 파일명 규칙)."""
    stamp = vb_timestamp(now or _dt.datetime.now())
    base = f"{stamp}_{probe_id}.{rtp}"
    ids = _temp_prb_ids(cur, probe_id, rtp)
    files = []
    for name in CSV_ORDER:
        sql, params = _table_sql(name, probe_id, rtp, ids)
        cur.execute(sql, params)
        all_cols = [c[0] for c in cur.description]
        keep = export_columns(all_cols, name)
        idx = [all_cols.index(c) for c in keep]
        fetched = cur.fetchmany(CSV_ROW_LIMIT + 1)
        if len(fetched) > CSV_ROW_LIMIT:
            raise ExportInputError(f"{name} 행이 너무 많습니다.")
        rows = [[r[i] for i in idx] for r in fetched]
        files.append({"fileName": f"{base}_{name}.csv", "content": csv_text(keep, rows)})
    return files
