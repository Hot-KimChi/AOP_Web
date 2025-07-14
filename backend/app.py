from flask import Flask
from flask_cors import CORS
from config import Config
from routes.auth import auth_bp
from routes.file import file_bp
from routes.db_api import db_api_bp
from routes.ml import ml_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": Config.ALLOWED_ORIGINS}},
    )
    app.secret_key = b"AOP_Web_Secret_Key"  # 실제 운영시 환경변수로 관리 권장
    
    # 디버그 모드에서 더 자세한 로깅 활성화
    if app.debug:
        import logging
        logging.basicConfig(level=logging.DEBUG)
        app.logger.setLevel(logging.DEBUG)
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(db_api_bp)
    app.register_blueprint(ml_bp)

    @app.teardown_appcontext
    def teardown_db(exception):
        from flask import g

        db = g.pop("db", None)
        if db is not None and hasattr(db, "close"):
            db.close()

    return app


if __name__ == "__main__":
    Config.load_config()
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
