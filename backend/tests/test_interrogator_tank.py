import io
import math

import jwt
import pytest
from flask import Flask

from config import Config
from pkg_Interrogator import tank
from routes import interrogator_tank as route


class FakeCursor:
    """SQL 부분 문자열 → (columns, rows) 응답. 실행 기록을 남긴다."""

    def __init__(self, answers):
        self.answers = answers
        self.executed = []
        self.description = None
        self._rows = []

    def execute(self, sql, params=()):
        self.executed.append((sql, list(params)))
        for needle, ans in self.answers.items():
            if needle in sql:
                cols, rows = ans(sql, list(params)) if callable(ans) else ans
                self.description = [(c,) for c in cols] if cols else None
                self._rows = list(rows)
                return self
        self.description = None
        self._rows = []
        return self

    def fetchall(self):
        return self._rows

    def fetchmany(self, n):
        return self._rows[:n]

    def nextset(self):
        return False


class FakeConn:
    def __init__(self, cur):
        self.cur = cur
        self.committed = self.rolled = self.closed = False
        self.timeout = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled = True

    def close(self):
        self.closed = True


# ---------------------------------------------------------------- 값 변환

def test_pre_rtp_tank_propagates_nextset_error():
    class ErrCursor(FakeCursor):
        def nextset(self):
            raise RuntimeError("proc failed")

    with pytest.raises(RuntimeError, match="proc failed"):
        tank.run_pre_rtp_tank(ErrCursor({}), 1, "R", "1.0")


def test_vb_str():
    assert tank.vb_str(None) == ""
    assert tank.vb_str(3.0) == "3"
    assert tank.vb_str(2.5) == "2.5"
    assert tank.vb_str(0.1) == "0.1"
    assert tank.vb_str(" ab ") == "ab"


def test_decimal_text_and_single():
    assert tank.decimal_text("3.5") == "3.5"
    assert tank.decimal_text("1e-3") == "0.001"
    with pytest.raises(tank.TankInputError):
        tank.decimal_text("1;DROP")
    assert tank.to_single("0.1") == pytest.approx(0.1)
    with pytest.raises(tank.TankInputError):
        tank.to_single("1e60")


def test_order_and_sw_versions():
    assert tank.order_clause([]) == tank.DEFAULT_ORDER
    assert tank.order_clause(["FmMHz", "", "azFnum"]) == "FmMHz, azFnum"
    with pytest.raises(tank.TankInputError):
        tank.order_clause(["resId; drop"])
    assert tank.sw_version_param(["a", "b"]) == "a;b"
    with pytest.raises(tank.TankInputError, match="maximum of three"):
        tank.sw_version_param(["a", "b", "c", "d"])
    with pytest.raises(tank.TankInputError):
        tank.check_zloc("x; drop")


def test_mri_list_skips_null_azfnum_only_after_proc():
    cols = ["resId", "PMpulseType", "azApodType", "elAperType", "FmMHz", "FocusPCm", "azFnum", "elFnum", "mark"]
    rows = [(1, "B", "H", "F", 2.5, 4.0, 2.0, None, "checked"), (2, "B", "H", "F", 2.5, 4.0, None, 1.0, None)]
    cur = FakeCursor({"FROM trtp_measurement ORDER BY": (cols, rows)})
    assert tank.mri_list(cur) == [
        ["1", "B", "H", "F", "2.5", "4", "2", "", "c"], ["2", "B", "H", "F", "2.5", "4", "", "1", ""]]
    assert len(tank.mri_list(cur, skip_null_azfnum=True)) == 1
    assert tank.toggled_mark("c") == "unchecked"
    assert tank.toggled_mark("") == "checked"


# ---------------------------------------------------------------- CheckMiAndPii

def test_check_mi_dip_interpolates_and_flags():
    res = tank.check_mi_and_pii([1, 2, 3, 4], [1.0, 0.5, 3.0, 4.0], 5.0, True)
    assert res["dip"] == 1
    assert res["flags"] == [0, 5.0, 0, 0]
    assert res["values"][1] == pytest.approx(2.0)


def test_check_mi_uses_next_next_point():
    res = tank.check_mi_and_pii([1, 2, 3, 4, 5], [2.0, 1.0, 1.5, 5.0, 6.0], 3.0, True)
    # j=2 dip, y1(2) > y3(1.5) → k=4
    assert res["flags"][1] == 3.0
    assert res["values"][1] == pytest.approx((2 - 1) / (4 - 1) * (5 - 2) + 2)


