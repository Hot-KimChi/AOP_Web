import configparser
import os
import jwt
from flask import Flask, request, jsonify, session, g
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
        connection = None
        try:
            connection = SQL(username, password, database=database)
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
                jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                return jsonify({"status": "error", "message": "Token expired"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"status": "error", "message": "Invalid token"}), 401
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
                    return jsonify({"error": "User not authenticated"}), 401

                db_name = (
                    database or kwargs.get("database") or request.args.get("database")
                )
                if not db_name:
                    return jsonify({"error": "No database specified"}), 400

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

            if not all([database, probeId, probeName]):
                return (
                    jsonify(
                        {
                            "error": "Missing required fields: database, probeId, or probeName"
                        }
                    ),
                    400,
                )

            try:
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

            finally:
                # 업로드된 파일 정리
                if os.path.exists(file_path):
                    os.remove(file_path)

        return jsonify({"error": "File handling issue"}), 400

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
        query = "SELECT probeId, probeName FROM probe_geo"
        df = g.current_db.execute_query(query)
        probes = [
            {"probeId": row[0], "probeName": row[1]} for row in df.values.tolist()
        ]
        return jsonify({"status": "success", "probes": probes})

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
