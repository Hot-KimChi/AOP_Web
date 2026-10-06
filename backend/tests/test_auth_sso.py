"""Windows SSO 인증 경로 타깃 테스트 (DB·SSPI 불필요).

실행: backend 디렉터리에서 `python -m unittest tests.test_auth_sso -v`
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt  # noqa: E402
from flask import Flask, g, jsonify  # noqa: E402

from config import Config  # noqa: E402
from routes.auth import auth_bp, SSO_SECRET_HEADER  # noqa: E402
from utils import auth_sessions  # noqa: E402
from utils.database_manager import db_manager  # noqa: E402
from utils.decorators import handle_exceptions, require_auth  # noqa: E402

SECRET = "s" * 40
HEADERS = {SSO_SECRET_HEADER: SECRET}


def _build_app():
    app = Flask(__name__)
    app.secret_key = "test-flask-secret"
    app.register_blueprint(auth_bp)

    @app.route("/api/protected")
    @handle_exceptions
    @require_auth
    def protected():
        return jsonify({"user": g.current_user})

    @app.route("/api/unauthenticated_db")
    @handle_exceptions
    def unauthenticated_db():
        db_manager.get_connection("AOP_Database")
        return jsonify({"status": "unexpected"})

    return app


class SsoAuthTest(unittest.TestCase):
    def setUp(self):
        self._saved = (Config.SECRET_KEY, Config.SSO_SHARED_SECRET, Config.ALLOWED_USERS, Config.COOKIE_SECURE)
        Config.SECRET_KEY = "test-jwt-secret"
        Config.SSO_SHARED_SECRET = SECRET
        Config.ALLOWED_USERS = {"corp\\alice"}
        Config.COOKIE_SECURE = False
        auth_sessions.clear()
        self.client = _build_app().test_client()

    def tearDown(self):
        Config.SECRET_KEY, Config.SSO_SHARED_SECRET, Config.ALLOWED_USERS, Config.COOKIE_SECURE = self._saved

    def _login(self, domain="CORP", name="Alice", headers=HEADERS):
        return self.client.post("/api/auth/sso", json={"domain": domain, "name": name}, headers=headers)

    def test_allowed_domain_user_gets_httponly_jwt(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["username"], "CORP\\Alice")
        cookie = res.headers.get("Set-Cookie")
        self.assertIn("auth_token=", cookie)
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Lax", cookie)

        status = self.client.get("/api/auth/status").get_json()
        self.assertTrue(status["authenticated"])
        self.assertEqual(status["username"], "CORP\\Alice")
        self.assertEqual(self.client.get("/api/protected").get_json()["user"], "CORP\\Alice")

    def test_missing_or_wrong_secret_is_rejected(self):
        self.assertEqual(self._login(headers={}).status_code, 401)
        self.assertEqual(self._login(headers={SSO_SECRET_HEADER: "x" * 40}).status_code, 401)
        self.assertIsNone(self._login(headers={}).headers.get("Set-Cookie"))

    def test_unconfigured_secret_fails_closed(self):
        Config.SSO_SHARED_SECRET = ""
        self.assertEqual(self._login(headers={SSO_SECRET_HEADER: ""}).status_code, 503)
        Config.SSO_SHARED_SECRET = "short"
        self.assertEqual(self._login(headers={SSO_SECRET_HEADER: "short"}).status_code, 503)

    def test_user_not_in_allowlist_is_forbidden(self):
        self.assertEqual(self._login(name="Mallory").status_code, 403)

    def test_empty_allowlist_denies_everyone(self):
        Config.ALLOWED_USERS = None
        self.assertEqual(self._login().status_code, 403)

    def test_invalid_account_formats_are_rejected(self):
        for domain, name in (("", "alice"), ("CORP", ""), ("CORP\\X", "alice"), ("CORP", "pc01$"), ("CORP", "a\x00b")):
            self.assertEqual(self._login(domain=domain, name=name).status_code, 400, (domain, name))

    def test_allowlist_revocation_applies_per_request(self):
        self._login()
        Config.ALLOWED_USERS = {"corp\\bob"}
        self.assertEqual(self.client.get("/api/protected").status_code, 403)
        self.assertFalse(self.client.get("/api/auth/status").get_json()["authenticated"])

    def test_legacy_sql_login_token_is_rejected(self):
        Config.ALLOWED_USERS = {"sel00001"}
        legacy = jwt.encode(
            {"username": "sel00001", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            Config.SECRET_KEY,
            algorithm="HS256",
        )
        self.client.set_cookie("auth_token", legacy)
        self.assertEqual(self.client.get("/api/protected").status_code, 403)
        self.assertFalse(self.client.get("/api/auth/status").get_json()["authenticated"])

    def test_password_login_is_gone(self):
        res = self.client.post("/api/auth/login", json={"username": "a", "password": "b"})
        self.assertEqual(res.status_code, 410)

    def test_logout_clears_cookie(self):
        self._login()
        self.client.post("/api/auth/logout")
        self.assertFalse(self.client.get("/api/auth/status").get_json()["authenticated"])

    def _login_and_get_token(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        cookie = res.headers.get("Set-Cookie")
        return cookie.split("auth_token=", 1)[1].split(";", 1)[0]

    def test_logged_out_token_cannot_be_reinjected(self):
        token = self._login_and_get_token()
        self.assertEqual(self.client.get("/api/protected").status_code, 200)
        self.client.post("/api/auth/logout")

        self.client.set_cookie("auth_token", token)
        self.assertEqual(self.client.get("/api/protected").status_code, 401)
        self.assertFalse(self.client.get("/api/auth/status").get_json()["authenticated"])

    def test_token_issued_before_restart_is_rejected(self):
        token = self._login_and_get_token()
        auth_sessions.clear()  # Flask 재시작으로 프로세스 레지스트리가 비워진 상황
        self.client.set_cookie("auth_token", token)
        self.assertEqual(self.client.get("/api/protected").status_code, 401)
        self.assertFalse(self.client.get("/api/auth/status").get_json()["authenticated"])

    def test_signed_token_without_registered_jti_is_rejected(self):
        for extra in ({}, {"jti": "forged-jti"}):
            forged = jwt.encode(
                {
                    "username": "CORP\\Alice",
                    "auth_method": "windows_sso",
                    "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
                    **extra,
                },
                Config.SECRET_KEY,
                algorithm="HS256",
            )
            self.client.set_cookie("auth_token", forged)
            self.assertEqual(self.client.get("/api/protected").status_code, 401, extra)
            self.assertFalse(self.client.get("/api/auth/status").get_json()["authenticated"])

    def test_jti_bound_to_username(self):
        token = self._login_and_get_token()
        payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
        Config.ALLOWED_USERS = {"corp\\alice", "corp\\bob"}
        payload["username"] = "CORP\\Bob"
        self.client.set_cookie("auth_token", jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256"))
        self.assertEqual(self.client.get("/api/protected").status_code, 401)

    def test_each_login_gets_distinct_jti_and_logout_revokes_only_own(self):
        first = self._login_and_get_token()
        second = self._login_and_get_token()
        jti1 = jwt.decode(first, Config.SECRET_KEY, algorithms=["HS256"])["jti"]
        jti2 = jwt.decode(second, Config.SECRET_KEY, algorithms=["HS256"])["jti"]
        self.assertNotEqual(jti1, jti2)
        self.assertGreaterEqual(len(jti1), 40)

        self.client.set_cookie("auth_token", first)
        self.client.post("/api/auth/logout")
        self.client.set_cookie("auth_token", second)
        self.assertEqual(self.client.get("/api/protected").status_code, 200)

    def test_db_access_without_authenticated_user_is_blocked(self):
        self.assertEqual(self.client.get("/api/unauthenticated_db").status_code, 401)


class IntegratedConnectionStringTest(unittest.TestCase):
    def test_connection_string_uses_trusted_connection_without_uid(self):
        from urllib.parse import unquote_plus
        from pkg_SQL.database import SQL

        sql = SQL(database="AOP_Database", reuse_engine=False)
        try:
            conn = unquote_plus(sql.connection_string)
            self.assertIn("Trusted_Connection=yes;", conn)
            self.assertNotIn("UID=", conn)
            self.assertNotIn("PWD=", conn)
        finally:
            sql.close()


if __name__ == "__main__":
    unittest.main()
