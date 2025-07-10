import configparser
from contextlib import contextmanager
import os
from pkg_SQL.database import SQL


class DatabaseManager:
    def __init__(self):
        self.config = self._load_db_config()

    def _load_db_config(self):
        config = configparser.ConfigParser()
        config_path = os.path.join(".", "backend", "AOP_config.cfg")
        config.read(config_path)
        return config

    @contextmanager
    def get_connection(self, username: str, password: str, database: str):
        connection = SQL(username, password, database)
        try:
            yield connection
        finally:
            if connection and hasattr(connection, "close"):
                connection.close()
