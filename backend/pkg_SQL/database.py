import os
import hashlib
import threading
import pandas as pd
from sqlalchemy import create_engine
import logging
from urllib.parse import quote_plus

logger = logging.getLogger("SQL")
ALLOWED_PROCEDURES = {"TxCompare"}

# (connection_string 해시) → Engine 캐시.
# SQLAlchemy Engine 은 스레드 세이프하며 커넥션 풀을 내장한다. 요청마다 새 엔진을
# 만들면 풀이 계속 쌓여 커넥션이 누수되고 풀링 이점도 사라지므로 재사용한다.
_ENGINE_CACHE = {}
_ENGINE_CACHE_LOCK = threading.Lock()
_ENGINE_CACHE_MAX = 32


def _get_cached_engine(connection_string: str):
    key = hashlib.sha256(connection_string.encode("utf-8")).hexdigest()
    with _ENGINE_CACHE_LOCK:
        engine = _ENGINE_CACHE.get(key)
        if engine is not None:
            # LRU 유지: 최근 사용 항목을 뒤로 보낸다.
            _ENGINE_CACHE[key] = _ENGINE_CACHE.pop(key)
            return engine

        engine = _create_engine(connection_string)
        _ENGINE_CACHE[key] = engine

        while len(_ENGINE_CACHE) > _ENGINE_CACHE_MAX:
            oldest_key = next(iter(_ENGINE_CACHE))
            evicted = _ENGINE_CACHE.pop(oldest_key)
            try:
                evicted.dispose()
            except Exception:
                logger.warning("Failed to dispose evicted engine", exc_info=True)
        return engine


def _create_engine(connection_string: str):
    return create_engine(
        connection_string,
        fast_executemany=True,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=5,
    )


class SQL:
    def __init__(self, database=None, reuse_engine: bool = True):
        """
        DB 연결은 Flask 프로세스 실행 계정의 Windows 통합 인증(Trusted_Connection)을 쓴다.
        Windows SSO 는 브라우저 사용자의 신원만 제공할 뿐 DB 비밀번호를 전달하지 않으므로,
        사용자별 SQL 자격증명을 받지 않는다. 접근 통제는 JWT + AUTH_ALLOWED_USERS 가 담당한다.

        Args:
            reuse_engine: True 면 동일 연결 문자열의 엔진을 전역 캐시에서 재사용한다.
                일회성 연결은 False 를 지정해 close() 시 즉시 폐기되게 한다.
        """
        self.database = database
        self._reuse_engine = reuse_engine

        # 서버 주소 환경 변수
        self.server = os.environ.get("SERVER_ADDRESS_ADDRESS")
        self.connection_string = self.create_connection_string()

        self.engine = (
            _get_cached_engine(self.connection_string)
            if reuse_engine
            else _create_engine(self.connection_string)
        )

    def close(self):
        """연결 자원을 정리한다.

        캐시된 엔진은 다른 요청이 함께 사용하므로 dispose 하지 않는다(풀이 연결을
        관리한다). 캐시를 쓰지 않는 일회성 엔진만 즉시 폐기한다.
        """
        if self._reuse_engine:
            return
        try:
            self.engine.dispose()
        except Exception:
            logger.warning("Failed to dispose engine", exc_info=True)

    def create_connection_string(self):
        """Windows 통합 인증 연결 문자열을 생성합니다."""
        driver = "ODBC Driver 17 for SQL Server"

        conn_str = (
            f"DRIVER={driver};"
            f"SERVER={self.server};"
            f"DATABASE={self.database};"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"
        )
        return f"mssql+pyodbc:///?odbc_connect={quote_plus(conn_str)}"

    def connect(self):
        """SQLAlchemy 엔진을 사용하여 연결을 생성합니다."""
        return self.engine.connect()

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
            if params is not None:
                logger.info(f"With params: {self._sanitize_params_for_log(params)}")

            with self.connect() as connection:
                query_upper = query.strip().upper()
                is_select = query_upper.startswith("SELECT") or query_upper.startswith("WITH")

                if is_select:
                    return (
                        pd.read_sql(query, connection, params=params)
                        if params is not None
                        else pd.read_sql(query, connection)
                    )

                # INSERT/UPDATE/DELETE 쿼리
                raw_conn = connection.connection
                cursor = raw_conn.cursor()

                if params is not None:
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
            if params is not None:
                logger.error(f"Params were: {self._sanitize_params_for_log(params)}")
            raise

    def execute_procedure(self, procedure_name, parameters=None):
        """
        MS-SQL 저장 프로시저를 실행하고 결과를 pandas DataFrame으로 반환합니다.
        """
        if procedure_name not in ALLOWED_PROCEDURES:
            raise ValueError(f"Unsupported stored procedure: {procedure_name}")

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
                data.to_sql(
                    table_name,
                    connection,
                    if_exists="append",
                    index=False,
                    chunksize=1000,
                    method="multi",
                )
                logger.info(f"Data inserted into [{table_name}] table")
        except Exception as e:
            logger.error(f"Data insertion error: {str(e)}")
            raise
