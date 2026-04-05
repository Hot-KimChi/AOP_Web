import configparser
import os


class Config:
    UPLOAD_FOLDER = "./1_uploads"
    # JWT 서명 키
    SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "AOP_Admin_Token")
    EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 7200))
    # Flask 세션 암호화 키 (운영 환경에서는 반드시 환경변수로 지정)
    FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "AOP_Web_Dev_Secret_Key")
    # CORS 허용 Origins (쉼표 구분, 미설정 시 개발 편의를 위해 * 반영)
    _origins_env = os.environ.get("ALLOWED_ORIGINS", "")
    ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]
    # 쿠키 Secure 플래그 (운영=true, 개발=false)
    COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

    @staticmethod
    def load_config():
        # 현재 파일(config.py)의 디렉토리를 기준으로 config 파일 경로 설정
        current_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_dir, "AOP_config.cfg")

        config = configparser.ConfigParser()

        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file not found: {config_path}")

        config.read(config_path, encoding="utf-8")

        if not config.sections():
            raise ValueError(f"Config file is empty or invalid: {config_path}")

        # CFG 섹션/키 → 환경변수 변환 (예: [Auth] SECRET_KEY → AUTH_SECRET_KEY)
        for section in config.sections():
            for key, value in config[section].items():
                env_var_name = f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
                os.environ[env_var_name] = value

        if "database" in config and "name" in config["database"]:
            os.environ["DATABASE_NAME"] = config["database"]["name"]

        # 클래스 속성은 import 시점에 평가되므로, CFG 로드 후 재적용
        Config.SECRET_KEY      = os.environ.get("AUTH_SECRET_KEY", "AOP_Admin_Token")
        Config.EXPIRE_TIME     = int(os.environ.get("AUTH_EXPIRE_TIME", 7200))
        Config.FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "AOP_Web_Dev_Secret_Key")
        Config.COOKIE_SECURE   = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
        _origins = os.environ.get("ALLOWED_ORIGINS", "")
        Config.ALLOWED_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()] or ["*"]
