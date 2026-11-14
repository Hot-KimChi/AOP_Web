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
    token = jwt.encode({"username": "tester", "exp": 4102444800}, Config.SECRET_KEY, algorithm="HS256")
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

# ── 로그인 시간 만료 없음(AUTH_EXPIRE_TIME=0) ──────────────────────────
def test_credential_store_no_expiry_and_lru_cap(monkeypatch):
    from config import Config
    from utils import credential_store as cs

    monkeypatch.setattr(Config, "EXPIRE_TIME", 0)
    monkeypatch.setattr(cs, "_store", cs.OrderedDict())
    clock = [1000.0]
    monkeypatch.setattr(cs.time, "monotonic", lambda: clock[0])

    tok = cs.store_credentials("u1", "p1")
    clock[0] += 10 * 365 * 24 * 3600  # 10년 경과
    assert cs.resolve(tok) == ("u1", "p1")

    # 상한 초과 시 가장 오래 사용하지 않은 항목부터 제거
    monkeypatch.setattr(cs, "MAX_ENTRIES", 2)
    a = cs.store_credentials("a", "x")
    cs.resolve(tok)  # tok 을 최근 사용으로 갱신
    cs.store_credentials("b", "y")
    assert cs.resolve(a) == (None, None)
    assert cs.resolve(tok) == ("u1", "p1")


def test_credential_store_positive_ttl_still_expires(monkeypatch):
    from config import Config
    from utils import credential_store as cs

    monkeypatch.setattr(Config, "EXPIRE_TIME", 60)
    monkeypatch.setattr(cs, "_store", cs.OrderedDict())
    clock = [0.0]
    monkeypatch.setattr(cs.time, "monotonic", lambda: clock[0])
    tok = cs.store_credentials("u", "p")
    clock[0] += 61
    assert cs.resolve(tok) == (None, None)


def test_jwt_bound_to_session_is_revoked_on_logout(monkeypatch):
    """exp 없는 JWT 도 로그아웃(세션 폐기) 후에는 재사용할 수 없어야 한다."""
    from utils import credential_store as cs

    monkeypatch.setattr(Config, "EXPIRE_TIME", 0)
    monkeypatch.setattr(Config, "ALLOWED_USERS", [])
    monkeypatch.setattr(cs, "_store", cs.OrderedDict())
    app = create_app()
    app.config["TESTING"] = True
    assert app.config["PERMANENT_SESSION_LIFETIME"].days >= 3650  # 숨은 31일 만료 없음

    c = app.test_client()
    cred = cs.store_credentials("tester", "pw")
    with c.session_transaction() as s:
        s[cs.CREDENTIAL_TOKEN_KEY] = cred
    token = jwt.encode({"username": "tester", cs.JWT_BINDING_CLAIM: cs._digest(cred)},
                       Config.SECRET_KEY, algorithm="HS256")
    c.set_cookie("auth_token", token)

    st = c.get("/api/auth/status").get_json()
    assert st["authenticated"] is True and st["has_credentials"] is True
    assert c.get("/api/get_list_database").status_code == 200

    # 다른 세션 토큰에 묶인 JWT 는 거부
    other = app.test_client()
    other.set_cookie("auth_token", token)
    assert other.get("/api/get_list_database").status_code == 401

    # 로그아웃 후 같은 JWT 재사용 → 거부
    assert c.post("/api/auth/logout").status_code == 200
    c.set_cookie("auth_token", token)
    assert c.get("/api/get_list_database").status_code == 401
    assert c.get("/api/auth/status").get_json()["authenticated"] is False


def test_token_without_cid_and_exp_is_rejected(anon):
    """폐기 수단이 없는 영구 토큰(cid·exp 모두 없음)은 거부한다."""
    anon.set_cookie("auth_token", jwt.encode({"username": "tester"}, Config.SECRET_KEY, algorithm="HS256"))
    assert anon.get("/api/get_list_database").status_code == 401
    assert anon.get("/api/auth/status").get_json()["authenticated"] is False
