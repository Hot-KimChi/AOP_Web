import configparser
import os


class Config:
    UPLOAD_FOLDER = "./1_uploads"
    SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "AOP_Admin_Token")
    EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 7200))
    ALLOWED_ORIGINS = ["*"]

    @staticmethod
    def load_config():
        # 현재 파일(config.py)의 디렉토리를 기준으로 config 파일 경로 설정
        current_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_dir, "AOP_config.cfg")

        config = configparser.ConfigParser()

        # config 파일이 존재하는지 확인
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file not found: {config_path}")

        config.read(config_path, encoding="utf-8")

        # config 파일이 제대로 로드되었는지 확인
        if not config.sections():
            raise ValueError(f"Config file is empty or invalid: {config_path}")

        for section in config.sections():
            for key, value in config[section].items():
                env_var_name = f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
                os.environ[env_var_name] = value

        if "database" in config and "name" in config["database"]:
            os.environ["DATABASE_NAME"] = config["database"]["name"]
