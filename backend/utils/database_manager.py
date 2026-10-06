"""
중앙집중화된 데이터베이스 매니저
모든 DB 연결 로직을 통합 관리하여 코드 중복 제거

DB 연결은 Flask 프로세스 실행 계정의 Windows 통합 인증을 사용한다.
Windows SSO 는 사용자의 DB 비밀번호를 전달하지 않으므로 사용자별 SQL 자격증명은 없다.
대신 연결 시점에 JWT 로 인증된 사용자(`g.current_user`)가 있는지 확인해,
인증을 거치지 않은 경로가 서비스 계정 권한으로 DB 에 접근하는 것을 막는다.
"""

import os
import logging
from flask import g, has_request_context
from pkg_SQL.database import SQL
from typing import Optional
from utils.error_handler import CredentialsRequired


def get_current_username() -> Optional[str]:
    """`require_auth` 가 JWT 에서 확정한 현재 사용자(DOMAIN\\user). 없으면 None."""
    if not has_request_context():
        return None
    return getattr(g, "current_user", None)


def require_current_username() -> str:
    """인증된 사용자 컨텍스트가 없으면 CredentialsRequired(401) 를 던진다."""
    username = get_current_username()
    if not username:
        raise CredentialsRequired("인증된 사용자 컨텍스트 없이 DB 접근이 시도되었습니다.")
    return username


class DatabaseManager:
    """
    중앙집중화된 데이터베이스 연결 관리자
    - Windows 통합 인증(Flask 프로세스 계정) 기반 연결
    - 요청 단위 연결 캐싱 (Flask g 컨텍스트)
    - 에러 처리 통합
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._instance.logger = logging.getLogger("DatabaseManager")
        return cls._instance

    def get_connection(self, database: Optional[str] = None) -> SQL:
        """
        인증된 요청에 대해 Windows 통합 인증 DB 연결을 반환합니다.

        Args:
            database (str, optional): 데이터베이스명. None이면 환경변수 기본값 사용

        Raises:
            CredentialsRequired: 인증된 사용자 컨텍스트가 없을 때 (401 로 변환됨)
        """
        username = require_current_username()

        if database is None:
            database = self._get_default_database()

        # 연결 자체는 프로세스 계정 기준이므로 DB별로 요청 단위 캐싱한다.
        if hasattr(g, "db_connections") and database in g.db_connections:
            return g.db_connections[database]

        connection = SQL(database=database)

        if not hasattr(g, "db_connections"):
            g.db_connections = {}
        g.db_connections[database] = connection

        self.logger.info(
            f"Database connection created: {database} for user {username}"
        )
        return connection

    def get_mlflow_connection(self) -> SQL:
        """MLflow 전용 데이터베이스 연결 반환"""
        return self.get_connection("AOP_MLflow_Tracking")

    def get_aop_connection(self) -> SQL:
        """AOP 메인 데이터베이스 연결 반환"""
        return self.get_connection()

    def execute_query(self, query: str, params: tuple = None, database: str = None):
        """
        쿼리 실행 (연결 자동 관리)

        Args:
            query (str): SQL 쿼리
            params (tuple): 쿼리 매개변수
            database (str): 대상 데이터베이스

        Returns:
            쿼리 결과 DataFrame
        """
        connection = self.get_connection(database)
        if params:
            return connection.execute_query(query, params)
        return connection.execute_query(query)

    def _get_default_database(self) -> str:
        """환경변수에서 기본 데이터베이스명 가져오기"""
        return os.environ.get("DEFAULT_DATABASE", "AOP_Database")

    @staticmethod
    def close_connections():
        """Flask 요청 종료 시 연결 정리"""
        if hasattr(g, "db_connections"):
            for connection_key, connection in g.db_connections.items():
                try:
                    if hasattr(connection, "close"):
                        connection.close()
                except Exception as e:
                    logging.error(f"Failed to close connection {connection_key}: {e}")
            g.db_connections = {}


# 전역 싱글톤 인스턴스
db_manager = DatabaseManager()


# 편의 함수들
def get_db_connection(database: str = None) -> SQL:
    """데이터베이스 연결 가져오기"""
    return db_manager.get_connection(database)


def get_mlflow_db() -> SQL:
    """MLflow 데이터베이스 연결 가져오기"""
    return db_manager.get_mlflow_connection()


def get_aop_db() -> SQL:
    """AOP 메인 데이터베이스 연결 가져오기"""
    return db_manager.get_aop_connection()


def execute_query(query: str, params: tuple = None, database: str = None):
    """쿼리 실행"""
    return db_manager.execute_query(query, params, database)
