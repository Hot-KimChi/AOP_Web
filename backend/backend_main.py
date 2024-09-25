import configparser
import os
import getpass
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from functools import wraps
import win32api, win32security

from pkg_SQL.database import SQL
from pkg_MeasSetGen.meas_generation import MeasSetGen

# from pkg_MeasSetGen.meas_generation import MeasSetGen
# from pkg_Viewer.viewer import Viewer
# from pkg_Verify_Report.verify_report import Verify_Report
# from pkg_MachineLearning.machine_learning import Machine_Learning


app = Flask(__name__)
CORS(
    app,
    supports_credentials=True,
    resources={
        r"/api/*": {"origins": ["http://localhost:3000", "http://10.82.216.206:3000"]}
    },
)

UPLOAD_FOLDER = "./uploads"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.secret_key = os.urandom(24)  # 세션을 위한 시크릿 키 설정
app.config["SESSION_COOKIE_SAMESITE"] = "None"
app.config["SESSION_COOKIE_SECURE"] = True


def load_config():
    config_path = os.path.join(".", "backend", "AOP_config.cfg")
    config = configparser.ConfigParser()
    config.read(config_path)

    for section in config.sections():
        for key, value in config[section].items():
            # 섹션 이름과 키에서 공백 제거 및 대문자 변환
            env_var_name = (
                f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
            )
            os.environ[env_var_name] = value

    # 데이터베이스 이름은 쉼표로 구분된 리스트이므로 별도 처리
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
        # MSSQL 서버에 연결 시도
        connect = SQL(windows_auth=True)
        # 연결 성공 시 세션에 인증 정보 저장
        session["authenticated"] = True
        session["user"] = user
        session.permanent = True  # 세션을 영구적으로 유지
        return jsonify({"status": "success", "authenticated": True, "user": user})
    except Exception as e:
        # 연결 실패 시
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
            # 사용자의 전체 이름(Full Name) 가져오기
            sid = win32security.LookupAccountName(None, user)[0]
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

    if file:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(file_path)

        # MeasSetGen 실행
        database = request.form.get("database")
        probeId = request.form.get("probeId")
        probeName = request.form.get("probeName")
        print(database, probeId, probeName)
        meas_gen = MeasSetGen(database, probeId)
        result = meas_gen.generate()

        return jsonify({"status": "success", "data": result})


# @app.route("/api/verify_report", methods=["POST"])
# @handle_exceptions
# @require_auth
# def verify_report():
#     data = request.json
#     database = data.get("database")
#     list_probe = data.get("list_probe")
#     verify_report = Verify_Report(database, list_probe)
#     result = verify_report.generate()
#     return jsonify({"status": "success", "data": result})


# @app.route("/api/machine_learning", methods=["POST"])
# @handle_exceptions
# @require_auth
# def machine_learning():
#     data = request.json
#     database = data.get("database")
#     ml = Machine_Learning(database)
#     result = ml.process()
#     return jsonify({"status": "success", "data": result})


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
    app.run(host="0.0.0.0", port=5000, debug=True)
