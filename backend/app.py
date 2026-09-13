import os

from flask import Flask
from flask_cors import CORS
from config import Config
from routes.auth import auth_bp
from routes.measset_gen import measset_gen_bp
from routes.db_api import db_api_bp
from routes.ml import ml_bp


def create_app():
    Config.load_config()
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

    @app.before_request
    def purge_legacy_session_secrets():
        """구버전 세션 쿠키에 남아 있을 수 있는 평문 자격증명을 즉시 제거한다.

        Flask 세션 쿠키는 서명만 될 뿐 암호화되지 않으므로, 과거 버전이 남긴
        `password` 키는 SECRET_KEY 가 유지된 채 배포되면 계속 왕복하게 된다.
        """
        from flask import session

        for legacy_key in ("password", "user_password"):
            if legacy_key in session:
                session.pop(legacy_key, None)

    @app.teardown_appcontext
    def teardown_db(exception):
        from utils.database_manager import DatabaseManager

        DatabaseManager.close_connections()

    return app


if __name__ == "__main__":
    app = create_app()

    # AOP_ENV: scripts/AOP_Web.ps1 이 -Production 여부에 따라 설정 (미설정 시 개발 모드로 간주)
    # 개발 모드: debug+reloader 활성화 → 코드 저장 시 자동 재시작 (서버 재기동 불필요)
    # 운영 모드: 보안/안정성을 위해 debug/reloader 비활성화
    is_dev = os.environ.get("AOP_ENV", "development").lower() != "production"
    app.run(host="0.0.0.0", port=5000, debug=is_dev, use_reloader=is_dev)
