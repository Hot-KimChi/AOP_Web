"""
중앙집중화된 데이터베이스 매니저
모든 DB 연결 로직을 통합 관리하여 코드 중복 제거
"""

import os
import logging
from flask import session, g
from pkg_SQL.database import SQL
from typing import Optional, Union


class DatabaseManager:
    """
    중앙집중화된 데이터베이스 연결 관리자
    - 세션 기반 자동 인증
    - 연결 풀링 및 재사용
    - 에러 처리 통합
    """

    _instance = None
    _connections = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._instance.logger = logging.getLogger("DatabaseManager")
        return cls._instance

    def get_connection(self, database: Optional[str] = None) -> SQL:
        """
        데이터베이스 연결 반환 (자동 인증 및 캐싱)

        Args:
            database (str, optional): 데이터베이스명. None이면 환경변수 기본값 사용

        Returns:
            SQL: 데이터베이스 연결 객체

        Raises:
            ValueError: 인증 정보가 없거나 연결 실패 시
        """
        try:
            # 1. 세션에서 인증 정보 가져오기
            username = session.get("username")
            password = session.get("password")

            if not username or not password:
                raise ValueError("세션에 사용자 인증 정보가 없습니다.")

            # 2. 데이터베이스명 결정
            if database is None:
                database = self._get_default_database()

            # 3. 연결 키 생성 (사용자별 + DB별 캐싱)
            connection_key = f"{username}:{database}"

            # 4. 기존 연결 재사용 (Flask g 컨텍스트 활용)
            if hasattr(g, "db_connections") and connection_key in g.db_connections:
                return g.db_connections[connection_key]

            # 5. 새 연결 생성
            connection = SQL(username=username, password=password, database=database)

            # 6. Flask g 컨텍스트에 캐싱
            if not hasattr(g, "db_connections"):
                g.db_connections = {}
            g.db_connections[connection_key] = connection

            self.logger.info(
                f"Database connection created: {database} for user {username}"
            )
            return connection

        except Exception as e:
            self.logger.error(f"Failed to create database connection: {e}")
            raise

    def get_mlflow_connection(self) -> SQL:
        """MLflow 전용 데이터베이스 연결 반환"""
        return self.get_connection("AOP_MLflow_Tracking")

    def get_aop_connection(self) -> SQL:
        """AOP 메인 데이터베이스 연결 반환"""
        # AOP 메인 DB명은 환경변수나 설정에서 가져오기
        return self.get_connection()

    def execute_query(self, query: str, params: tuple = None, database: str = None):
        """
        쿼리 실행 (연결 자동 관리)

        Args:
            query (str): SQL 쿼리
            params (tuple): 쿼리 매개변수
            database (str): 대상 데이터베이스

        Returns:
            쿼리 결과
        """
        try:
            connection = self.get_connection(database)

            if params:
                return connection.execute_query(query, params)
            else:
                return connection.execute_query(query)

        except Exception as e:
            self.logger.error(f"Query execution failed: {e}")
            self.logger.error(f"Query: {query}")
            if params:
                self.logger.error(f"Params: {params}")
            raise

    def _get_default_database(self) -> str:
        """환경변수에서 기본 데이터베이스명 가져오기"""
        # 기본값 또는 환경변수에서 가져오기
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

            # g에서 연결 정보 제거
            g.db_connections = {}


# 전역 인스턴스 (싱글톤)
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