def test_check_unresolvable_dip_sets_1000():
    res = tank.check_mi_and_pii([1, 2, 3], [5.0, 1.0, 2.0], 1.0, True)
    assert res["dip"] >= 1000


def test_check_last_point_and_pii_formula():
    res = tank.check_mi_and_pii([1, 2, 3], [1.0, 2.0, 1.0], 4.0, False)
    assert res["dip"] == 1 and res["flags"] == [0, 0, 4.0]
    assert res["values"][2] == pytest.approx((9 - 1) / (4 - 1) * (2 - 1) + 1)
    # 1점·0점 가드
    assert tank.check_mi_and_pii([1], [1.0], 1.0, True)["dip"] == 0
    assert tank.check_mi_and_pii([], [], 1.0, True)["values"] == []


def test_check_pii_typo_formula_preserved():
    res = tank.check_mi_and_pii([1, 2, 3, 4], [1.0, 0.5, 3.0, 4.0], 2.0, False)
    expected = ((2 ** 2 - 1) ** 2) / (3 ** 2 - 1 ** 2) * (3.0 - 1.0) + 1.0
    assert res["values"][1] == pytest.approx(expected)


def test_div_zero():
    assert math.isnan(tank._div(0, 0))
    assert tank._div(1, 0) == math.inf


# ---------------------------------------------------------------- 그래프 SQL

def test_draw_where_mif_per_mri():
    w, p = tank.draw_where("MIF", 7, 0.5)
    assert p == [7, 0.5, 7] and "ws_voltage_dep WHERE resId = ?" in w
    assert tank.draw_where("Voltage", 7, 0.5) == ("", [])


def test_edit_zloc_clause_column_name():
    assert tank.edit_zloc_clause("ztsii31Cm", "ztsii31Cm") == ("AND Q.zDistanceCm = R.ztsii31Cm", [])
    assert tank.edit_zloc_clause(3.5, "ztsii31Cm") == ("AND Q.zDistanceCm = ?", [3.5])


def test_draw_graph_merges_range_and_lines():
    def mm(sql, params):
        return (["XMin", "XMax", "YMin", "YMax"], [(0, 10, 1, 5)] if params[0] == 1 else [(-1, 8, 0, 9)])

    def pts(sql, params):
        return (["DataPointX", "DataPointY"], [(0, 1), (1, 2)])
    cur = FakeCursor({"SELECT XMin": mm, "SELECT DataPointX": pts})
    res = tank.draw_graph(cur, "Lateral", [1, 2], "ztsii31Cm", 0.5)
    assert res["range"] == {"xMin": -1, "xMax": 10, "yMin": 0, "yMax": 9}
    assert [ln["resId"] for ln in res["lines"]] == [1, 2]
    assert "R.ztsii31Cm" in cur.executed[0][0]


def test_draw_graph_aborts_on_null_range():
    cur = FakeCursor({"SELECT XMin": (["XMin", "XMax", "YMin", "YMax"], [(None, None, None, None)])})
    assert tank.draw_graph(cur, "Z", [1], "ztsii31Cm", 0.5)["aborted"] is True


def test_save_edit_uses_single_values():
    cur = FakeCursor({})
    tank.save_edit(cur, "MI", 12, "0.1", 2)
    sql, params = cur.executed[0]
    assert sql == "UPDATE ws_voltage_dep SET TxGain = ?, MI = ? WHERE voltId = ?"
    assert params == [pytest.approx(0.1), 2.0, 12]
    with pytest.raises(tank.TankInputError):
        tank.save_edit(cur, "Bad", 1, 1, 1)


def test_save_auto_check_updates_flagged_rows():
    cur = FakeCursor({"FROM ws_Voltage_dep": (["TxGain", "DataPointY"], [(1, 1.0), (2, 0.5), (3, 3.0), (4, 4.0)])})
    n = tank.save_auto_check(cur, "MI", 9, 5.0)
    assert n == 1
    sql, params = cur.executed[-1]
    assert sql.startswith("UPDATE ws_voltage_dep SET MI = ?")
    assert params[1:] == [9, 2, 5.0] and params[0] == pytest.approx(2.0)


