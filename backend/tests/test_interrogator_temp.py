import math

import jwt
import numpy as np
import pytest

from app import create_app
from config import Config
from pkg_Interrogator import temp_analysis as ta
from routes import interrogator_temp as rt


# ─── 순수 함수 ───────────────────────────────────────────────────────────────


def test_vb_str_matches_vb_format():
    assert ta.vb_str(1.5) == " 1.5"
    assert ta.vb_str(-0.5) == "-.5"
    assert ta.vb_str(0.5) == " .5"
    assert ta.vb_str(0) == " 0"


def test_vb_cshort_bankers_rounding():
    assert ta.vb_cshort(2.5) == 2
    assert ta.vb_cshort(3.5) == 4


def test_lst_item_roundtrip_and_edit_menu():
    item = ta.lst_item([12, 4, 0, "B", 2.0, 1.25, "checked"])
    p = ta.parse_item(item)
    assert p[1:] == ["12", "4", "0", "B", "2", "1.25", "checked"]
    menu = ta.edit_menu_text(item)
    assert menu == "TempId:  12,   mSetNum:  4,   PulseT:  B,   Fm/Volt:  2,   AzAperS:  1.25,   ElevIndex:  0"
    assert ta.parse_edit_menu(menu) == {"tempId": "12", "mSetNum": "4", "pulseT": "B", "fmVolt": "2",
                                        "azAperS": "1.25", "elevIndex": "0"}


def test_array_interp_inside_bracket_is_linear():
    out = ta.array_interp([1.0, 2.0, 3.0], [10.0, 20.0, 30.0], [0.5, 1.5, 2.5, 3.5])
    assert out == pytest.approx([5.0, 15.0, 25.0, 30.0])


def test_array_interp_skipping_two_brackets_stays_zero():
    out = ta.array_interp([1.0, 2.0, 3.0, 4.0], [10.0, 20.0, 30.0, 40.0], [1.5, 3.5, 3.6, 4.5])
    assert out[1] == 0.0
    assert out[0] == pytest.approx(15.0)


def test_expand_range_twenty_percent():
    assert ta.expand_range(10.0, 20.0) == pytest.approx((8.0, 24.0))


def test_temp10_rise_arrays_appends_origin():
    t, y = ta.temp10_rise_arrays([(600.0, 30.0), (300.0, 28.0)], 25.0)
    assert t[-1] == 0 and y[-1] == 0
    assert y[0] == pytest.approx(5.0)


def test_temp30_subtracts_room_drift():
    c = [100.0, 1700.0, 19.0, 19.0, 0.8, 0.1]
    assert ta.temp30(c, 20.0, 21.0) == pytest.approx(ta.temp10_value(c, 1800.0) - 1.0)


def test_parse_pwr_matrix_requires_64():
    with pytest.raises(rt.FitInputError):
        ta.parse_pwr_matrix(["1 2 3"])


def test_tr_spectrum_end_to_end():
    rng = np.random.default_rng(1)
    matrix = rng.random((64, 64)) + np.eye(64) * 5
    truth = rng.random(64)
    rows = [" ".join(str(v) for v in r) for r in matrix]
    parsed = ta.parse_pwr_matrix(rows)
    sol = rt.solve_tr_spectrum(parsed, list(matrix @ truth))
    assert np.allclose(sol["probeSpectrum"], truth, atol=1e-6)


def test_fit_wobbler_recovers_synthetic():
    x = [0.2, 2.0, 60.0, 0.1, 0.005, 3.0]
    area, vol, ang = [], [], []
    for a in (0.5, 1.0, 2.0):
        for g in (0.0, 30.0, 60.0):
            for v in (5.0, 10.0, 20.0, 40.0):
                area.append(a), vol.append(v), ang.append(g)
    y = [ta.wobbler_model(x, v, g, a) for a, v, g in zip(area, vol, ang)]
    res = ta.fit_wobbler(area, vol, ang, y)
    pred = [ta.wobbler_model(res.coefficients, v, g, a) for a, v, g in zip(area, vol, ang)]
    assert np.allclose(pred, y, rtol=1e-2, atol=1e-3)
    assert all(math.isfinite(c) for c in res.coefficients)


# ─── 라우트 ──────────────────────────────────────────────────────────────────


class FakeCursor:
    """SQL 부분 문자열 → (columns, rows) 응답표. 실행된 SQL/파라미터를 기록한다."""

    def __init__(self, table):
        self.table = table
        self.log = []
        self.description = None
        self._rows = []

    def execute(self, sql, params=()):
        self.log.append((sql, list(params)))
        for key, (cols, rows) in self.table.items():
            if key in sql:
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
        self.committed = False
        self.rolled = False
        self.timeout = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled = True

    def close(self):
        pass


@pytest.fixture()
def app(monkeypatch):
    application = create_app()
    if "interrogator_temp" not in application.blueprints:
        application.register_blueprint(rt.interrogator_temp_bp)
    application.config["TESTING"] = True
    return application


