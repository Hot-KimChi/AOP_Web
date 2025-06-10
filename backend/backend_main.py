import configparser
import os, io
import jwt
from flask import Flask, request, jsonify, session, g, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime, timedelta
from contextlib import contextmanager
from typing import Optional
import logging

from pkg_SQL.database import SQL
from pkg_MeasSetGen.meas_generation import MeasSetGen

# 로깅 설정
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self):
        self.config = self._load_db_config()

    def _load_db_config(self):
        """Load database configuration from config file"""
        config = configparser.ConfigParser()
        config_path = os.path.join(".", "backend", "AOP_config.cfg")
        config.read(config_path)
        return config

    @contextmanager
    def get_connection(self, username: str, password: str, database: str):
        """Context manager for database connections"""
        connection = SQL(username, password, database)
        try:
            yield connection
        finally:
            if connection and hasattr(connection, "close"):
                connection.close()


class Config:
    """Application configuration class"""

    UPLOAD_FOLDER = "./1_uploads"
    SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "AOP_Admin_Token")
    EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 3600))
    ALLOWED_ORIGINS = ["*"]

    @staticmethod
    def load_config():
        """Load configuration from file and set environment variables"""
        config_path = os.path.join(".", "backend", "AOP_config.cfg")
        config = configparser.ConfigParser()
        config.read(config_path)

        for section in config.sections():
            for key, value in config[section].items():
                env_var_name = f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
                os.environ[env_var_name] = value

        if "database" in config and "name" in config["database"]:
            os.environ["DATABASE_NAME"] = config["database"]["name"]


def error_response(message: str, status_code: int):
    """error feedback to user"""
    return jsonify({"status": "error", "message": message}), status_code


