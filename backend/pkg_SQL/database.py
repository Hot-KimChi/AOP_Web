from sqlalchemy import create_engine, text
import pandas as pd
import os
import bcrypt


class SQL:
    def __init__(self, database=None, windows_auth=False):
        self.server = os.environ.get("SERVER_ADDRESS_ADDRESS")
        self.database = database
        self.windows_auth = windows_auth
        self.connection_string = self.create_connection_string()

    def create_connection_string(self):
        # SQLAlchemy용 연결 문자열 생성
        if self.windows_auth:
            return f"mssql+pyodbc://@{self.server}/{self.database}?driver=SQL+Server+Native+Client+11.0&trusted_connection=yes"

    def connect(self):
        # SQLAlchemy 엔진을 사용한 연결 생성
        engine = create_engine(self.connection_string)
        return engine.connect()

    def get_user_info(self, username):
        """
        사용자 정보를 데이터베이스에서 조회하는 함수
        :param username: 조회할 사용자의 username
        :return: 사용자 정보 딕셔너리 또는 None
        """
        query = text(
            """
            SELECT id, username, password 
            FROM users
            WHERE username = :username
            """
        )
        try:
            with self.connect() as connection:
                result = connection.execute(query, {"username": username})
                user = result.fetchone()
                if user:
                    return {
                        "id": user.id,
                        "username": user.username,
                        "password": user.password,
                    }
                else:
                    return None
        except Exception as e:
            print(f"Query execution error: {str(e)}")
            raise

    def verify_password(self, password, hashed_password):
        """
        비밀번호 일치 여부를 확인하는 함수
        :param password: 입력된 비밀번호
        :param hashed_password: 데이터베이스에 저장된 해시된 비밀번호
        :return: 비밀번호 일치 여부
        """
        return bcrypt.checkpw(password.encode(), hashed_password.encode())

    def execute_query(self, query):
        try:
            with self.connect() as connection:
                # SQLAlchemy 연결을 사용하여 pandas로 SQL 쿼리 실행
                return pd.read_sql(query, connection)
        except Exception as e:
            print(f"Query execution error: {str(e)}")
            raise

    def insert_data(self, table_name, data):
        """
        MS-SQL 테이블에 데이터를 삽입하는 함수
        :param table_name: 데이터를 삽입할 테이블 이름
        :param data: 삽입할 데이터. 예: {'column1': value1, 'column2': value2, ...}
        """
        try:
            with self.connect() as connection:
                # pandas를 사용하여 데이터프레임을 SQL 테이블에 삽입
                data.to_sql(table_name, connection, if_exists="append", index=False)
                print(f"Data inserted into [{table_name}] table")
        except Exception as e:
            print(f"Data insertion error: {str(e)}")
            raise
