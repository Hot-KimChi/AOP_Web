from flask import Flask
from flask_cors import CORS
from config import Config
from routes.auth import auth_bp
from routes.measset_gen import measset_gen_bp
from routes.db_api import db_api_bp
from routes.ml import ml_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # 세션 암호화 키 (Config → 환경변수 우선, 하드코딩 제거)
    app.secret_key = Config.FLASK_SECRET_KEY

    # 세션 쿠키 보안 설정
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = Config.COOKIE_SECURE

    # CORS: ALLOWED_ORIGINS 환경변수 기반 (개발: *, 운영: 명시 도메인)
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": Config.ALLOWED_ORIGINS}},
    )

    # 디버그 모드에서 더 자세한 로깅 활성화
    if app.debug:
        import logging

        logging.basicConfig(level=logging.DEBUG)
        app.logger.setLevel(logging.DEBUG)

    app.register_blueprint(auth_bp)
    app.register_blueprint(measset_gen_bp)
    app.register_blueprint(db_api_bp)
    app.register_blueprint(ml_bp)

    @app.teardown_appcontext
    def teardown_db(exception):
        # 기존 DB 연결 정리
        from flask import g

        db = g.pop("db", None)
        if db is not None and hasattr(db, "close"):
            db.close()

        # DatabaseManager 연결 정리
        from utils.database_manager import DatabaseManager

        DatabaseManager.close_connections()

    return app


if __name__ == "__main__":
    Config.load_config()
    app = create_app()

    # Always run in production mode (debug disabled, no reloader)
    # For development debugging, manually set debug=True
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