def test_auto_check_adds_corrected_line():
    cur = FakeCursor({
        "FROM ws_Voltage_dep": (["TxGain", "DataPointY"], [(1, 1.0), (2, 0.5), (3, 3.0)]),
        "SELECT XMin": (["XMin", "XMax", "YMin", "YMax"], [(1, 3, 0.5, 3.0)]),
        "SELECT Bookmark": (["Bookmark", "DataPointX", "DataPointY"], [(11, 1, 1.0), (12, 2, 0.5), (13, 3, 3.0)]),
    })
    res = tank.auto_check(cur, "MI", 4, 5.0, None, "ztsii31Cm", 0.5)
    assert res["dip"] == 1 and res["corrected"][1][1] == pytest.approx(2.0)
    assert res["bookmarks"] == [11, 12, 13]


def test_records_payload_after_proc_recomputes_zmin():
    cols = ["resId", "PMpulseType", "azApodType", "elAperType", "FmMHz", "FocusPCm", "azFnum", "elFnum", "mark"]
    cur = FakeCursor({
        "FROM trtp_measurement ORDER BY": (cols, [(1, "B", "H", "F", 2.5, 4.0, 2.0, 1.0, "c")]),
        "SELECT zmin": (["zmin"], [(0.3,)]),
        "SELECT Q.resId AS MRI": (["MRI", "zDistanceCm"], [(1, 3.0)]),
    })
    res = tank.records_payload(cur, "ztsii31Cm", None, after_proc=True)
    assert res["zmin"] == 0.3
    assert list(res["grids"]) == ["Lateral", "Elevation", "Z", "Voltage", "MI", "MIF"]
    assert res["grids"]["MIF"]["columns"] == ["MRI", "zDistanceCm"]
    assert cur.executed[-1][1] == [0.3, 0.3, 0.3]


# ---------------------------------------------------------------- frmDetail

def test_parse_and_build_waveforms():
    vals, scale = tank.parse_waveform("a b c 2V 1 2 3 4 5 6 7 8")
    assert scale == 2.0 and vals[0] == 1.0
    res = tank.build_waveforms([(vals, scale), (vals, scale)], 2)
    l0, l1 = res["lines"]
    assert len(l0["points"]) == len(vals) - 1
    assert l1["points"][0][1] == 0.0 and l1["points"][1][1] == vals[0] * scale
    assert res["range"]["xMax"] == pytest.approx((len(vals) + 4 - 6) / 100)
    assert res["range"]["yMax"] == 16.0
    neg = tank.build_waveforms([(vals, scale), (vals, scale)], -1)
    # 원본: i=0, delay<0 → Params(j+4+delay) (오른쪽으로 |delay| 이동, 앞쪽 0)
    assert neg["lines"][0]["points"][0][1] == vals[0] * scale
    assert neg["lines"][1]["points"][0][1] == vals[1] * scale
    with pytest.raises(tank.TankInputError):
        tank.parse_waveform("a b")


def test_waveform_xlsx_and_filename():
    import zipfile

    data = tank.waveform_xlsx([(5, "3.5", ([1.0, 2.0], 2.0)), (6, "4", None)])
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert "[Content_Types].xml" in z.namelist()
        sheet = z.read("xl/worksheets/sheet1.xml").decode()
    assert '<c r="A1" t="inlineStr"><is><t>5 @3.5cm</t></is></c>' in sheet
    assert '<c r="A3"><v>4.0</v></c>' in sheet
    assert tank._col_name(27) == "AA"
    assert tank.excel_filename(r"C:\x\..\a.xls") == "a.xlsx"
    assert tank.excel_filename("") == "waveform.xlsx"


def test_detail_grid_where():
    cur = FakeCursor({"trtp_measurement": (["resId"], [(1,)])})
    assert tank.detail_grid(cur, [1, 2], False)["rows"] == [[1]]
    assert cur.executed[-1] == ("SELECT * FROM trtp_measurement WHERE resId = ? OR resId = ?", [1, 2])
    tank.detail_grid(cur, [1], True)
    assert cur.executed[-1] == ("SELECT * FROM trtp_measurement", [])


# ---------------------------------------------------------------- 라우트