def create_app():
    """Application factory function"""
    app = Flask(__name__)
    app.config.from_object(Config)

    # CORS 설정
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": Config.ALLOWED_ORIGINS}},
    )
    app.secret_key = os.urandom(24)

    def get_db():
        """Get database connection from Flask g object"""
        if "db" not in g:
            g.db = DatabaseManager()
        return g.db

    def handle_exceptions(f):
        """예외 처리를 위한 데코레이터"""

        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error occurred: {str(e)}", exc_info=True)
                return error_response(str(e), 500)

        return decorated_function

    def require_auth(f):
        """JWT 인증 검증 데코레이터"""

        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.cookies.get("auth_token")
            if not token:
                return error_response("Authentication required", 401)
            try:
                jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                return error_response("Token expired", 401)
            except jwt.InvalidTokenError:
                return error_response("Invalid token", 403)
            return f(*args, **kwargs)

        return decorated_function

    def with_db_connection(database: Optional[str] = None):
        """데이터베이스 연결을 관리하는 데코레이터"""

        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                username = session.get("username")
                password = session.get("password")

                if not username or not password:
                    return error_response("Username and password are required", 422)
                # 우선 query parameter에서 찾고 없으면 JSON 본문에서 찾습니다.
                db_name = (
                    database or kwargs.get("database") or request.args.get("database")
                )
                if not db_name and request.is_json:
                    json_data = request.get_json(silent=True)
                    if json_data and "database" in json_data:
                        db_name = json_data["database"]

                if not db_name:
                    return error_response("No database specified", 400)
                db = get_db()
                with db.get_connection(username, password, db_name) as conn:
                    g.current_db = conn
                    return f(*args, **kwargs)

            return decorated_function

        return decorator

    @app.route("/api/auth/login", methods=["POST"])
    @handle_exceptions
    def login():
        """로그인 처리 및 JWT 발급"""
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")

        db = get_db()
        with db.get_connection(username, password, database="master") as sql:
            user_info = sql.get_user_info(username=username)

            if user_info and sql.authenticate_user(
                username=username, password=password
            ):
                payload = {
                    "username": user_info["username"],
                    "id": str(user_info["sid"]),
                    "exp": datetime.utcnow() + timedelta(seconds=Config.EXPIRE_TIME),
                }
                token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

                session["username"] = username
                session["password"] = password

                response = jsonify({"status": "success", "message": "Login successful"})
                response.set_cookie("auth_token", token, httponly=True, samesite="Lax")
                return response

        return error_response("Invalid username or password", 401)

    @app.route("/api/auth/status", methods=["GET"])
    @handle_exceptions
    def auth_status():
        """인증 상태 확인"""
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

    @app.route("/api/auth/logout", methods=["POST"])
    @handle_exceptions
    def logout():
        """로그아웃 처리"""
        session.clear()
        response = jsonify({"status": "success", "message": "Logged out successfully"})
        response.set_cookie("auth_token", "", expires=0)
        return response

    @app.route("/api/measset-generation", methods=["POST"])
    @handle_exceptions
    @require_auth
    # @with_db_connection()
    def upload_file():
        """파일 업로드 및 측정 세트 생성"""
        if not os.path.exists(app.config["UPLOAD_FOLDER"]):
            os.makedirs(app.config["UPLOAD_FOLDER"])
        if "file" not in request.files:
            return error_response("No file part", 400)

        file = request.files["file"]
        if file.filename == "":
            return error_response("No selected file", 400)

        if file and file.filename:
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(file_path)

            database = request.form.get("database")
            probeId = request.form.get("probeId")
            probeName = request.form.get("probeName")

            if not all([database, probeId, probeName]):
                return error_response(
                    "Missing required fields: database, probeId, or probeName", 400
                )

            try:
                meas_gen = MeasSetGen(database, probeId, probeName, file_path)
                result_file_path = meas_gen.generate()

                if result_file_path:
                    return (
                        jsonify({"status": "success", "csv_key": result_file_path}),
                        200,
                    )
                else:
                    return error_response(
                        "Generation failed. Please check input data or file integrity.",
                        500,
                    )

            finally:
                # 업로드된 파일 정리
                if os.path.exists(file_path):
                    os.remove(file_path)

        return error_response("File handling issue", 400)

    @app.route("/api/insert-sql", methods=["POST"])
    @handle_exceptions
    @require_auth
    @with_db_connection()
    def insert_sql_measset():
        data = request.get_json()
        table_name = data.get("table")
        records = data.get("data")
        if not table_name or not records:
            return error_response(
                "Invalid data: table and data fields are required", 400
            )
        try:
            import pandas as pd
            import json
            from io import StringIO

            # 클라이언트에서 전달된 records는 이미 리스트 형태입니다.
            # 이를 JSON 문자열로 변환한 후, DataFrame으로 재구성합니다.
            json_str = json.dumps(records)
            df = pd.read_json(StringIO(json_str), orient="records")
        except Exception as e:
            logger.error(f"DataFrame conversion error: {str(e)}")
            return error_response("Failed to parse records into DataFrame", 500)
        try:
            g.current_db.insert_data(table_name, df)
            return (
                jsonify({"status": "success", "message": "Data inserted successfully"}),
                200,
            )
        except Exception as e:
            logger.error(f"Data insertion failed: {str(e)}", exc_info=True)
            return error_response(str(e), 500)

    @app.route("/api/csv-data", methods=["GET"])
    @handle_exceptions
    @require_auth
    def get_csv_data():
        """저장된 CSV 데이터 반환"""
        csv_key = request.args.get("csv_key")
        if not csv_key:
            return error_response("csv_key is required", 400)

        csv_file_path = csv_key
        if not os.path.exists(csv_file_path):
            return error_response("CSV data not found", 404)

        with open(csv_file_path, "r") as f:
            csv_data = f.read()

        return jsonify({"status": "success", "data": csv_data}), 200

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
        """테이블 목록 반환"""
        tables = os.environ.get("SERVER_TABLE_TABLE", "").split(",")
        return jsonify({"status": "success", "tables": tables})

    @app.route("/api/get_probes", methods=["GET"])
    @handle_exceptions
    @require_auth
    @with_db_connection()
    def get_probes():
        """프로브 목록 반환"""
        selected_database = request.args.get("database")
        selected_table = request.args.get("table")
        logger.info(f"Database: {selected_database}, Table: {selected_table}")

        # 허용된 테이블 이름 목록
        allowed_tables = ["Tx_summary", "probe_geo"]

        if selected_table not in allowed_tables:
            return (
                jsonify(
                    {"status": "error", "message": "유효하지 않은 테이블 이름입니다"}
                ),
                400,
            )

        query = f"SELECT probeId, probeName FROM {selected_table}"
        df = g.current_db.execute_query(query)

        df["probeId"] = df["probeId"].fillna("empty")

        # probeId와 probeName을 기준으로 중복 제거
        df_unique = df.drop_duplicates(subset=["probeId", "probeName"])

        # probeName을 기준으로 정렬
        df_unique = df_unique.sort_values(by="probeName")

        # React용 고유 ID 추가하되, 표시되는 데이터는 그대로 유지
        probes = []
        for i, row in enumerate(df_unique.values.tolist()):
            probes.append(
                {
                    "probeId": row[0],  # 실제 데이터 유지
                    "probeName": row[1],  # 실제 데이터 유지
                    "_id": f"{row[0]}_{i}",  # 내부 고유 식별자 추가 (프론트엔드에서만 사용)
                }
            )

        return jsonify({"status": "success", "probes": probes})

    @app.route("/api/get_table_data", methods=["GET"])
    @handle_exceptions
    @require_auth
    @with_db_connection()
    def get_table_data():
        """프로브 및 소프트웨어 데이터 반환"""
        selected_database = request.args.get("database")
        selected_table = request.args.get("table")
        logger.info(f"Database: {selected_database}, Table: {selected_table}")
        # 허용된 테이블 이름 목록
        allowed_tables = ["Tx_summary", "probe_geo", "WCS"]
        if selected_table not in allowed_tables:
            return (
                jsonify(
                    {"status": "error", "message": "유효하지 않은 테이블 이름입니다"}
                ),
                400,
            )

        # 테이블에 따라 다른 쿼리 실행 및 컬럼명 처리 (유니크 데이터)
        if selected_table == "Tx_summary":
            query = f"SELECT DISTINCT ProbeID AS probeId, ProbeName AS probeName,           Software_version AS software_version FROM {selected_table}"
        elif selected_table == "WCS":
            query = f"SELECT DISTINCT probeId, myVersion FROM {selected_table}"
        else:
            query = f"SELECT DISTINCT probeId, probeName FROM {selected_table}"

        df = g.current_db.execute_query(query)

        # NULL 값 처리 - 테이블별로 필요한 컬럼에서 NULL일 경우 해당 행 삭제
        if selected_table == "WCS":
            df = df.dropna(subset=["probeId", "myVersion"])
        else:
            df = df.dropna(subset=["probeId", "probeName"])

        response_data = {
            "status": "success",
            "hasSoftwareData": selected_table
            == "Tx_summary",  # 소프트웨어 데이터 포함 여부
        }

        # WCS 테이블 처리
        if selected_table == "WCS":
            # probeId를 문자열로 변환
            df["probeId"] = df["probeId"].astype(str)
            # myVersion을 문자열로 변환
            df["myVersion"] = df["myVersion"].astype(str)

            # ProbeID와 myVersion 조합으로만 중복 제거
            df = df.drop_duplicates(subset=["probeId", "myVersion"])

            # probeId별 myVersion 목록 생성
            wcs_versions = []
            for i, row in enumerate(df.values.tolist()):
                wcs_versions.append(
                    {
                        "probeId": row[0],
                        "myVersion": row[1],
                        "_id": f"wcs_{i}",  # 내부 고유 식별자
                    }
                )

            response_data["wcsVersions"] = wcs_versions

            return jsonify(response_data)

        # 프로브 정보 처리 (Tx_summary 또는 probe_geo 테이블의 경우)
        df_probes = df.drop_duplicates(subset=["probeId", "probeName"])
        df_probes = df_probes.sort_values(by="probeName")

        # React용 고유 ID 추가
        probes = []
        for i, row in enumerate(df_probes[["probeId", "probeName"]].values.tolist()):
            probes.append(
                {
                    "probeId": str(row[0]),  # 문자열로 변환
                    "probeName": str(row[1]),  # 문자열로 변환
                    "_id": f"{row[0]}_{i}",  # 내부 고유 식별자
                }
            )

        response_data["probes"] = probes

        # Tx_summary 테이블인 경우에만 소프트웨어 버전 정보 추가
        if selected_table == "Tx_summary":
            # NULL 값 처리
            df["software_version"] = df["software_version"].fillna("Empty")

            # 모든 소프트웨어 버전을 문자열로 변환
            df["software_version"] = df["software_version"].astype(str)

            # 소프트웨어 버전 정보 추출 (중복 제거 및 정렬)
            df_software = df.drop_duplicates(subset=["software_version"])

            # 문자열로 정렬 (숫자와 문자열 혼합 시 문제 방지)
            df_software = df_software.sort_values(
                by="software_version", key=lambda x: x.astype(str)
            )

            # 프로브별 소프트웨어 버전 매핑 정보 생성
            probe_software_map = {}
            for _, row in df.iterrows():
                probe_id = str(row["probeId"])  # 문자열로 변환
                if probe_id not in probe_software_map:
                    probe_software_map[probe_id] = []

                software_version = str(row["software_version"])  # 문자열로 변환
                if (
                    software_version != "empty"
                    and {"softwareVersion": software_version}
                    not in probe_software_map[probe_id]
                ):
                    probe_software_map[probe_id].append(
                        {"softwareVersion": software_version}
                    )

            # 소프트웨어 버전 목록 생성
            software = []
            for i, row in enumerate(df_software[["software_version"]].values.tolist()):
                if row[0] != "empty":  # empty 값 제외
                    software.append(
                        {
                            "softwareVersion": str(row[0]),  # 문자열로 변환
                            "_id": f"sw_version_{i}",  # 내부 고유 식별자
                        }
                    )

            response_data["software"] = software
            response_data["mapping"] = probe_software_map

        return jsonify(response_data)

    @app.route("/api/run_tx_compare", methods=["POST"])
    @handle_exceptions
    @require_auth
    @with_db_connection()
    def run_tx_compare():
        """TxCompare 저장 프로시저를 실행하여 비교 보고서 데이터 추출"""
        try:
            # 요청 데이터 검증
            if not request.is_json:
                return error_response(
                    "요청 형식이 잘못되었습니다. JSON 형식이 필요합니다.", 400
                )

            data = request.get_json()

            # 필수 파라미터 확인
            required_params = [
                "probeId",
                "TxSumSoftware",  # Tx_SW
                "wcsSoftware",  # WCS_SW
                "measSSId_Temp",  # SSid_Temp
                "measSSId_MI",  # SSid_MI
                "measSSId_Ispta",  # SSid_Ispta3
            ]

            missing_params = [param for param in required_params if not data.get(param)]
            if missing_params:
                return error_response(
                    f"필수 파라미터가 누락되었습니다: {', '.join(missing_params)}", 400
                )

            # 파라미터 추출
            probeid = int(float(data.get("probeId")))
            tx_sw = data.get("TxSumSoftware")  # 프론트엔드의 파라미터명
            wcs_sw = data.get("wcsSoftware")  # 프론트엔드의 파라미터명
            ssid_temp = data.get("measSSId_Temp")
            ssid_mi = data.get("measSSId_MI")
            ssid_ispta3 = data.get("measSSId_Ispta")

            logger.info(
                f"TxCompare 실행 요청: probeId={probeid}, "
                f"Tx_SW={tx_sw}, WCS_SW={wcs_sw}, "
                f"SSid_Temp={ssid_temp}, SSid_MI={ssid_mi}, SSid_Ispta3={ssid_ispta3}"
            )

            # 저장 프로시저 실행
            # 파라미터 설정 - 저장 프로시저의 파라미터명과 일치시킴
            params = (
                probeid,
                tx_sw,
                wcs_sw,
                ssid_temp,
                ssid_mi,
                ssid_ispta3,
            )

            # 저장 프로시저 실행 및 결과 반환
            # 프로시저명과 파라미터를 전달하는 방식으로 변경
            result_df = g.current_db.execute_procedure("TxCompare", params)
            # NaN 값 때문에 JSON 직렬화 오류 방지
            import numpy as np

            result_df = result_df.replace({np.nan: None})

            if result_df is None or result_df.empty:
                return (
                    jsonify(
                        {
                            "status": "success",
                            "message": "비교 보고서 데이터가 없습니다.",
                            "reportData": [],
                        }
                    ),
                    200,
                )

            # DataFrame을 JSON으로 변환
            report_data = result_df.to_dict(orient="records")

            # 응답 반환
            return (
                jsonify(
                    {
                        "status": "success",
                        "message": "비교 보고서 데이터를 성공적으로 추출했습니다.",
                        "reportData": report_data,
                    }
                ),
                200,
            )

        except Exception as e:
            logger.error(f"TxCompare 실행 중 오류 발생: {str(e)}", exc_info=True)
            return error_response(
                f"비교 보고서 데이터 추출 중 오류가 발생했습니다: {str(e)}", 500
            )

    @app.teardown_appcontext
    def teardown_db(exception):
        """애플리케이션 컨텍스트가 종료될 때 데이터베이스 연결 정리"""
        db = g.pop("db", None)
        if db is not None and hasattr(db, "close"):
            db.close()

    return app


if __name__ == "__main__":
    Config.load_config()
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
