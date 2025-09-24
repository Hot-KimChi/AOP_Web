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

    def execute_query(self, query, params=None, return_type=None):
        """SQL 쿼리를 실행하고 결과를 pandas DataFrame으로 반환합니다."""
        try:
            # logging.info(f"Executing query: {query[:100]}...")
            if params:
                # 바이너리 데이터가 포함된 경우 로그에서 제외
                log_params = []
                for i, param in enumerate(params):
                    if isinstance(param, bytes):
                        log_params.append(f"<binary_data_{len(param)}_bytes>")
                    else:
                        log_params.append(str(param)[:50])
                logging.info(f"With params: {log_params}")

            with self.connect() as connection:
                # 쿼리 타입 확인 (SELECT vs INSERT/UPDATE/DELETE)
                query_upper = query.strip().upper()
                if query_upper.startswith("SELECT"):
                    # SELECT 쿼리는 pandas DataFrame으로 반환
                    if params:
                        # pyodbc 스타일의 ? 플레이스홀더 사용
                        return pd.read_sql(query, connection, params=params)
                    else:
                        return pd.read_sql(query, connection)
                else:
                    # INSERT/UPDATE/DELETE 쿼리는 raw connection 사용
                    if params:
                        # 파라미터를 Python 기본 타입으로 변환 (바이너리 데이터는 그대로 유지)
                        converted_params = []
                        for param in params:
                            if isinstance(param, bytes):
                                # 바이너리 데이터는 그대로 전달
                                converted_params.append(param)
                            elif hasattr(param, "item"):  # numpy 타입인 경우
                                converted_params.append(param.item())
                            else:
                                converted_params.append(param)

                        # raw connection 사용해서 직접 실행
                        raw_conn = connection.connection
                        cursor = raw_conn.cursor()

                        # INSERT 쿼리 실행 및 ID 반환
                        insert_id = None
                        if return_type == "insert" and query_upper.startswith("INSERT"):
                            # OUTPUT 절이 있는지 확인
                            if "OUTPUT" in query_upper:
                                # OUTPUT 절이 있으면 직접 결과를 가져옴
                                cursor.execute(query, tuple(converted_params))
                                result = cursor.fetchone()
                                logging.info(f"OUTPUT INSERT result: {result}")
                                if result and result[0] is not None:
                                    insert_id = int(result[0])
                                    logging.info(
                                        f"Extracted insert_id from OUTPUT: {insert_id}"
                                    )
                            else:
                                # OUTPUT 절이 없으면 SCOPE_IDENTITY 방식 사용
                                cursor.execute(query, tuple(converted_params))
                                cursor.execute("SELECT SCOPE_IDENTITY() AS insert_id")
                                result = cursor.fetchone()
                                logging.info(f"SCOPE_IDENTITY result: {result}")
                                if result and result[0] is not None:
                                    insert_id = int(result[0])
                                    logging.info(f"Extracted insert_id: {insert_id}")
                                else:
                                    logging.warning(
                                        "SCOPE_IDENTITY returned None or empty"
                                    )
                        else:
                            cursor.execute(query, tuple(converted_params))

                        raw_conn.commit()
                        cursor.close()

                        if return_type == "insert":
                            if insert_id:
                                return {"insert_id": insert_id}
                            else:
                                # INSERT는 성공했지만 ID를 가져오지 못한 경우
                                logging.warning(
                                    "INSERT succeeded but could not retrieve ID"
                                )
                                return {"insert_id": None}
                    else:
                        raw_conn = connection.connection
                        cursor = raw_conn.cursor()
                        cursor.execute(query)
                        raw_conn.commit()
                        cursor.close()

                    logging.info(f"Non-SELECT query executed successfully")
                    return pd.DataFrame()
        except Exception as e:
            logging.error(f"Query execution error: {str(e)}")
            logging.error(f"Query was: {query}")
            if params:
                # 에러 로그에서도 바이너리 데이터 크기만 표시
                error_params = []
                for param in params:
                    if isinstance(param, bytes):
                        error_params.append(f"<binary_data_{len(param)}_bytes>")
                    else:
                        error_params.append(str(param)[:100])
                logging.error(f"Params were: {error_params}")
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
