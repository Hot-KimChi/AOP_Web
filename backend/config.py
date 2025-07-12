import configparser
import os


class Config:
    UPLOAD_FOLDER = "./1_uploads"
    SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "AOP_Admin_Token")
    EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 7200))
    ALLOWED_ORIGINS = ["*"]

    @staticmethod
    def load_config():
        config_path = os.path.join(".", "backend", "AOP_config.cfg")
        config = configparser.ConfigParser()
        config.read(config_path)
        for section in config.sections():
            for key, value in config[section].items():
                env_var_name = f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
                os.environ[env_var_name] = value
        if "database" in config and "name" in config["database"]:
            os.environ["DATABASE_NAME"] = config["database"]["name"]
