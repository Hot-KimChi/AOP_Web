import datetime as dt

import jwt
import pytest
from flask import Flask

from config import Config
from pkg_Interrogator import export
from routes import interrogator_export as route
from tests.test_interrogator_power import FakeConn, FakeCursor


def test_vb_timestamp_12h_lowercase():
    assert export.vb_timestamp(dt.datetime(2026, 11, 8, 21, 6, 57)) == "11.08.2026_09.06.57.pm"
    assert export.vb_timestamp(dt.datetime(2026, 1, 2, 0, 5, 1)) == "01.02.2026_12.05.01.am"


def test_csv_text_crlf_no_quotes():
    text = export.csv_text(["a", "b", "c"], [[1, None, 1e-05], ["x,y", True, 2.5]])
    assert text == "a,b,c\r\n1,,1E-05\r\nx,y,True,2.5\r\n"


def test_export_columns_excludes():
    assert export.export_columns(["probeId", "rtpName", "limitId", "Comments", "v"], "Limits") == ["probeId", "v"]
    assert export.export_columns(["a", "problemReport"], "RTP_LUT") == ["a"]


def test_temp_prb_where():
    assert export.temp_prb_where([]) == ("tempPrbLUTId = -1", [])
    assert export.temp_prb_where([3, 4]) == ("tempPrbLUTId = ? OR tempPrbLUTId = ?", [3, 4])


def _answers():
    return {
        "Probe_info": (["isWobbler"], [(0,)]),
        "COUNT(*) FROM dbo.RTP_LUT": ([""], [(2,)]),
        "FROM dbo.RTP_LUT WHERE probeId = ? AND RTPName": (["rtpId", "problemReport", "FmMHz"],
                                                           [(1, 1, 2.5), (2, 0, 3.0)]),
        "dbo.prbTypeList": (["typesId", "Comments"], [(1, None)]),
        "dbo.Limits": (["probeId", "rtpName", "limitId", "Comments", "maxV"], [(7, "r", 1, None, 90.0)]),
        "dbo.TempPrb_LUT": (["tempPrbLUTId", "probeId", "Comments", "createPerson", "createDate"],
                            [(11, 7, None, "me", None)]),
        "dbo.TempPulse_LUT": (["tempPulseId", "probeId", "Comments"], [(5, 7, None)]),
        "dbo.TempPrbVolt_LUT": (["tempPrbLUTId", "elevIndex", "Comments"], [(11, 0, None)]),
    }


def test_get_records_grids_and_report():
    cur = FakeCursor(_answers())
    res = export.get_records(cur, 7, "RTP1")
    assert res["rtpReport"] == 1
    assert res["tables"]["RTP_LUT"]["columns"] == ["rtpId", "problemReport", "FmMHz"]
    assert res["tables"]["RTP_LUT"]["count"] == 2
    volt = [e for e in cur.executed if "TempPrbVolt_LUT" in e[0]][0]
    assert "tempPrbLUTId = ?" in volt[0] and volt[1] == [11]


def test_build_csv_files_order_and_names():
    cur = FakeCursor(_answers())
    files = export.build_csv_files(cur, 7, "RTP1", now=dt.datetime(2026, 11, 8, 21, 6, 57))
    names = [f["fileName"] for f in files]
    assert names[0] == "11.08.2026_09.06.57.pm_7.RTP1_RTP_LUT.csv"
    assert [n.split("RTP1_")[1] for n in names] == [f"{n}.csv" for n in export.CSV_ORDER]
    limits = files[2]["content"]
    assert limits == "probeId,maxV\r\n7,90\r\n"
    assert files[0]["content"].startswith("rtpId,FmMHz\r\n1,2.5\r\n")


@pytest.fixture()
def client(monkeypatch):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(route.interrogator_export_bp)
    monkeypatch.setattr(Config, "ALLOWED_USERS", [])
    monkeypatch.setenv("DATABASE_NAME", "BizDb")
    from utils import decorators

    monkeypatch.setattr(decorators.db_manager, "get_connection", lambda name: object())
    c = app.test_client()
    c.set_cookie("auth_token", jwt.encode({"username": "tester", "exp": 4102444800}, Config.SECRET_KEY, algorithm="HS256"))
    return c


def _fake(monkeypatch):
    conn = FakeConn(FakeCursor(_answers()))
    monkeypatch.setattr(route, "open_raw_connection", lambda sql_obj: conn)
    return conn


def test_requires_auth():
    app = Flask(__name__)
    app.register_blueprint(route.interrogator_export_bp)
    assert app.test_client().get("/api/interrogator/export/probes?database=BizDb").status_code == 401


def test_records_route(client, monkeypatch):
    conn = _fake(monkeypatch)
    res = client.get("/api/interrogator/export/records?database=BizDb&probeId=7&rtpName=RTP1")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["tables"]["Limits"]["columns"][:2] == ["probeId", "rtpName"]
    assert conn.closed and not conn.committed


def test_duplicate_requires_confirm_and_commits(client, monkeypatch):
    conn = _fake(monkeypatch)
    url = "/api/interrogator/export/duplicate"
    assert client.post(url, json={"database": "BizDb", "probeId": 7, "rtpName": "R"}).status_code == 400
    res = client.post(url, json={"database": "BizDb", "probeId": 7, "rtpName": "R", "confirm": True})
    assert res.status_code == 200
    assert ("EXEC dbo.rtp_M_duplicate ?, ?", [7, "R"]) in conn.cur.executed
    assert conn.committed and conn.timeout == 0


def test_rejects_bad_input(client, monkeypatch):
    _fake(monkeypatch)
    assert client.get("/api/interrogator/export/rtp-names?database=BizDb&probeId=x").status_code == 400
    assert client.get("/api/interrogator/export/probes?database=Mlflow").status_code == 400
    res = client.post("/api/interrogator/export/convert", json={"database": "BizDb", "probeId": 7, "rtpName": "R" * 101})
    assert res.status_code == 400
