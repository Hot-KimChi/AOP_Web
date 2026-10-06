"""인증 API — Windows SSO(SSPI) 기반.

흐름
  1) 브라우저 → Node(Express Custom Server) `GET /auth/sso` 에서 SSPI(Negotiate) 인증
  2) Node → Flask `POST /api/auth/sso` 로 검증된 Windows 계정(domain, name)을 전달.
     이 요청은 서버 간 공유 비밀(`X-AOP-SSO-Secret`)로 보호된다.
  3) Flask 가 AUTH_ALLOWED_USERS 를 확인하고 서명 JWT(auth_token) 쿠키를 발급한다.

브라우저가 보낸 사용자명은 어떤 경우에도 인증 근거로 쓰지 않는다.
"""

import hmac
import re
from datetime import datetime, timedelta, timezone

import jwt
from flask import Blueprint, jsonify, request, session

from config import Config
from utils import auth_sessions
from utils.decorators import handle_exceptions
from utils.error_handler import error_response
from utils.logger import logger

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

SSO_SECRET_HEADER = "X-AOP-SSO-Secret"
MIN_SSO_SECRET_LENGTH = 32

# Windows 도메인(NetBIOS)·계정명에 쓸 수 없는 문자와 제어 문자를 거부한다.
_ACCOUNT_PART = re.compile(r'^[^\\/:*?"<>|@\[\];=,+\x00-\x1f]{1,104}$')


def _set_auth_cookie(response, token, expires=None):
    response.set_cookie(
        "auth_token",
        token,
        expires=expires,
        httponly=True,
        samesite="Lax",
        secure=Config.COOKIE_SECURE,
    )
    return response


def _clear_auth_cookie(response):
    return _set_auth_cookie(response, "", expires=0)


def _normalize_account(domain, name):
    """SSPI 가 확인한 (domain, name) 을 `DOMAIN\\user` 로 만든다. 형식 오류면 None."""
    if not isinstance(domain, str) or not isinstance(name, str):
        return None
    domain = domain.strip()
    name = name.strip()
    if not (_ACCOUNT_PART.match(domain) and _ACCOUNT_PART.match(name)):
        return None
    # 컴퓨터 계정(이름 끝 '$')은 사람이 아니므로 거부한다.
    if name.endswith("$") or len(domain) > 64:
        return None
    return f"{domain}\\{name}"


def _sso_secret_valid():
    expected = Config.SSO_SHARED_SECRET or ""
    provided = request.headers.get(SSO_SECRET_HEADER, "")
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


@auth_bp.route("/sso", methods=["POST"])
@handle_exceptions
def sso_login():
    """Node SSPI 서버만 호출하는 내부 로그인 엔드포인트."""
    if len(Config.SSO_SHARED_SECRET or "") < MIN_SSO_SECRET_LENGTH:
        logger.error(
            "Windows SSO login rejected: AUTH_SSO_SHARED_SECRET is not configured "
            f"(min {MIN_SSO_SECRET_LENGTH} chars)"
        )
        return error_response(
            "Windows SSO is not configured on the server. Please contact the administrator.",
            503,
        )
    if not _sso_secret_valid():
        logger.warning(f"Windows SSO login rejected: invalid server secret from {request.remote_addr}")
        return error_response("Unauthorized", 401)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("Request body must be valid JSON", 400)
    username = _normalize_account(data.get("domain"), data.get("name"))
    if not username:
        logger.warning("Windows SSO login rejected: invalid account format")
        return error_response("Invalid Windows account", 400)

    if not Config.is_login_allowed(username):
        logger.warning(f"Login denied for user '{username}': not in AUTH_ALLOWED_USERS")
        return error_response(
            "This account is not allowed to use AOP Web. Please contact the administrator.",
            403,
        )

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=Config.EXPIRE_TIME)
    payload = {
        "username": username,
        "id": username.lower(),
        "auth_method": "windows_sso",
        # 서버 측 세션 레지스트리 키. 로그아웃·재시작 시 이 jti 가 무효화된다.
        "jti": auth_sessions.register(username, expires_at.timestamp()),
        "exp": expires_at,
    }
    token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")
    # 구버전 SQL 로그인 세션에 남은 값(cred_token 등)을 정리한다.
    session.clear()
    logger.info(f"Windows SSO login succeeded for user '{username}'")
    response = jsonify({"status": "success", "message": "Login successful", "username": username})
    return _set_auth_cookie(response, token)


@auth_bp.route("/login", methods=["POST"])
@handle_exceptions
def login():
    """SQL 계정/비밀번호 로그인은 Windows SSO 로 대체되었다."""
    return error_response(
        "Username/password login is no longer supported. Please sign in with your Windows account.",
        410,
    )


@auth_bp.route("/status", methods=["GET"])
@handle_exceptions
def auth_status():
    token = request.cookies.get("auth_token")
    if not token:
        return (
            jsonify({"authenticated": False, "message": "User not authenticated"}),
            200,
        )
    try:
        decoded_token = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
        # 허용 목록에서 빠진 계정, SQL 로그인 시절 토큰, 로그아웃·재시작으로
        # 서버 세션이 없는 토큰은 즉시 무효로 본다.
        if (
            decoded_token.get("auth_method") != "windows_sso"
            or not auth_sessions.is_active(decoded_token.get("jti"), decoded_token.get("username"))
            or not Config.is_login_allowed(decoded_token.get("username"))
        ):
            response = jsonify({"authenticated": False, "message": "Access revoked"})
            return _clear_auth_cookie(response), 200
        return (
            jsonify({"authenticated": True, "username": decoded_token["username"]}),
            200,
        )
    except jwt.ExpiredSignatureError:
        return jsonify({"authenticated": False, "message": "Token expired"}), 200
    except jwt.InvalidTokenError:
        return jsonify({"authenticated": False, "message": "Invalid token"}), 200


@auth_bp.route("/logout", methods=["POST"])
@handle_exceptions
def logout():
    # 쿠키 삭제만으로는 보관·재주입된 토큰이 계속 유효하므로 서버 세션(jti)을 폐기한다.
    # 서명이 유효한 토큰만 대상으로 하며, 만료된 토큰도 폐기 대상에 포함한다.
    token = request.cookies.get("auth_token")
    if token:
        try:
            decoded = jwt.decode(
                token, Config.SECRET_KEY, algorithms=["HS256"], options={"verify_exp": False}
            )
            auth_sessions.revoke(decoded.get("jti"))
        except jwt.InvalidTokenError:
            pass
    session.clear()
    response = jsonify({"status": "success", "message": "Logged out successfully"})
    return _clear_auth_cookie(response)
