from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta, timezone
import re
import jwt
import sqlalchemy.exc
import pyodbc
from config import Config
from utils.database_manager import DatabaseManager
from utils.credential_store import (
    bind_to_session,
    clear_session,
    has_session_credentials,
)
from utils.decorators import handle_exceptions
from utils.error_handler import error_response
from utils.logger import logger

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# 로그인 실패를 "자격증명 문제"와 "인프라 문제"로 나누기 위한 SQLSTATE 목록.
# 예전에는 세 경우(비밀번호 오류 / DB 서버 다운 / ODBC 드라이버 없음)가 모두 같은
# 401 "Invalid username or password" 로 반환되고 예외도 삼켜져서, 서버 로그만으로는
# 원인을 전혀 알 수 없었다.
_INFRA_SQLSTATES = frozenset({
    "08001",  # 서버에 연결할 수 없음
    "08S01",  # 통신 링크 실패
    "08004",  # 서버가 연결을 거부함
    "HYT00",  # 쿼리 타임아웃
    "HYT01",  # 연결 타임아웃
    "IM002",  # 데이터 원본 이름을 찾을 수 없음(ODBC 드라이버 미설치)
    "IM003",  # 드라이버 로드 실패
})


def _extract_sqlstate(exc):
    """예외에서 ODBC SQLSTATE(5자리)를 뽑아낸다. 찾지 못하면 빈 문자열."""
    orig = getattr(exc, "orig", exc)
    args = getattr(orig, "args", ())
    if args and isinstance(args[0], str) and len(args[0]) == 5:
        return args[0]
    match = re.search(r"\[(\w{5})\]", str(orig))
    return match.group(1) if match else ""


def _safe_error_text(exc, password):
    """예외 메시지를 로그용으로 정리한다. 연결 문자열이 섞여 나올 수 있으므로
    비밀번호가 포함돼 있으면 반드시 가린다."""
    text = " ".join(str(exc).split())[:500]
    if password:
        text = text.replace(password, "***")
    return text


@auth_bp.route("/login", methods=["POST"])
@handle_exceptions
def login():
    data = request.get_json(silent=True)
    if not data:
        return error_response("Request body must be valid JSON", 400)
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return error_response("Username and password are required", 400)

    try:
        with DatabaseManager.create_explicit_connection(username, password, "master") as sql:
            user_info = sql.get_user_info(username=username)
            if user_info and sql.authenticate_user(username=username, user_info=user_info):
                # 자격증명이 유효하더라도 허용 목록이 지정돼 있으면 그 안에 있어야 한다.
                # 검증을 자격증명 확인 "뒤"에 두어, 비밀번호를 모르는 사람이 특정
                # 계정의 권한 여부를 떠보지 못하게 한다.
                if not Config.is_login_allowed(user_info["username"]):
                    logger.warning(
                        f"Login denied for user '{user_info['username']}': not in AUTH_ALLOWED_USERS"
                    )
                    return error_response(
                        "This account is not allowed to use AOP Web. Please contact the administrator.",
                        403,
                    )
                payload = {
                    "username": user_info["username"],
                    "id": str(user_info["sid"]),
                    "exp": datetime.now(timezone.utc) + timedelta(seconds=Config.EXPIRE_TIME),
                }
                token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")
                # 자격증명은 서버 메모리에 보관하고 세션에는 불투명 토큰만 저장한다.
                # (Flask 기본 세션은 서명만 될 뿐 암호화되지 않아 평문 비밀번호가 노출된다)
                bind_to_session(username, password)
                session.permanent = False  # 브라우저 종료 시 세션 만료
                response = jsonify({"status": "success", "message": "Login successful"})
                response.set_cookie(
                    "auth_token",
                    token,
                    httponly=True,
                    samesite="Lax",
                    secure=Config.COOKIE_SECURE,
                )
                return response
            # 연결은 성공했으나 계정 메타데이터를 찾지 못한 경우
            logger.warning(
                f"Login rejected for user '{username}': "
                f"connected to SQL Server but user metadata was not found in sys.sql_logins"
            )
    except (sqlalchemy.exc.InterfaceError, sqlalchemy.exc.OperationalError,
            pyodbc.InterfaceError, pyodbc.OperationalError) as exc:
        sqlstate = _extract_sqlstate(exc)
        detail = _safe_error_text(exc, password)
        if sqlstate in _INFRA_SQLSTATES:
            # 자격증명 문제가 아니라 서버/드라이버 문제다. 401 로 뭉개면 사용자는
            # 비밀번호만 반복해서 다시 입력하게 된다.
            logger.error(
                f"Login unavailable for user '{username}': "
                f"database connection failed (SQLSTATE={sqlstate}) - {detail}"
            )
            return error_response(
                "Cannot reach the authentication server. Please contact the administrator.",
                503,
            )
        logger.warning(
            f"Failed login attempt for user '{username}' "
            f"(SQLSTATE={sqlstate or 'unknown'}): {detail}"
        )
        return error_response("Invalid username or password", 401)

    logger.warning(f"Failed login attempt for user: {username}")
    return error_response("Invalid username or password", 401)


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
        # 허용 목록에서 빠진 계정의 기존 토큰은 즉시 무효로 본다.
        # (토큰은 발급 후 EXPIRE_TIME 동안 살아 있으므로 여기서 확인하지 않으면
        #  권한을 회수해도 기존 세션이 그대로 유지된다)
        if not Config.is_login_allowed(decoded_token.get("username")):
            response = jsonify({"authenticated": False, "message": "Access revoked"})
            response.set_cookie(
                "auth_token",
                "",
                expires=0,
                httponly=True,
                samesite="Lax",
                secure=Config.COOKIE_SECURE,
            )
            return response, 200
        # 세션에 DB 자격증명이 있는지도 확인 (JWT 유효하지만 세션 만료 시 422 방지)
        has_credentials = has_session_credentials()
        return (
            jsonify({
                "authenticated": True,
                "username": decoded_token["username"],
                "has_credentials": has_credentials,
            }),
            200,
        )
    except jwt.ExpiredSignatureError:
        return jsonify({"authenticated": False, "message": "Token expired"}), 200
    except jwt.InvalidTokenError:
        return jsonify({"authenticated": False, "message": "Invalid token"}), 200


@auth_bp.route("/logout", methods=["POST"])
@handle_exceptions
def logout():
    clear_session()
    response = jsonify({"status": "success", "message": "Logged out successfully"})
    response.set_cookie(
        "auth_token",
        "",
        expires=0,
        httponly=True,
        samesite="Lax",
        secure=Config.COOKIE_SECURE,
    )
    return response
