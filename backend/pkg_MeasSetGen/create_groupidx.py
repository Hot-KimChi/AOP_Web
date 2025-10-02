import pandas as pd
from pkg_SQL.database import SQL
from flask import jsonify, session

# Pandas 다운캐스팅 옵션 설정
pd.set_option("future.no_silent_downcasting", True)


class GroupIdx:
    """
    create groupIndex for making LUT
    """

    def __init__(self, probeId, database, df=None):
        self.probeId = probeId
        self.database = database

        self.username = session.get("username")
        self.password = session.get("password")

        if not self.username or not self.password:
            return jsonify({"error": "User not authenticated"}), 401

    def getGroupIdx(self):
        ## 데이터베이스에서 마지막 groupIndex 값 load
        try:
            connect = SQL(
                username=self.username, password=self.password, database=self.database
            )
            query = f"""
                SELECT MAX(groupIndex) AS maxGroupIndex from meas_setting
                where probeid = {self.probeId}
            """
            maxGroupIdx_df = connect.execute_query(query)
            maxGroupIdx = maxGroupIdx_df["maxGroupIndex"].iloc[0]

            return maxGroupIdx if maxGroupIdx is not None else 0

        except Exception as e:
            pass
            # 오류 발생 시 0을 반환하여 1부터 시작하도록 함
            return 0

    def createGroupIdx(self, df):
        # GroupIndex 열 생성
        last_groupIdx = self.getGroupIdx()

        group_index = last_groupIdx + 1
        group_indices = []
        prev_value = None
        for value in df["TxFocusLocCm"]:
            if prev_value is None or value >= prev_value:
                group_indices.append(group_index)
            else:
                group_index += 1
                group_indices.append(group_index)
            prev_value = value
        df["GroupIndex"] = group_indices

        return df

    def updateDuplicate(self, df):
        # 각 GroupIndex 내에서 하나라도 isDuplicate가 0이면 해당 그룹의 모든 isDuplicate를 0으로 설정

        df["isDuplicate"] = df.groupby("GroupIndex")["isDuplicate"].transform(
            lambda x: 0 if 0 in x.values else 1
        )

        return df
