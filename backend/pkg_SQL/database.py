import os
import pyodbc
import pandas as pd
import bcrypt
from sqlalchemy import create_engine, text
import logging
from urllib.parse import quote_plus

# 로깅 설정
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class SQL:
    def __init__(self, username, password, database=None):
        self.username = username
        self.password = password
        self.database = database

        # 서버 주소 환경 변수
        self.server = os.environ.get("SERVER_ADDRESS_ADDRESS")
        self.connection_string = self.create_connection_string()

        # SQLAlchemy 엔진을 초기화 시점에 한 번만 생성
        self.engine = create_engine(self.connection_string)

    def create_connection_string(self):
        """연결 문자열을 생성합니다."""
        driver = "ODBC Driver 17 for SQL Server"

        # 사용자 인증 사용
        conn_str = (
            f"DRIVER={driver};"
            f"SERVER={self.server};"
            f"DATABASE={self.database};"
            f"UID={self.username};"
            f"PWD={self.password};"
            "TrustServerCertificate=yes;"
        )
        return f"mssql+pyodbc:///?odbc_connect={quote_plus(conn_str)}"

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

    def execute_procedure(self, procedure_name, parameters=None):
        """
        MS-SQL 저장 프로시저를 실행하고 결과를 pandas DataFrame으로 반환합니다.

        Args:
            procedure_name (str): 실행할 저장 프로시저 이름
            parameters (list or tuple, optional): 저장 프로시저에 전달할 파라미터들
                각 파라미터는 (값, 타입) 형태의 튜플로 제공하거나 값만 제공할 수 있습니다.
                예: [(1, int), ('test', str)] 또는 [1, 'test']

        Returns:
            pandas.DataFrame: 저장 프로시저 실행 결과
        """
        try:
            # 기존 연결(SQLAlchemy 엔진)으로부터 pyodbc 연결 객체 가져오기
            raw_conn = self.engine.raw_connection()
            cursor = raw_conn.cursor()

            if parameters:
                # 매개변수 처리를 위한 준비
                param_placeholders = ",".join(["?" for _ in range(len(parameters))])
                query = f"EXEC {procedure_name} {param_placeholders}"

                # 매개변수 값들만 추출하여 전달 (타입 변환은 pyodbc에 맡김)
                param_values = []
                for param in parameters:
                    if isinstance(param, tuple) and len(param) == 2:
                        value, param_type = param

                        # 특정 타입으로 변환
                        if param_type == int:
                            param_values.append(
                                int(value) if value is not None else None
                            )
                        elif param_type == float:
                            param_values.append(
                                float(value) if value is not None else None
                            )
                        elif param_type == bool:
                            param_values.append(
                                bool(value) if value is not None else None
                            )
                        else:  # str 등 다른 타입은 그대로 전달
                            param_values.append(value)
                    else:
                        # 타입이 명시되지 않은 경우 그대로 사용
                        param_values.append(param)

                # 저장 프로시저 실행
                cursor.execute(query, param_values)
            else:
                # 파라미터가 없는 경우
                query = f"EXEC {procedure_name}"
                cursor.execute(query)

            # 결과가 있는 경우 처리
            if cursor.description:
                # 컬럼 이름 가져오기
                columns = [column[0] for column in cursor.description]
                # 모든 행 가져오기
                rows = cursor.fetchall()
                # DataFrame 생성
                df = pd.DataFrame.from_records(rows, columns=columns)
            else:
                # 결과가 없는 경우 빈 DataFrame 반환
                df = pd.DataFrame()

            # 커서 닫기
            cursor.close()

            # 변경 사항 커밋
            raw_conn.commit()

            logging.info(f"Stored procedure '{procedure_name}' executed successfully")
            return df
        except Exception as e:
            logging.error(f"Stored procedure execution error: {str(e)}")
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
