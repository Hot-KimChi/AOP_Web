"""measSetInput(msiReader) 엑셀 이식 엔진 테스트 — 실제 DB 없이 가짜 저장소로 검증."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest

from pkg_MsiInput import excel_engine as eng
from pkg_MsiInput.excel_io import parse_upload, read_xlsx, write_xlsx
from pkg_MsiInput.excel_store import _where, _MEAS_CRITERIA
from pkg_MsiInput.excel_vb import MsiExcelError, cstr, decimal_5, f32, vb_str, vb_val


# ---------------------------------------------------------------- 가짜 저장소


def _match(rec: dict, criteria: list) -> bool:
    for col, op, value in criteria:
        if col == "ABS_AZAPER":
            left = abs(float(rec.get("azAperSizeMm") or 0) - float(value[0]))
            right = float(value[1])
        else:
            key = {"PMpulseType": "PMPulseType", "FmMHz": "FmMhz"}.get(col, col)
            left = rec.get(key)
            right = value
            if isinstance(right, Decimal):
                if left is None:
                    return False
                left, right = float(left), float(right)
        ok = {"=": left == right, ">=": left >= right, "<=": left <= right, ">": left > right}[op]
        if not ok:
            return False
    return True


class FakeRepo:
    def __init__(self, probe=None, meas=None, temp=None):
        self.probe = probe if probe is not None else {
            "azPitchCm": 0.03, "elPitchCm": 0.4, "elPitch1Cm": None, "MechFocusCm": 6.0, "MechFocus1Cm": None,
            "azNumElements": 128, "elNumElements": 1, "probeDescription": "Linear 1D probe",
        }
        self.meas = list(meas or [])
        self.temp = list(temp or [])
        self.updates = []
        self.apex = None
        self.prf = None
        self.init_temp = True
        self.power = {}

    def max_meas_set_id(self):
        return max((r["measSetId"] for r in self.meas), default=None)

    def max_temp_set_id(self):
        return max((r["tempSetId"] for r in self.temp), default=None)

    def probe_info(self, pid):
        return self.probe

    def find_meas(self, crit):
        _where(crit, _MEAS_CRITERIA)
        return sorted([r for r in self.meas if _match(r, crit)], key=lambda r: r["measSetId"])

    def count_meas(self, crit):
        return len(self.find_meas(crit))

    def update_meas(self, mid, vals):
        self.updates.append((mid, vals))
        for r in self.meas:
            if r["measSetId"] == mid:
                r.update({k: (float(v) if isinstance(v, Decimal) else v) for k, v in vals.items()})

    def insert_meas(self, vals):
        mid = (self.max_meas_set_id() or 0) + 1
        self.meas.append({"measSetId": mid, **vals})
        return mid

    def new_set_range(self, max_id, pid):
        ids = [r["measSetId"] for r in self.meas if r["measSetId"] > max_id and float(r.get("probeId", -1)) == float(pid)]
        return (min(ids), max(ids)) if ids else (None, None)

    def new_meas_grid(self, pid, max_id):
        rows = [r for r in self.meas if r["measSetId"] > max_id]
        return {"columns": ["measSetId"], "rows": [[r["measSetId"]] for r in rows], "truncated": False}

    def update_probe_apex(self, apex, pid):
        self.apex = (apex, pid)

    def count_temp(self, crit):
        return len([r for r in self.temp if _match(r, crit)])

    def insert_temp(self, vals):
        self.temp.append({"tempSetId": (self.max_temp_set_id() or 0) + 1, **vals})

    def new_temp_grid(self, pid, max_id):
        rows = [r for r in self.temp if r["tempSetId"] > max_id]
        return {"columns": ["tempSetId"], "rows": [[r["tempSetId"]] for r in rows], "truncated": False}

    def power_set_id(self, mid):
        return self.power.get(mid)

    def has_init_temp(self, pid):
        return self.init_temp

    def run_update_prf(self, pid, limit):
        self.prf = (pid, limit)


COLS = ["subModeName", "probeId", "isScw", "PMPulseType", "CenterFrequencyMHz", "pulseWidthUsec",
        "FractionalBandwidth", "azFnum", "ApodType", "azFocusMm", "azAperSizeMm", "elevIndex", "elAperType",
        "EdgeTreatment", "elAperSizeMm", "ceilTxGain", "apexMm", "isPhaseInverse"]


def _row(**kw):
    base = {"subModeName": "B", "probeId": 77, "isScw": 0, "PMPulseType": "Bipolar", "CenterFrequencyMHz": "5",
            "pulseWidthUsec": None, "FractionalBandwidth": 0.5, "azFnum": 2, "ApodType": "Hann",
            "azFocusMm": "20 40", "azAperSizeMm": "10 20", "elevIndex": "0 0", "elAperType": "",
            "EdgeTreatment": "Truncate", "elAperSizeMm": "", "ceilTxGain": 1, "apexMm": -5, "isPhaseInverse": 0}
    base.update(kw)
    return [base[c] for c in COLS]


def _body(rows, **kw):
    b = {"columns": COLS, "rows": rows, "selectedProbeId": 77, "profVoltage": "0.48329", "maxVoltage": "1",
         "vPoints": "20", "voltNum": "12", "speedSound": "1540", "purpose": "RTP", "outputName": "C:\\x\\a.xlsx"}
    b.update(kw)
    return eng.form_from_body(b)


# ---------------------------------------------------------------- VB 변환


def test_vb_str_and_cstr_semantics():
    assert vb_str(0.5) == " .5"
    assert vb_str(-0.25) == "-.25"
    assert vb_str(12) == " 12"
    assert vb_str(f32(0.1)) == " .1"
    assert cstr(1 / 3.5) == "0.285714285714286"
    assert cstr(0.00001) == "1E-05"
    assert cstr(float("inf")) == "Infinity"
    assert vb_val(" 1 2.5x") == 12.5
    assert vb_val("True") == 0
    assert vb_val("1D2") == 100
    assert decimal_5(3 / 3.5) == "0.85714"


def test_aper_size_format_and_out_of_range():
    r = eng.aper_size("20 40 60", "10 20 30", "30 50 70", 45)
    assert r.ok and r.update_foc == " 30  50 " and r.update_term == " 15  25 " and r.elev_index == "0 1 "
    r = eng.aper_size("20 40", "10 20 30", "30", 10)
    assert not r.ok and "not same" in r.message
    r = eng.aper_size("20 40", "10 20", "20", 10)
    assert r.update_term == " 10" and r.elev_index == "1"


def test_update_all_and_cell_double_click():
    cols = ["a", "probeId", "azFocusMm", "azAperSizeMm", "elevIndex"]
    res = eng.update_all(cols, [[1, 5, "20 40", "10 20", "0 0"], [1, None, "x", "y", "z"]], "30")
    assert res["rows"][0][2:] == [" 30", " 15", "0"] and res["salmon"] == [[0, 3]]
    assert res["rows"][1][2] == "x"
    cols12 = [f"c{i}" for i in range(11)] + ["azFocusMm", "azAperSizeMm", "elevIndex"]
    row = [None] * 11 + ["20 40", "10 20", "0 0"]
    out = eng.cell_double_click(cols12, row, 11, "30", "", False)
    assert out["row"][11] == "30" and out["row"][12] == " 15" and out["salmon"] == [12]
    out = eng.cell_double_click(cols12, ["x"] * 11 + ["a b c", "", ""], 11, "", "0 2", False)
    assert out["row"][11] == "a c"


# ---------------------------------------------------------------- Tank


def test_tank_insert_values_and_epulse():
    repo = FakeRepo()
    res = eng.save_tank(_body([_row()]), repo)
    assert res["inserted"] == 2 and res["setRange"] == " 1: 2"
    r = repo.meas[0]
    assert r["FmMhz"] == 5 and r["FocusPMm"] == 20 and r["azAperSizeMm"] == 10 and r["elevIndex"] == 0
    assert r["pulseBandwidthMHz"] == 2.5 and r["pulseWidthUsec"] == 0.4
    # fractBW 0.5 → nn=6 → 2/f 자리에 pulseWidth
    assert r["ePulseString"] == "0.2 0.3 0.4 0.6"
    assert r["elAperSizeMm"] == 4 and r["elAperType"] == "rect" and r["comments"] == "RTP"
    assert r["zEndCm"] == 7 and r["zStartCm"] == 0 and r["pulseRateHz"] == 100
    assert "azFnum" not in r and "elFnum" not in r and r["apexCm"] == 0.5
    assert repo.apex == (0.5, Decimal("77"))


def test_tank_update_existing_epulse():
    repo = FakeRepo()
    eng.save_tank(_body([_row(azFocusMm="20", azAperSizeMm="10", elevIndex="0")]), repo)
    res = eng.save_tank(_body([_row(azFocusMm="20", azAperSizeMm="10", elevIndex="0",
                                    FractionalBandwidth=0.25)]), repo)
    assert res["inserted"] == 0 and res["updated"] == 1
    mid, vals = repo.updates[-1]
    # fractBW 0.25 → nn=3 → 3/f="0.6" 이 있지만 끝 항목이라 "0.6 " 치환이 일어나지 않는다(원본 동작).
    assert vals["ePulseString"] == "0.2 0.3 0.4 0.6 "
    assert vals["pulseBandwidthMHz"] == 1.25 and vals["pulseWidthUsec"] == Decimal("0.8")
    assert "modified based on pulseWidth:  1" in res["messages"][0]


def test_tank_phase_inverse_update():
    repo = FakeRepo()
    eng.save_tank(_body([_row(azFocusMm="20", azAperSizeMm="10", elevIndex="0")]), repo)
    cols = COLS + ["isPhaseInverse"]
    body = _body([_row(azFocusMm="20", azAperSizeMm="10", elevIndex="0") + [True]], columns=cols)
    res = eng.save_tank(body, repo)
    assert repo.meas[0]["isPhaseInverse"] == 1
    assert any("isPhaseInverse  1" in m for m in res["messages"])


@pytest.mark.parametrize("kw,msg", [
    ({"azAperSizeMm": "10"}, "different lengths"),
    ({"ceilTxGain": 0.4}, "Profile gain is 5% greater"),
])
def test_tank_aborts(kw, msg):
    with pytest.raises(MsiExcelError, match=msg):
        eng.save_tank(_body([_row(**kw)]), FakeRepo())


def test_tank_empty_and_chirp_and_create_new():
    with pytest.raises(MsiExcelError, match="Nothing in Selected RTP"):
        eng.save_tank(_body([]), FakeRepo())
    repo = FakeRepo()
    res = eng.save_tank(_body([_row(PMPulseType="GaussianChirp", azFocusMm="20", azAperSizeMm="10", elevIndex="0")],
                              numCycList="1 3"), repo)
    assert repo.meas[0]["ePulseString"] == "0.20000 0.60000"
    assert res["messages"][-1].startswith("Please manually update Gaussian Chirp")
    eng.save_tank(_body([_row(azFocusMm="20", azAperSizeMm="10", elevIndex="0")], isCreateNew=True, msi="1"), repo)
    assert len(repo.meas) == 2


def test_tank_cw_uses_previous_frequency():
    repo = FakeRepo()
    eng.save_tank(_body([_row(isScw=1, PMPulseType="Cw", CenterFrequencyMHz="4 5", azFocusMm="20",
                              azAperSizeMm="10", elevIndex="0")]), repo)
    assert [r["pulseWidthUsec"] for r in repo.meas] == [0, 0.25]
    assert all(r["numTxCycles"] == 1 for r in repo.meas)


# ---------------------------------------------------------------- Power


def test_power_insert_then_update():
    repo = FakeRepo()
    cols = COLS + ["NumCycles"]
    res = eng.save_power(_body([_row(FractionalBandwidth=None) + [2]], columns=cols), repo)
    assert res["inserted"] == 1
    r = repo.meas[0]
    assert r["comments"] == "Power" and r["azApodType"] == "Rectangle" and r["FocusPMm"] == 40
    assert r["azAperSizeMm"] == pytest.approx(9.9) and r["pulseWidthUsec"] == 0.4 and r["elevIndex"] == 0
    assert r["elAperSizeMm"] == 4 and r["edgeTreatment"] == "Truncate" and "apexCm" not in r
    res = eng.save_power(_body([_row(FractionalBandwidth=None) + [3]], columns=cols), repo)
    assert res["inserted"] == 0 and repo.updates[-1][1] == {"pulseWidthUsec": 0.6, "numTxCycles": 3}


def test_power_messages():
    with pytest.raises(MsiExcelError, match="i=0"):
        eng.save_power(_body([_row(ceilTxGain=0.1)]), FakeRepo())
    res = eng.save_power(_body([_row(pulseWidthUsec="0.3")]), FakeRepo())
    assert "The data in column: pulseWidthUsec will be ignored!" in res["messages"]


# ---------------------------------------------------------------- Temp


def test_temp_option_0_and_duplicates():
    repo = FakeRepo()
    body = _body([_row()], tempOpt="0", selectLabel="Volt:", selectValue="2 3", selectValue2="64",
                 pulseVoltage="0.392157", pulseWidthUsec="0.5", cwUseCode="0")
    res = eng.save_temp(body, repo)
    assert res["inserted"] == 2
    t = repo.temp[0]
    assert t["FmMhz"] == 2 and t["azAperElem"] == 64 and t["azAperSizeMm"] == pytest.approx(19.2)
    assert t["PMPulseType"] == "Rectangle" and t["numTxCycles"] == 1 and t["measSetNum"] == 0
    assert t["elAperSizeMm"] == 4 and t["elAperElem"] == 1 and "pulseBandwidthMHz" not in t
    assert eng.save_temp(body, repo)["inserted"] == 0


def test_temp_option_checks_and_14():
    with pytest.raises(MsiExcelError, match="Please Select Options"):
        eng.save_temp(_body([_row()], tempOpt=""), FakeRepo())
    with pytest.raises(MsiExcelError, match="start, end, step"):
        eng.save_temp(_body([_row()], tempOpt="14", selectValue="1 2"), FakeRepo())
    assert eng._freq_range_14("1 2 0.5") == ["1", "1.5", "2"]
    repo = FakeRepo()
    eng.save_temp(_body([_row()], tempOpt="14", selectValue="1 2 0.5", selectValue2="10"), repo)
    assert [t["FmMhz"] for t in repo.temp] == [1, 1.5, 2]


def test_temp_option_4_and_1():
    repo = FakeRepo()
    eng.save_temp(_body([_row()], tempOpt="4", selectValue="2 3", selectValue2="10", pulseVoltage="0.3 0.4"), repo)
    assert sorted((t["FmMhz"], t["measVoltage"]) for t in repo.temp) == [(2, 0.3), (2, 0.4), (3, 0.3), (3, 0.4)]
    repo = FakeRepo()
    eng.save_temp(_body([_row(CenterFrequencyMHz="4 5")], tempOpt="1", selectValue="1.5"), repo)
    assert [t["FmMhz"] for t in repo.temp] == [4, 5] and repo.temp[0]["azAperElem"] == 64
    assert repo.temp[0]["multiPulseWidthUs"] == 1.5 and repo.temp[0]["PMPulseType"] == "Bipolar"


# ---------------------------------------------------------------- 기타


def test_power_setid_text_and_update_prf():
    repo = FakeRepo()
    repo.power = {11: 5}
    out = eng.power_setid_text("10:11", repo, dt.date(2024, 1, 2))
    assert out["fileName"] == "MeasInput_20240102.txt"
    assert out["content"] == "measSetId\tPower_measSetId\r\n\r\n 11\t5\r\n"
    with pytest.raises(MsiExcelError, match="Please fill in SetId Range"):
        eng.power_setid_text("", repo)
    eng.update_prf(77, "2.5", repo)
    assert repo.prf == (77, 2)
    repo.init_temp = False
    with pytest.raises(MsiExcelError, match="No initial temp data"):
        eng.update_prf(77, "3", repo)


def test_xlsx_roundtrip_and_csv():
    data = write_xlsx(["a", "b"], [["1.5", "x y"], [2, None]])
    parsed = read_xlsx(data)
    assert parsed["columns"][:3] == ["a", "b", "F3"] and len(parsed["columns"]) == 27
    assert parsed["rows"][0][:2] == [1.5, "x y"] and parsed["rows"][1][:2] == [2, None]
    assert parse_upload("t.xlsx", data)["rows"][0][0] == 1.5
    csv = (",".join(f"h{i}" for i in range(27)) + "\r\n" + ",".join(str(i) for i in range(27)) + "\r\n").encode()
    assert parse_upload("t.csv", csv)["rows"][0][3] == "3"
    with pytest.raises(MsiExcelError):
        parse_upload("t.csv", b"a,b\n1,2\n")


def test_xls_biff_read(monkeypatch):
    import xlrd

    class Cell:
        def __init__(self, ctype, value):
            self.ctype, self.value = ctype, value

    class Sheet:
        nrows, ncols = 4, 3
        data = [[(xlrd.XL_CELL_TEXT, "a"), (xlrd.XL_CELL_TEXT, "b"), (xlrd.XL_CELL_EMPTY, "")],
                [(xlrd.XL_CELL_NUMBER, 1.0), (xlrd.XL_CELL_NUMBER, 2.5), (xlrd.XL_CELL_TEXT, "x")],
                [(xlrd.XL_CELL_BOOLEAN, 1), (xlrd.XL_CELL_ERROR, 7), (xlrd.XL_CELL_BLANK, "")],
                [(xlrd.XL_CELL_EMPTY, "")] * 3]

        def cell(self, r, c):
            return Cell(*self.data[r][c])

    class Book:
        released = False

        def sheet_names(self):
            return ["SHEET1"]

        def sheet_by_name(self, name):
            assert name == "SHEET1"
            return Sheet()

        def release_resources(self):
            Book.released = True

    monkeypatch.setattr(xlrd, "open_workbook", lambda **kw: Book())
    parsed = parse_upload("t.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 10)
    assert parsed["columns"][:3] == ["a", "b", "F3"] and len(parsed["columns"]) == 27
    assert len(parsed["rows"]) == 2
    assert parsed["rows"][0][:3] == [1, 2.5, "x"]
    assert parsed["rows"][1][:3] == [True, None, None]
    assert Book.released

    Book.sheet_names = lambda self: ["Other"]
    with pytest.raises(MsiExcelError, match="Sheet1"):
        parse_upload("t.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")


def test_xls_corrupt_raises():
    with pytest.raises(MsiExcelError, match=".xls"):
        parse_upload("t.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 10)


def test_store_where_rejects_unknown_column():
    with pytest.raises(MsiExcelError):
        _where([("probeId; DROP", "=", 1)], _MEAS_CRITERIA)
    sql, params = _where([("ABS_AZAPER", "<=", (Decimal("10"), Decimal("0.03")))], _MEAS_CRITERIA)
    assert sql == "ABS(azAperSizeMm - ?) <= ?" and params == [Decimal("10"), Decimal("0.03")]


# ---------------------------------------------------------------- #47 트랜잭션 커밋(IMPLICIT_TRANSACTIONS ON)


class _ImplicitTxConn:
    """ODBC 수동 커밋 모드(IMPLICIT_TRANSACTIONS ON)의 @@TRANCOUNT 동작을 흉내 낸다.

    - @@TRANCOUNT = 0 에서 BEGIN TRANSACTION → 암시적 + 명시적 = 2
    - conn.commit() 은 ``IF @@TRANCOUNT > 0 COMMIT`` 한 번(한 단계만 감소)
    - 커밋되지 않은 채 닫히면 작업은 사라진다.
    """

    def __init__(self):
        self.trancount = 0
        self.pending = 0
        self.durable = 0
        self.closed = False

    def _commit_one(self):
        if self.trancount > 0:
            self.trancount -= 1
            if self.trancount == 0:
                self.durable += self.pending
                self.pending = 0

    def cursor(self):
        conn = self

        class _Cur:
            def execute(self, sql, params=()):
                if "BEGIN TRANSACTION" in sql and conn.trancount == 0:
                    conn.trancount = 2
                elif "BEGIN TRANSACTION" in sql:
                    conn.trancount += 1
                if "WHILE @@TRANCOUNT > 0 COMMIT" in sql:
                    while conn.trancount > 0:
                        conn._commit_one()
                if sql.startswith("INSERT"):
                    conn.trancount = conn.trancount or 1
                    conn.pending += 1
                return self

            def fetchone(self):
                return (0,)

        return _Cur()

    def commit(self):
        self._commit_one()

    def rollback(self):
        self.trancount = 0
        self.pending = 0

    def close(self):
        self.pending = 0
        self.closed = True


def test_run_write_commits_all_nesting_levels(monkeypatch):
    from pkg_MsiInput import excel_store as xs

    conn = _ImplicitTxConn()
    monkeypatch.setattr(xs, "open_raw_connection", lambda sql_obj: conn)

    def work(repo):
        repo.cur.execute("INSERT INTO dbo.meas_setting (x) VALUES (?)", [1])
        return {"ok": True}

    assert xs.run_write(object(), work) == {"ok": True}
    assert conn.durable == 1 and conn.trancount == 0 and conn.closed


def test_run_write_rolls_back_on_error(monkeypatch):
    from pkg_MsiInput import excel_store as xs

    conn = _ImplicitTxConn()
    monkeypatch.setattr(xs, "open_raw_connection", lambda sql_obj: conn)

    def work(repo):
        repo.cur.execute("INSERT INTO dbo.meas_setting (x) VALUES (?)", [1])
        raise MsiExcelError("stop")

    with pytest.raises(MsiExcelError):
        xs.run_write(object(), work)
    assert conn.durable == 0 and conn.closed


# ---------------------------------------------------------------- #48 Create New from MSI(원본 VB 중복 검사 범위)


def test_tank_create_new_from_msi_window():
    row = lambda: _row(azFocusMm="20", azAperSizeMm="10", elevIndex="0")
    repo = FakeRepo()
    eng.save_tank(_body([row()]), repo)
    assert len(repo.meas) == 1
    # 체크 해제: MSI 값과 무관하게 전체 범위에서 중복 → 추가 안 함
    assert eng.save_tank(_body([row()], isCreateNew=False, msi="2"), repo)["inserted"] == 0
    # 체크 + MSI=0(기본값): 체크 해제와 같다
    assert eng.save_tank(_body([row()], isCreateNew=True, msi="0"), repo)["inserted"] == 0
    # 체크 + MSI=1: measSetId >= 1 이므로 기존 1번이 중복
    assert eng.save_tank(_body([row()], isCreateNew=True, msi="1"), repo)["inserted"] == 0
    # 체크 + MSI=2: 기존 1번은 범위 밖 → 새로 추가
    assert eng.save_tank(_body([row()], isCreateNew=True, msi="2"), repo)["inserted"] == 1
    assert len(repo.meas) == 2
    # 체크 + MSI=0, MSIEnd=0: 모든 기존 행이 범위 밖 → 새로 추가
    assert eng.save_tank(_body([row()], isCreateNew=True, msi="0", msiEnd="0"), repo)["inserted"] == 1


def test_power_create_new_from_msi_is_strict_greater():
    cols = COLS + ["NumCycles"]
    body = lambda **kw: _body([_row(FractionalBandwidth=None) + [2]], columns=cols, **kw)
    repo = FakeRepo()
    eng.save_power(body(), repo)
    assert len(repo.meas) == 1
    assert eng.save_power(body(isCreateNew=True, msi="0"), repo)["inserted"] == 0
    # Power 는 measSetId > MSI(원본 1071행) — MSI=1 이면 기존 1번이 범위 밖
    assert eng.save_power(body(isCreateNew=True, msi="1"), repo)["inserted"] == 1
