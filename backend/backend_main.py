import configparser
import os
import getpass
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from functools import wraps
import win32api, win32security
from datetime import timedelta

from pkg_SQL.database import SQL
from pkg_MeasSetGen.meas_generation import MeasSetGen

app = Flask(__name__)

# 모든 출처에서의 접근 허용
CORS(
    app,
    supports_credentials=True,
    resources={r"/api/*": {"origins": "*"}},
)

UPLOAD_FOLDER = "./1_uploads"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.secret_key = os.urandom(24)  # 세션을 위한 시크릿 키 설정

# 세션 설정
app.config["SESSION_COOKIE_SAMESITE"] = "None"  # 다른 도메인 접근 허용
app.config["SESSION_COOKIE_SECURE"] = True  # HTTPS에서만 쿠키 전달 허용
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=1)  # 세션 유효 시간 1시간


def load_config():
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
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            app.logger.error(f"Error occurred: {str(e)}", exc_info=True)
            return jsonify({"status": "error", "message": str(e)}), 500

    return decorated_function


def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "authenticated" not in session or not session["authenticated"]:
            return (
                jsonify({"status": "error", "message": "Authentication required"}),
                401,
            )
        return f(*args, **kwargs)

    return decorated_function


@app.route("/api/authenticate", methods=["POST"])
@handle_exceptions
def authenticate():
    user = getpass.getuser()
    try:
        session["authenticated"] = True
        session["user"] = user
        session.permanent = True  # 세션을 영구적으로 유지
        return jsonify({"status": "success", "authenticated": True, "user": user})
    except Exception as e:
        return (
            jsonify({"status": "error", "authenticated": False, "message": str(e)}),
            401,
        )


@app.route("/api/get_windows_user", methods=["GET"])
@handle_exceptions
def get_windows_user():
    if "authenticated" in session and session["authenticated"]:
        user = session["user"]
        try:
            sid = win32security.LookupAccountName(None, user)[0]
            print(sid)
            full_name = win32api.GetUserNameEx(win32api.NameDisplay)
            return jsonify(
                {
                    "status": "success",
                    "authenticated": True,
                    "user": user,
                    "full_name": full_name,
                    "connection_status": "연결 완료",
                }
            )
        except Exception as e:
            return jsonify(
                {
                    "status": "error",
                    "authenticated": True,
                    "user": user,
                    "connection_status": "Admin 문의",
                    "message": f"Full name retrieval failed: {str(e)}",
                }
            )
    else:
        return (
            jsonify(
                {
                    "status": "error",
                    "authenticated": False,
                    "message": "Not authenticated",
                }
            ),
            401,
        )


@app.route("/api/get_list_database", methods=["GET"])
@handle_exceptions
@require_auth
def get_list_database():
    databases = os.environ.get("DATABASE_NAME", "").split(",")
    return jsonify({"status": "success", "databases": databases})


@app.route("/api/measset-generation", methods=["POST"])
@handle_exceptions
@require_auth
def upload_file():
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

        meas_gen = MeasSetGen(database, probeId, probeName, file_path)
        result = meas_gen.generate()

        if result:
            return jsonify({"status": "success", "data": result}), 200
        else:
            return jsonify({"error": "Generation failed"}), 500

    return jsonify({"error": "File handling issue"}), 400


@app.route("/api/get_probes", methods=["GET"])
@handle_exceptions
@require_auth
def get_probes():
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

    # SSL 인증서를 통해 HTTPS로 서버 실행
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        # ssl_context=(
        #     "/path/to/certfile.crt",  # SSL 인증서 파일 경로
        #     "/path/to/keyfile.key",  # SSL 키 파일 경로
        # ),
    )
