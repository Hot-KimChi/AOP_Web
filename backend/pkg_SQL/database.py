import pyodbc
import pandas as pd
import os


class SQL:
    def __init__(self, database=None, windows_auth=False):
        self.server = os.environ.get("SERVER_ADDRESS_ADDRESS")
        # self.database = os.environ.get("DATABASE_NAME")
        self.database = database
        self.windows_auth = windows_auth

    def connect(self):
        if self.windows_auth:
            conn_str = f"DRIVER={{SQL Server}};SERVER={self.server};DATABASE={self.database};Trusted_Connection=yes;"
        return pyodbc.connect(conn_str)

    # def sql_execute(self, query, params=None):
    #     conn = self.connect()
    #     cursor = conn.cursor()

    #     if params:
    #         cursor.execute(query, params)
    #     else:
    #         cursor.execute(query)

    #     conn.commit()
    #     conn.close()

    def execute_query(self, query):
        try:
            return pd.read_sql(query, self.connect())
        except Exception as e:
            print(f"Query execution error: {str(e)}")
            raise
