# import pyodbc
# import pandas as pd
# import os


# class SQL:
#     def __init__(self, database=None, windows_auth=False):
#         self.server = os.environ.get("SERVER_ADDRESS_ADDRESS")
#         # self.database = os.environ.get("DATABASE_NAME")
#         self.database = database
#         self.windows_auth = windows_auth

#     def connect(self):
#         if self.windows_auth:
#             conn_str = f"DRIVER={{SQL Server}};SERVER={self.server};DATABASE={self.database};Trusted_Connection=yes;"
#         return pyodbc.connect(conn_str)

#     # def sql_execute(self, query, params=None):
#     #     conn = self.connect()
#     #     cursor = conn.cursor()

#     #     if params:
#     #         cursor.execute(query, params)
#     #     else:
#     #         cursor.execute(query)

#     #     conn.commit()
#     #     conn.close()

#     def execute_query(self, query):
#         try:
#             return pd.read_sql(query, self.connect())
#         except Exception as e:
#             print(f"Query execution error: {str(e)}")
#             raise


from sqlalchemy import create_engine
import pandas as pd
import os


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

    def execute_query(self, query):
        try:
            with self.connect() as connection:
                # SQLAlchemy 연결을 사용하여 pandas로 SQL 쿼리 실행
                return pd.read_sql(query, connection)
        except Exception as e:
            print(f"Query execution error: {str(e)}")
            raise