@pytest.fixture()
def client(app, monkeypatch):
    monkeypatch.setattr(Config, "ALLOWED_USERS", [])
    monkeypatch.setenv("DATABASE_NAME", "BizDb")
    from utils import decorators

    monkeypatch.setattr(decorators.db_manager, "get_connection", lambda name: object())
    c = app.test_client()
    c.set_cookie("auth_token", jwt.encode({"username": "tester"}, Config.SECRET_KEY, algorithm="HS256"))
    return c


def _use(monkeypatch, table):
    cur = FakeCursor(table)
    conn = FakeConn(cur)
    monkeypatch.setattr(rt, "open_raw_connection", lambda db: conn)
    return cur, conn


@pytest.mark.parametrize("path", ["/load", "/records", "/plot", "/aper-run", "/t10/convert", "/wob/run"])
def test_requires_auth(app, path):
    assert app.test_client().post(f"/api/interrogator/temp{path}", json={}).status_code == 401


@pytest.mark.parametrize("path", ["/focus", "/records", "/mark-all", "/aper-run", "/tr-spec", "/t10/probe",
                                  "/t10/convert", "/t10/save30", "/wob/records", "/wob/run", "/wob/save-edit"])
def test_writes_require_confirm(client, monkeypatch, path):
    _use(monkeypatch, {})
    res = client.post(f"/api/interrogator/temp{path}", json={"database": "BizDb", "probeId": 1})
    assert res.status_code == 400


def test_records_limit_three_versions(client, monkeypatch):
    _use(monkeypatch, {})
    res = client.post("/api/interrogator/temp/records", json={"database": "BizDb", "probeId": 1, "confirm": True,
                                                              "swVersions": ["a", "b", "c", "d"]})
    assert res.status_code == 400
    assert "maximum of three" in res.get_json()["message"]


def test_load_returns_grid_in_select_order(client, monkeypatch):
    cols = ["tempId", "FmMHz", "pulseVoltage"]
    cur, _ = _use(monkeypatch, {
        "imagSwVersion": (["imagSwVersion"], [("1.0",), ("2.0",)]),
        "FROM trtp_temp WHERE isDataUsable": (cols, [(1, 2.5, 30.0)]),
    })
    res = client.post("/api/interrogator/temp/load", json={"database": "BizDb", "probeId": 7})
    data = res.get_json()["data"]
    assert data["swVersions"] == [" ", "1.0", "2.0"]
    assert data["grid"]["columns"] == cols
    assert cur.log[0][1] == [7]


def test_get_records_uses_pre_rtp_temp1_with_versions(client, monkeypatch):
    item_cols = ["mtempId", "measSetNum", "elevIndex", "PMpulseType", "FmMHz", "mazAperSizeCm", "mark"]
    cur, conn = _use(monkeypatch, {
        "WHERE measSetNum = 1 ": (item_cols, [(5, 1, 0, "B", 3.0, 1.2, "checked")]),
    })
    res = client.post("/api/interrogator/temp/records", json={"database": "BizDb", "probeId": 3, "confirm": True,
                                                              "swVersions": [" ", "v1", "v2"]})
    assert res.status_code == 200
    assert cur.log[0] == ("EXEC pre_RTP_temp1 ?, ?", [3, "v1;v2"])
    assert res.get_json()["data"]["items"][0].split("\t")[1] == "5"
    assert all("isDataUsable = 'Yes' GROUP" not in s for s, _ in cur.log)
    assert conn.committed


def test_mark_toggles_and_binds_params(client, monkeypatch):
    cur, _ = _use(monkeypatch, {})
    item = ta.lst_item([9, 4, 1, "B", 40.0, 1.2, "checked"])
    res = client.post("/api/interrogator/temp/mark", json={"database": "BizDb", "confirm": True, "item": item})
    data = res.get_json()["data"]
    assert data["item"].endswith("\tunchecked")
    sql, params = cur.log[0]
    assert "pulseVoltage" in sql and params[:3] == ["unchecked", 9, 4]


