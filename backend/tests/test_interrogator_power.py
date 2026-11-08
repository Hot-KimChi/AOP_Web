import decimal

import jwt
import pytest
from flask import Flask

from config import Config
from pkg_Interrogator import power
from routes import interrogator_power as route


class FakeCursor:
    """SQL 부분 문자열 → (columns, rows) 응답. 실행 기록을 남긴다."""

    def __init__(self, answers):
        self.answers = answers
        self.executed = []
        self.description = None
        self._rows = []
        self.rowcount = 1

    def execute(self, sql, params=()):
        self.executed.append((sql, list(params)))
        for needle, (cols, rows) in self.answers.items():
            if needle in sql:
                self.description = [(c,) for c in cols] if cols else None
                self._rows = list(rows)
                return self
        self.description = None
        self._rows = []
        return self

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchmany(self, n):
        return self._rows[:n]

    def nextset(self):
        return False


class FakeConn:
    def __init__(self, cur):
        self.cur = cur
        self.committed = False
        self.rolled_back = False
        self.closed = False
        self.timeout = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


# ---------------------------------------------------------------- 순수 함수

def test_vb_str_matches_vb_cstr():
    assert power.vb_str(None) == ""
    assert power.vb_str(3) == "3"
    assert power.vb_str(float(power.np.float32(2.6))) == "2.6"
    assert power.vb_str(2.6) == "2.6"
    assert power.vb_str(1e-05) == "1E-05"
    assert power.vb_str(True) == "True"
    assert power.vb_str(decimal.Decimal("4.50")) == "4.50"


def test_list_item_text_and_dataset_text():
    item = power.list_item({"PMpulseType": "B ", "measFmMhz": 2.5, "sysFmMhz": 2.6, "elAper": 10, "Mark": "checked"})
    assert item["text"] == "     B     2.5     2.6     10     checked"
    assert power.dataset_text(item) == "PMpulseType:  B,   measFmMhz:  2.5,   sysFmMhz:  2.6,   elAper:  10"


def test_dataset_key_uses_decimal_and_validates():
    key = power.dataset_key({"pulseType": "B", "measFm": "2.5", "sysFm": "1E-05", "elAper": "10"})
    assert key == ("B", decimal.Decimal("2.5"), decimal.Decimal("1E-05"), decimal.Decimal("10"))
    with pytest.raises(power.PowerInputError):
        power.dataset_key({"pulseType": "B", "measFm": "1;DROP", "sysFm": "1", "elAper": "1"})


def test_order_clause_allowlist():
    assert power.order_clause(["", "measfmmhz", "elAper", ""]) == " ORDER BY measFmMHz, elAper"
    assert power.order_clause(["", "", "", ""]) == ""
    with pytest.raises(power.PowerInputError):
        power.order_clause(["PowerId; DROP TABLE x"])


def test_sw_version_param_limits_three():
    assert power.sw_version_param([" a ", "b"]) == "a;b"
    with pytest.raises(power.PowerInputError):
        power.sw_version_param(["a", "b", "c", "d"])


def test_check_power_data_no_dip():
    dip, out = power.check_power_data([(1, 1.0, 1.0), (2, 2.0, 2.0), (3, 3.0, 3.0)])
    assert dip == 0
    assert [o[0] for o in out] == [0.0, 1.0, 0, 0]


def test_check_power_data_middle_dip_keeps_original_formula():
    rows = [(1, 1.0, 1.0), (2, 2.0, 0.5), (3, 3.0, 3.0), (4, 4.0, 4.0)]
    dip, out = power.check_power_data(rows)
    assert dip == 3  # 원본 식은 보정값이 다음 비교에 연쇄 반영된다
    expected = (2.0 ** 2 - 1.0) ** 2 / (3.0 ** 2 - 1.0 ** 2) * (3.0 - 1.0) + 1.0
    assert out[2][2] == pytest.approx(expected)
    assert out[2][0] == 2


def test_check_power_data_last_point_dip():
    dip, out = power.check_power_data([(1, 1.0, 1.0), (2, 2.0, 2.0), (3, 3.0, 1.5)])
    assert dip == 1
    assert out[3][2] == pytest.approx((9 - 1) / (4 - 1) * (2 - 1) + 1)


def test_check_power_data_out_of_range_is_unfixable():
    dip, _ = power.check_power_data([(1, 1.0, 5.0), (2, 2.0, 4.0), (3, 3.0, 3.0)])
    assert dip >= 1000
    with pytest.raises(power.PowerInputError):
        power.check_power_data([(1, 1.0, 1.0)])


def test_auto_save_plan_single_precision():
    out = [[0, 0, 0], [0, 1.0, 1.0], [2, 2.0, 1.5]]
    plan = power.auto_save_plan(out, {2: 0.5})
    assert plan == [{"powerId": 2, "powerData": 1.5, "ratio": 3.0}]