@pytest.fixture()
def client(monkeypatch):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.secret_key = Config.SECRET_KEY
    app.register_blueprint(route.interrogator_tank_bp)
    monkeypatch.setattr(Config, "ALLOWED_USERS", [])
    monkeypatch.setenv("DATABASE_NAME", "BizDb")
    from utils import decorators

    monkeypatch.setattr(decorators.db_manager, "get_connection", lambda name: object())
    c = app.test_client()
    c.set_cookie("auth_token", jwt.encode({"username": "tester", "exp": 4102444800}, Config.SECRET_KEY, algorithm="HS256"))
    return c


def _fake(monkeypatch, answers=None):
    conn = FakeConn(FakeCursor(answers or {}))
    monkeypatch.setattr(route, "open_raw_connection", lambda sql_obj: conn)
    return conn


BASE = "/api/interrogator/tank"


def test_requires_auth():
    app = Flask(__name__)
    app.register_blueprint(route.interrogator_tank_bp)
    assert app.test_client().get(f"{BASE}/sw-versions?database=BizDb&probeId=1").status_code == 401


def test_sw_versions(client, monkeypatch):
    conn = _fake(monkeypatch, {"meas_station_setup": (["v"], [("1.0",), ("2.0",)])})
    res = client.get(f"{BASE}/sw-versions?database=BizDb&probeId=5")
    assert res.status_code == 200 and res.get_json()["data"] == ["1.0", "2.0"]
    assert conn.closed and not conn.committed


def test_records_runs_proc_then_lists_same_connection(client, monkeypatch):
    conn = _fake(monkeypatch, {"SELECT zmin": (["zmin"], [(0.5,)])})
    body = {"probeId": 3, "rtpName": "R1", "swVersions": ["a", "b"], "zloc": "ztsii31Cm"}
    assert client.post(f"{BASE}/records?database=BizDb", json=body).status_code == 400
    res = client.post(f"{BASE}/records?database=BizDb", json={**body, "confirm": True})
    assert res.status_code == 200, res.get_json()
    first = conn.cur.executed[0]
    assert "EXEC pre_RTP_tank ?, ?, ?" in first[0] and first[1] == [3, "R1", "a;b"]
    assert conn.committed and conn.closed
    assert list(res.get_json()["data"]["grids"]["MIF"]) == ["columns", "rows", "truncated"]


def test_graphs_route_and_validation(client, monkeypatch):
    _fake(monkeypatch, {"SELECT XMin": (["XMin", "XMax", "YMin", "YMax"], [(0, 1, 0, 1)]),
                        "SELECT DataPointX": (["DataPointX", "DataPointY"], [(0, 1)])})
    res = client.post(f"{BASE}/graphs?database=BizDb",
                      json={"graphs": ["Lateral", "MIF"], "resIds": [1], "zloc": "ztsii31Cm", "zmin": 0.5})
    assert res.status_code == 200 and len(res.get_json()["data"]) == 2
    bad = client.post(f"{BASE}/graphs?database=BizDb", json={"graphs": ["X"], "resIds": [1], "zloc": "ztsii31Cm"})
    assert bad.status_code == 400


def test_save_edit_commits(client, monkeypatch):
    conn = _fake(monkeypatch)
    res = client.post(f"{BASE}/save-edit?database=BizDb", json={"graph": "Z", "bookmark": 4, "x": 1, "y": 2})
    assert res.status_code == 200 and conn.committed


def test_voltage_grid_insert_requires_value(client, monkeypatch):
    conn = _fake(monkeypatch)
    res = client.post(f"{BASE}/voltage-grid?database=BizDb",
                      json={"probeId": 1, "pulseType": "B", "voltageString": "", "confirm": True})
    assert res.status_code == 400 and "befor save" in res.get_json()["message"]
    assert not conn.committed


def test_waveform_xlsx_download(client, monkeypatch):
    _fake(monkeypatch, {"SELECT waveform": (["waveform"], [("a b c 1V 1 2 3",)])})
    res = client.post(f"{BASE}/waveform-xlsx?database=BizDb",
                      json={"cases": [{"resId": 1, "z": "3.5"}], "excelFile": "out"})
    assert res.status_code == 200
    assert "out.xlsx" in res.headers["Content-Disposition"]
    miss = client.post(f"{BASE}/waveform-xlsx?database=BizDb", json={"cases": [{"resId": 1, "z": "3"}]})
    assert miss.status_code == 400
