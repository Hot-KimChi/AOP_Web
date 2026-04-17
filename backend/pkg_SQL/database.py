import os
import pyodbc
import pandas as pd
from sqlalchemy import create_engine, text
import logging
from urllib.parse import quote_plus

logger = logging.getLogger("SQL")


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
            logger.error(f"Query execution error: {str(e)}")
            raise

    def authenticate_user(self, username, password):
        """사용자 인증 함수. 계정이 활성화되어 있고 비밀번호가 일치하는지 확인합니다."""
        user_info = self.get_user_info(username)

        if not user_info:
            logger.warning("User does not exist.")
            return False

        if user_info["is_disabled"]:
            logger.warning("User account is disabled.")
            return False

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
            logger.info("Authentication successful.")
            return True
        except pyodbc.Error as e:
            logger.error(f"Authentication failed: {e}")
            return False

    def _sanitize_params_for_log(self, params):
        """로그에 출력할 때 바이너리 데이터를 안전하게 표시"""
        sanitized = []
        for param in params:
            if isinstance(param, bytes):
                sanitized.append(f"<binary_{len(param)}_bytes>")
            else:
                sanitized.append(str(param)[:50])
        return sanitized

    def _convert_params(self, params):
        """파라미터를 Python 기본 타입으로 변환 (바이너리 데이터는 유지)"""
        converted = []
        for param in params:
            if isinstance(param, bytes):
                converted.append(param)
            elif hasattr(param, "item"):  # numpy 타입
                converted.append(param.item())
            else:
                converted.append(param)
        return converted

    def execute_query(self, query, params=None, return_type=None):
        """SQL 쿼리를 실행하고 결과를 pandas DataFrame으로 반환합니다."""
        try:
            if params:
                logger.info(f"With params: {self._sanitize_params_for_log(params)}")

            with self.connect() as connection:
                query_upper = query.strip().upper()
                is_select = query_upper.startswith("SELECT") or query_upper.startswith("WITH")

                if is_select:
                    return pd.read_sql(query, connection, params=params) if params else pd.read_sql(query, connection)

                # INSERT/UPDATE/DELETE 쿼리
                raw_conn = connection.connection
                cursor = raw_conn.cursor()

                if params:
                    converted_params = self._convert_params(params)

                    insert_id = None
                    if return_type == "insert" and query_upper.startswith("INSERT"):
                        if "OUTPUT" in query_upper:
                            cursor.execute(query, tuple(converted_params))
                            result = cursor.fetchone()
                            if result and result[0] is not None:
                                insert_id = int(result[0])
                        else:
                            cursor.execute(query, tuple(converted_params))
                            cursor.execute("SELECT SCOPE_IDENTITY() AS insert_id")
                            result = cursor.fetchone()
                            if result and result[0] is not None:
                                insert_id = int(result[0])
                            else:
                                logger.warning("SCOPE_IDENTITY returned None")
                    else:
                        cursor.execute(query, tuple(converted_params))
                else:
                    cursor.execute(query)

                raw_conn.commit()
                cursor.close()

                if return_type == "insert":
                    return {"insert_id": insert_id}

                logger.info("Non-SELECT query executed successfully")
                return pd.DataFrame()
        except Exception as e:
            logger.error(f"Query execution error: {str(e)}")
            logger.error(f"Query was: {query}")
            if params:
                logger.error(f"Params were: {self._sanitize_params_for_log(params)}")
            raise

    def execute_procedure(self, procedure_name, parameters=None):
        """
        MS-SQL 저장 프로시저를 실행하고 결과를 pandas DataFrame으로 반환합니다.
        """
        raw_conn = self.engine.raw_connection()
        try:
            cursor = raw_conn.cursor()

            if parameters:
                param_placeholders = ",".join(["?" for _ in range(len(parameters))])
                query = f"EXEC {procedure_name} {param_placeholders}"

                param_values = []
                for param in parameters:
                    if isinstance(param, tuple) and len(param) == 2:
                        value, param_type = param
                        if param_type == int:
                            param_values.append(int(value) if value is not None else None)
                        elif param_type == float:
                            param_values.append(float(value) if value is not None else None)
                        elif param_type == bool:
                            param_values.append(bool(value) if value is not None else None)
                        else:
                            param_values.append(value)
                    else:
                        param_values.append(param)

                cursor.execute(query, param_values)
            else:
                query = f"EXEC {procedure_name}"
                cursor.execute(query)

            if cursor.description:
                columns = [column[0] for column in cursor.description]
                rows = cursor.fetchall()
                df = pd.DataFrame.from_records(rows, columns=columns)
            else:
                df = pd.DataFrame()

            cursor.close()
            raw_conn.commit()

            logger.info(f"Stored procedure '{procedure_name}' executed successfully")
            return df
        except Exception as e:
            logger.error(f"Stored procedure execution error: {str(e)}")
            raise
        finally:
            try:
                raw_conn.close()
            except Exception:
                pass

    def insert_data(self, table_name, data):
        """MS-SQL 테이블에 데이터를 삽입합니다."""
        try:
            with self.connect() as connection:
                data.to_sql(table_name, connection, if_exists="append", index=False)
                logger.info(f"Data inserted into [{table_name}] table")
        except Exception as e:
            logger.error(f"Data insertion error: {str(e)}")
            raise