def test_auto_save_updates_both_tables():
    cur = FakeCursor({"TxGain = pulseVoltageVolt": (["powerId", "TxGain", "PowerData"],
                                                      [(1, 1.0, 1.0), (2, 2.0, 0.5), (3, 3.0, 3.0), (4, 4.0, 4.0)])})
    key = ("B", decimal.Decimal("1"), decimal.Decimal("1"), decimal.Decimal("1"))
    res = power.auto_save(cur, key)
    assert res == {"dip": 3, "updated": 4}
    updates = [e for e in cur.executed if e[0].startswith("UPDATE")]
    assert updates[0][0].startswith("UPDATE trtp_power SET PowerData = ?")
    assert updates[1][0].startswith("UPDATE ws_power SET PowerData = PowerData * ?")
    assert updates[1][1] == [1.0, 1]


def test_get_records_runs_procedure_variant():
    cur = FakeCursor({
        "SELECT DISTINCT PMpulseType": (["PMpulseType", "measFmMhz", "sysFmMhz", "elAper", "Mark"],
                                        [("B", 2.5, 2.6, 10, "unchecked")]),
        "SELECT * FROM trtp_power": (["PowerId", "PowerData"], [(1, 0.5)]),
    })
    res = power.get_records(cur, 7, "")
    assert cur.executed[0] == ("EXEC pre_RTP_power ?", [7])
    assert res["items"][0]["mark"] == "unchecked"
    assert res["grid"] == {"columns": ["PowerId", "PowerData"], "rows": [[1, 0.5]], "truncated": False}
    power.get_records(cur, 7, "a;b")
    assert ("EXEC pre_RTP_Power1 ?, ?", [7, "a;b"]) in cur.executed


# ---------------------------------------------------------------- 라우트

@pytest.fixture()
def client(monkeypatch):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.secret_key = Config.SECRET_KEY
    app.register_blueprint(route.interrogator_power_bp)
    monkeypatch.setattr(Config, "ALLOWED_USERS", [])
    monkeypatch.setenv("DATABASE_NAME", "BizDb")
    from utils import decorators

    monkeypatch.setattr(decorators.db_manager, "get_connection", lambda name: object())
    c = app.test_client()
    c.set_cookie("auth_token", jwt.encode({"username": "tester"}, Config.SECRET_KEY, algorithm="HS256"))
    return c


def _fake(monkeypatch, answers=None):
    conn = FakeConn(FakeCursor(answers or {}))
    monkeypatch.setattr(route, "open_raw_connection", lambda sql_obj: conn)
    return conn


DS = {"pulseType": "B", "measFm": "2.5", "sysFm": "2.6", "elAper": "10"}


def test_requires_auth():
    app = Flask(__name__)
    app.register_blueprint(route.interrogator_power_bp)
    assert app.test_client().get("/api/interrogator/power/sw-versions?database=BizDb&probeId=1").status_code == 401


def test_rejects_non_business_db(client):
    assert client.get("/api/interrogator/power/sw-versions?database=Other&probeId=1").status_code == 400


def test_sw_versions(client, monkeypatch):
    conn = _fake(monkeypatch, {"power_station_setup": (["imagSwVersion"], [("1.0",), ("2.0",)])})
    res = client.get("/api/interrogator/power/sw-versions?database=BizDb&probeId=5")
    assert res.status_code == 200
    assert res.get_json()["data"] == ["1.0", "2.0"]
    assert conn.closed


def test_write_routes_require_confirm(client, monkeypatch):
    _fake(monkeypatch)
    base = "/api/interrogator/power"
    assert client.post(base + "/mark", json={"database": "BizDb", "dataset": DS, "mark": "checked"}).status_code == 400
    assert client.post(base + "/mark-all", json={"database": "BizDb"}).status_code == 400
    assert client.post(base + "/point", json={"database": "BizDb", "powerId": 1, "x": 1, "y": 2}).status_code == 400
    assert client.post(base + "/auto-save", json={"database": "BizDb", "dataset": DS}).status_code == 400


def test_mark_commits(client, monkeypatch):
    conn = _fake(monkeypatch)
    res = client.post("/api/interrogator/power/mark",
                      json={"database": "BizDb", "dataset": DS, "mark": "checked", "confirm": True})
    assert res.status_code == 200
    assert conn.committed and conn.closed
    sql, params = conn.cur.executed[0]
    assert sql.startswith("UPDATE trtp_power SET mark = ?")
    assert params[0] == "checked" and params[2] == decimal.Decimal("2.5")


def test_bad_order_rejected(client, monkeypatch):
    _fake(monkeypatch)
    res = client.post("/api/interrogator/power/items", json={"database": "BizDb", "orders": ["x;drop"]})
    assert res.status_code == 400


def test_point_save_single_rounding(client, monkeypatch):
    conn = _fake(monkeypatch)
    res = client.post("/api/interrogator/power/point",
                      json={"database": "BizDb", "powerId": 3, "x": 1.123456789, "y": 2, "confirm": True})
    assert res.status_code == 200
    assert conn.cur.executed[0][1] == [1.123457, 2.0, 3]
