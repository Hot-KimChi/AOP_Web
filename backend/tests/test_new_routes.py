import jwt
import pytest

from app import create_app
from config import Config


@pytest.fixture()
def client(monkeypatch):
    app = create_app()
    app.config["TESTING"] = True
    monkeypatch.setattr(Config, "ALLOWED_USERS", [])
    monkeypatch.setenv("DATABASE_NAME", "BizDb")
    from utils import decorators

    monkeypatch.setattr(decorators.db_manager, "get_connection", lambda name: object())
    c = app.test_client()
    token = jwt.encode({"username": "tester"}, Config.SECRET_KEY, algorithm="HS256")
    c.set_cookie("auth_token", token)
    return c


@pytest.fixture()
def anon(monkeypatch):
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


@pytest.mark.parametrize("method,url", [
    ("get", "/api/msi/probes?database=BizDb"),
    ("post", "/api/msi/preview"),
    ("post", "/api/msi/create"),
    ("get", "/api/interrogator/probes?database=BizDb"),
    ("post", "/api/interrogator/rtp-generate"),
    ("post", "/api/interrogator/temp10/save"),
    ("post", "/api/interrogator/fit/aperture"),
    ("post", "/api/interrogator/fit/tr-spectrum"),
    ("get", "/api/msi/probe-ids?database=BizDb"),
    ("get", "/api/msi/dump-records?database=BizDb&probeId=1"),
    ("get", "/api/interrogator/rtp-names-all?database=BizDb"),
    ("post", "/api/interrogator/rtp-analysis"),
])
def test_requires_auth(anon, method, url):
    assert getattr(anon, method)(url, json={}).status_code == 401


def test_rejects_non_business_database(client):
    res = client.get("/api/msi/probes?database=AOP_MLflow_Tracking")
    assert res.status_code == 400


def test_msi_create_requires_confirm(client):
    res = client.post("/api/msi/create", json={"database": "BizDb", "probeId": 1, "subVerifIds": [1],
                                               "purposeMode": "Auto Detect", "planHash": "0" * 64})
    assert res.status_code == 400
    assert "confirm" in res.get_json()["message"]


@pytest.mark.parametrize("body", [
    {"probeId": "x", "subVerifIds": [1], "purposeMode": "Auto Detect"},
    {"probeId": 1, "subVerifIds": [1], "purposeMode": "DROP"},
    {"probeId": 1, "subVerifIds": ["1"], "purposeMode": "Auto Detect"},
    {"probeId": 1, "subVerifIds": [], "purposeMode": "Auto Detect"},
])
def test_msi_preview_validates_input(client, body):
    res = client.post("/api/msi/preview", json={"database": "BizDb", **body})
    assert res.status_code == 400


def test_msi_verifications_rejects_bad_filter(client):
    res = client.get("/api/msi/verifications?database=BizDb&probeId=1&verifFilter=1;DROP")
    assert res.status_code == 400


def test_msi_dump_records_rejects_bad_filter(client):
    res = client.get("/api/msi/dump-records?database=BizDb&probeId=1&verifFilter=1;DROP")
    assert res.status_code == 400
    assert client.get("/api/msi/dump-records?database=BizDb&probeId=x").status_code == 400


@pytest.mark.parametrize("name", ["", "   ", "x" * 129, 5])
def test_rtp_analysis_rejects_bad_name(client, name):
    res = client.post("/api/interrogator/rtp-analysis", json={"database": "BizDb", "rtpName": name})
    assert res.status_code == 400


class _FakeCursor:
    description = [("b",), ("a",), ("c",)]

    def execute(self, sql, params):
        self.sql, self.params = sql, params

    def fetchmany(self, n):
        rows = [(1, "x", None), (2, "y", float("nan")), (3, "z", 1.5)]
        return rows[:n]


def test_grid_keeps_column_order_and_truncates():
    from pkg_MsiInput.store import grid

    out = grid(_FakeCursor(), "SELECT b, a, c FROM t", [], limit=2)
    assert out["columns"] == ["b", "a", "c"]
    assert out["rows"] == [[1, "x", None], [2, "y", None]]
    assert out["truncated"] is True


def test_rtp_generate_requires_confirm_and_variant(client):
    assert client.post("/api/interrogator/rtp-generate", json={"database": "BizDb", "probeId": 1}).status_code == 400
    res = client.post("/api/interrogator/rtp-generate",
                      json={"database": "BizDb", "probeId": 1, "confirm": True, "variant": "evil"})
    assert res.status_code == 400


def test_fit_endpoints(client):
    res = client.post("/api/interrogator/fit/tr-spectrum", json={"sysSpectrum": [[2, 0], [0, 4]], "trMeas": [2, 4]})
    assert res.status_code == 200
    assert res.get_json()["data"]["probeSpectrum"] == pytest.approx([1, 1])
    assert client.post("/api/interrogator/fit/tr-spectrum", json={"sysSpectrum": "x", "trMeas": [1]}).status_code == 400
    assert client.post("/api/interrogator/fit/aperture", json={"mode": "3d"}).status_code == 400
    res = client.post("/api/interrogator/fit/aperture",
                      json={"mode": "1d", "azAperCm": [0.5, 1, 2, 3], "tempRise": [1, 2, 3, 3.5], "normCoeff": [1, 1, 1, 1]})
    assert res.status_code == 200
    assert len(res.get_json()["data"]["coefficients"]) == 3


def test_measset_generation_rejects_unlisted_database(client):
    import io
    res = client.post("/api/measset-generation", data={
        "database": "master", "probeId": "1", "probeName": "P",
        "file": (io.BytesIO(b"x"), "in.csv"),
    }, content_type="multipart/form-data")
    assert res.status_code == 400


def test_tx_compare_rejects_bad_probe_id(client):
    res = client.post("/api/run_tx_compare", json={
        "database": "BizDb", "probeId": "abc", "TxSumSoftware": "a", "wcsSoftware": "b", "measSSId_MI": 1,
    })
    assert res.status_code == 400
