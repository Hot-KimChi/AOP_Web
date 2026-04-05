from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta
import jwt
import sqlalchemy.exc
import pyodbc
from config import Config
from utils.database_manager import DatabaseManager
from utils.decorators import handle_exceptions
from utils.error_handler import error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
@handle_exceptions
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return error_response("Username and password are required", 400)

    try:
        with DatabaseManager.create_explicit_connection(username, password, "master") as sql:
            user_info = sql.get_user_info(username=username)
            if user_info and sql.authenticate_user(username=username, password=password):
                payload = {
                    "username": user_info["username"],
                    "id": str(user_info["sid"]),
                    "exp": datetime.utcnow() + timedelta(seconds=Config.EXPIRE_TIME),
                }
                token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")
                # 세션에 로그인 자격증명 저장 — 이후 모든 DB 연결에 사용됨
                session["username"] = username
                session["password"] = password
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
    except (sqlalchemy.exc.InterfaceError, sqlalchemy.exc.OperationalError,
            pyodbc.InterfaceError, pyodbc.OperationalError):
        # SQL Server 인증 실패 → 401 (잘못된 자격증명)
        return error_response("Invalid username or password", 401)

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
    session.clear()
    response = jsonify({"status": "success", "message": "Logged out successfully"})
    response.set_cookie("auth_token", "", expires=0)
    return response