def test_aper_run_inserts_1d_coeff(client, monkeypatch):
    az = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]
    truth = [0.5, 0.3, 2.0]
    y = list(rt.fit_aperture_1d.__globals__["aperture_model_1d"](truth, np.array(az)))
    rows = [(None, 3.0, yy, a, 0.5, 1.0) for a, yy in zip(az, y)]
    cur, conn = _use(monkeypatch, {
        "SELECT DISTINCT elevIndex FROM": (["elevIndex"], [(0,)]),
        "SELECT DISTINCT elevIndex, PMpulseType": (["elevIndex", "PMpulseType", "FmMHz", "pulseBandWidthMHz",
                                                    "pulseVoltage"], [(0, "B", 3.0, 1.0, 30.0)]),
        "FROM temp_coeff": (["tempCoeffId"], []),
        "FROM Probe_info": (["azPitchCm", "elPitchCm", "elPitch1Cm", "azNumElements", "elNumElements"],
                            [(0.03, 0.1, 0.1, 128, 1)]),
        "SELECT measDate": (["measDate", "FmMHz", "tempData", "azAperSizeCm", "elAperSizeCm", "normCoeff"], rows),
    })
    res = client.post("/api/interrogator/temp/aper-run", json={"database": "BizDb", "probeId": 2, "confirm": True,
                                                               "material": "A"})
    data = res.get_json()["data"]
    assert data["messages"][0].startswith("x1(0) = ")
    assert data["plotEnabled"] is True and data["aperRunEnabled"] is False
    ins = [p for s, p in cur.log if s.startswith("INSERT INTO dbo.temp_coeff")]
    assert ins and ins[0][0] == 2 and ins[0][-2:] == ["A", 0]
    assert conn.committed


def test_aper_run_skips_existing_coeff(client, monkeypatch):
    cur, _ = _use(monkeypatch, {
        "SELECT DISTINCT elevIndex FROM": (["elevIndex"], [(0,)]),
        "SELECT DISTINCT elevIndex, PMpulseType": (["elevIndex"], [(0,)]),
        "FROM temp_coeff": (["tempCoeffId"], [(11,)]),
    })
    res = client.post("/api/interrogator/temp/aper-run", json={"database": "BizDb", "probeId": 2, "confirm": True})
    assert res.get_json()["data"]["messages"] == ["There is a record set of temp coeff in db."]
    assert not any(s.startswith("INSERT") for s, _ in cur.log)


def test_t10_convert_requires_material(client, monkeypatch):
    _use(monkeypatch, {})
    res = client.post("/api/interrogator/temp/t10/convert", json={"database": "BizDb", "probeId": 1, "tempSSId": 2,
                                                                  "tempSetId": 3, "confirm": True, "material": ""})
    assert res.get_json()["data"]["messages"] == ["Please select material Air or Tmm!"]


def test_t10_convert_fits_and_inserts(client, monkeypatch):
    c = [300.0, 1700.0, 19.0, 19.0, 0.8, 0.1]
    ts = list(range(600, 0, -30))
    rows = [(float(t), 25.0 + ta.temp10_value(c, t)) for t in ts]
    cur, _ = _use(monkeypatch, {
        "timeElapsedS = 0": (["temperatureC", "tempId"], [(25.0, 1)]),
        "order by timeElapsedS desc": (["timeElapsedS", "temperatureC"], rows),
        "Select * from dbo.temp10_fit_coeff": (["temp10FitId"], []),
    })
    res = client.post("/api/interrogator/temp/t10/convert", json={"database": "BizDb", "probeId": 1, "tempSSId": 2,
                                                                  "tempSetId": 3, "confirm": True, "material": "A"})
    data = res.get_json()["data"]
    assert data["ok"] and data["inserted"]
    ins = [p for s, p in cur.log if s.startswith("INSERT INTO dbo.temp10_fit_coeff")][0]
    assert ins[:3] == [1, 3, 2]


def test_t10_multi_rows_concatenates_in_order(client, monkeypatch):
    cur, _ = _use(monkeypatch, {"temperature10mins": (["temp10Id", "tempSetId"], [(1, 0)])})
    res = client.post("/api/interrogator/temp/t10/multi-rows", json={"database": "BizDb", "tempSSId": 5,
                                                                     "tempSetIds": [8, 9]})
    data = res.get_json()["data"]["grid"]
    assert data["columns"] == ["temp10Id", "tempSetId"] and len(data["rows"]) == 2
    assert [p for _, p in cur.log] == [[5, 8], [5, 9]]


def test_wobbler_run_existing(client, monkeypatch):
    _use(monkeypatch, {"FROM temp_wobbler_coeff": (["tempWobbCoeffId"], [(3,)])})
    res = client.post("/api/interrogator/temp/wob/run", json={"database": "BizDb", "probeId": 1, "confirm": True})
    assert res.get_json()["data"]["messages"] == ["There is a record set of temp wobbler coeff in database."]


def test_plot_rejects_unknown_graph(client, monkeypatch):
    _use(monkeypatch, {})
    res = client.post("/api/interrogator/temp/plot", json={"database": "BizDb", "probeId": 1, "graph": "X"})
    assert res.status_code == 400


def test_nonlinear_error_without_lut(client, monkeypatch):
    _use(monkeypatch, {})
    res = client.post("/api/interrogator/temp/nonlinear-error", json={"database": "BizDb", "probeId": 1})
    assert res.get_json()["data"]["messages"] == ["No records of nonlinear data!"]


def test_drain_propagates_nextset_error():
    from routes.interrogator_temp import _drain

    class Cur:
        def nextset(self):
            raise RuntimeError("proc failed")

    with pytest.raises(RuntimeError, match="proc failed"):
        _drain(Cur())
