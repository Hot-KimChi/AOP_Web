import configparser
import os
import jwt
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime, timedelta

from pkg_SQL.database import SQL
from pkg_MeasSetGen.meas_generation import MeasSetGen

app = Flask(__name__)

# CORS 설정: 허용된 도메인만 설정
ALLOWED_ORIGINS = [
    "*",
]

CORS(
    app,
    supports_credentials=True,
    resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
)

# 업로드 폴더 설정
UPLOAD_FOLDER = "./1_uploads"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.secret_key = os.urandom(24)

# JWT 관련 환경 변수
SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "AOP_Admin_Token")
EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 3600))  # 기본값: 3600초 (1시간)


def load_config():
    """환경설정 파일 로드 및 환경 변수 설정"""
    config_path = os.path.join(".", "backend", "AOP_config.cfg")
    config = configparser.ConfigParser()
    config.read(config_path)
    for section in config.sections():
        for key, value in config[section].items():
            env_var_name = (
                f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
            )
            os.environ[env_var_name] = value
    if "database" in config and "name" in config["database"]:
        os.environ["DATABASE_NAME"] = config["database"]["name"]


def handle_exceptions(f):
    """예외 처리를 위한 데코레이터"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            app.logger.error(f"Error occurred: {str(e)}", exc_info=True)
            return jsonify({"status": "error", "message": str(e)}), 500

    return decorated_function


def require_auth(f):
    """JWT 인증 검증 데코레이터"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.cookies.get("auth_token")
        if not token:
            return (
                jsonify({"status": "error", "message": "Authentication required"}),
                401,
            )
        try:
            jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"status": "error", "message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"status": "error", "message": "Invalid token"}), 401
        return f(*args, **kwargs)

    return decorated_function


@app.route("/api/auth/login", methods=["POST"])
@handle_exceptions
def login():
    """로그인 처리 및 JWT 발급"""
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    sql = SQL(windows_auth=True, database="master")
    user_info = sql.get_user_info(username=username)

    if user_info and sql.authenticate_user(username=username, password=password):
        payload = {
            "username": user_info["username"],
            "id": str(user_info["sid"]),
            "exp": datetime.utcnow() + timedelta(seconds=EXPIRE_TIME),
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

        response = jsonify({"status": "success", "message": "Login successful"})
        response.set_cookie("auth_token", token, httponly=True, samesite="Lax")
        return response
    else:
        return jsonify({"error": "Invalid username or password"}), 401


@app.route("/api/auth/status", methods=["GET"])
@handle_exceptions
def auth_status():
    """인증 상태 확인"""
    token = request.cookies.get("auth_token")
    if not token:
        return (
            jsonify({"authenticated": False, "message": "User not authenticated"}),
            200,
        )  # 200으로 변경
    try:
        decoded_token = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return (
            jsonify({"authenticated": True, "username": decoded_token["username"]}),
            200,
        )
    except jwt.ExpiredSignatureError:
        return (
            jsonify({"authenticated": False, "message": "Token expired"}),
            200,
        )  # 200으로 변경
    except jwt.InvalidTokenError:
        return (
            jsonify({"authenticated": False, "message": "Invalid token"}),
            200,
        )  # 200으로 변경


@app.route("/api/auth/logout", methods=["POST"])
@handle_exceptions
def logout():
    """로그아웃 처리"""
    response = jsonify({"status": "success", "message": "Logged out successfully"})
    response.set_cookie("auth_token", "", expires=0)
    return response


@app.route("/api/measset-generation", methods=["POST"])
@handle_exceptions
@require_auth
def upload_file():
    """파일 업로드 및 측정 세트 생성"""
    try:
        if not os.path.exists(app.config["UPLOAD_FOLDER"]):
            os.makedirs(app.config["UPLOAD_FOLDER"])

        if "file" not in request.files:
            return jsonify({"error": "No file part"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No selected file"}), 400

        if file and file.filename:
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(file_path)

            database = request.form.get("database")
            probeId = request.form.get("probeId")
            probeName = request.form.get("probeName")

            if not (database and probeId and probeName):
                return (
                    jsonify(
                        {
                            "error": "Missing required fields: database, probeId, or probeName"
                        }
                    ),
                    400,
                )

            # MeasSetGen 객체 생성 및 처리
            meas_gen = MeasSetGen(database, probeId, probeName, file_path)
            result = meas_gen.generate()

            if result:
                return jsonify({"status": "success", "data": result}), 200
            else:
                return (
                    jsonify(
                        {
                            "error": "Generation failed. Please check input data or file integrity."
                        }
                    ),
                    500,
                )

        return jsonify({"error": "File handling issue"}), 400

    except Exception as e:
        app.logger.error(f"Unexpected error during file upload: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route("/api/get_list_database", methods=["GET"])
@handle_exceptions
@require_auth
def get_list_database():
    """데이터베이스 목록 반환"""
    databases = os.environ.get("DATABASE_NAME", "").split(",")
    return jsonify({"status": "success", "databases": databases})


@app.route("/api/get_list_table", methods=["GET"])
@handle_exceptions
@require_auth
def get_list_table():
    """데이터베이스 목록 반환"""
    tables = os.environ.get("SERVER_TABLE_TABLE", "").split(",")
    return jsonify({"status": "success", "tables": tables})


@app.route("/api/get_probes", methods=["GET"])
@handle_exceptions
@require_auth
def get_probes():
    """프로브 목록 반환"""
    database = request.args.get("database")
    if not database:
        return jsonify({"error": "No database specified"}), 400

    connect = SQL(windows_auth=True, database=database)
    query = "SELECT probeId, probeName FROM probe_geo"
    df = connect.execute_query(query)
    probes = [{"probeId": row[0], "probeName": row[1]} for row in df.values.tolist()]
    return jsonify({"status": "success", "probes": probes})


if __name__ == "__main__":
    load_config()
    app.run(host="0.0.0.0", port=5000, debug=True)
