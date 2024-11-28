import os
import pyodbc
import pandas as pd
import bcrypt
from sqlalchemy import create_engine, text
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class SQL:
    def __init__(self, database=None, windows_auth=False):
        self.server = os.environ.get("SERVER_ADDRESS_ADDRESS")  # 서버 주소 환경 변수
        self.database = database
        self.windows_auth = windows_auth
        self.connection_string = self.create_connection_string()
        self.engine = create_engine(
            self.connection_string
        )  # SQLAlchemy 엔진을 초기화 시점에 한 번만 생성

    def create_connection_string(self):
        """연결 문자열을 생성합니다."""
        driver = "ODBC+Driver+17+for+SQL+Server"

        if self.windows_auth:
            # 윈도우 인증 사용
            return f"mssql+pyodbc://@{self.server}/{self.database}?driver={driver}&trusted_connection=yes&timeout=30"
        else:
            # 사용자 인증 사용
            return f"mssql+pyodbc://username:password@{self.server}/{self.database}?driver={driver}&timeout=30"

    def connect(self):
        """SQLAlchemy 엔진을 사용하여 연결을 생성합니다."""
        return self.engine.connect()

    def get_user_info(self, username):
        """사용자 정보를 데이터베이스에서 조회합니다."""
        query = text(
            """
            SELECT name, sid, is_disabled, create_date, modify_date
            FROM sys.sql_logins
            WHERE name = :username
            """
        )
        try:
            with self.connect() as connection:
                result = connection.execute(query, {"username": username})
                user = result.fetchone()
                if user:
                    return {
                        "username": user.name,
                        "sid": user.sid,
                        "is_disabled": user.is_disabled,
                        "create_date": user.create_date,
                        "modify_date": user.modify_date,
                    }
                else:
                    return None
        except Exception as e:
            logging.error(f"Query execution error: {str(e)}")
            raise

    def authenticate_user(self, username, password):
        """사용자 인증 함수. 계정이 활성화되어 있고 비밀번호가 일치하는지 확인합니다."""
        user_info = self.get_user_info(username)

        if not user_info:
            logging.warning("User does not exist.")
            return False

        if user_info["is_disabled"]:
            logging.warning("User account is disabled.")
            return False

        # 비밀번호를 실제로 확인하기 위해 DB 연결 시도
        try:
            connection_string = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={self.server};"
                f"DATABASE=master;"
                f"UID={username};"
                f"PWD={password};"
            )
            connection = pyodbc.connect(connection_string)
            connection.close()
            logging.info("Authentication successful.")
            return True
        except pyodbc.Error as e:
            logging.error(f"Authentication failed: {e}")
            return False

    def verify_password(self, password, hashed_password):
        """비밀번호 일치 여부를 확인합니다."""
        return bcrypt.checkpw(password.encode(), hashed_password.encode())

    def execute_query(self, query):
        """SQL 쿼리를 실행하고 결과를 pandas DataFrame으로 반환합니다."""
        try:
            with self.connect() as connection:
                return pd.read_sql(query, connection)
        except Exception as e:
            logging.error(f"Query execution error: {str(e)}")
            raise

    def insert_data(self, table_name, data):
        """MS-SQL 테이블에 데이터를 삽입합니다."""
        try:
            with self.connect() as connection:
                data.to_sql(table_name, connection, if_exists="append", index=False)
                logging.info(f"Data inserted into [{table_name}] table")
        except Exception as e:
            logging.error(f"Data insertion error: {str(e)}")
            raise
