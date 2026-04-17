import logging
import pandas as pd
from pkg_SQL.database import SQL
from flask import session

# Pandas 다운캐스팅 옵션 설정
pd.set_option("future.no_silent_downcasting", True)

logger = logging.getLogger("GroupIdx")


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
            raise ValueError("User not authenticated")

    def getGroupIdx(self):
        ## 데이터베이스에서 마지막 groupIndex 값 load
        try:
            connect = SQL(
                username=self.username, password=self.password, database=self.database
            )
            # SQL 인젝션 방지: 파라미터화된 쿼리 사용
            query = """
                SELECT MAX(groupIndex) AS maxGroupIndex from meas_setting
                where probeid = ?
            """
            maxGroupIdx_df = connect.execute_query(query, (self.probeId,))
            maxGroupIdx = maxGroupIdx_df["maxGroupIndex"].iloc[0]

            return maxGroupIdx if maxGroupIdx is not None else 0

        except Exception as e:
            # 오류 발생 시 0을 반환하여 1부터 시작하도록 함
            logger.warning(f"getGroupIdx 오류 발생, 기본값 0 반환: {e}")
            return 0

    def createGroupIdx(self, df):
        # GroupIndex 열 생성 — 벡터화 방식 (for 루프 대비 10x+ 빠름)
        last_groupIdx = self.getGroupIdx()

        # TxFocusLocCm이 이전 값보다 작아지는 지점에서 그룹 증가
        decreased = df["TxFocusLocCm"] < df["TxFocusLocCm"].shift()
        df["GroupIndex"] = decreased.fillna(False).cumsum() + last_groupIdx + 1

        return df

    def updateDuplicate(self, df):
        # 각 GroupIndex 내에서 하나라도 isDuplicate가 0이면 해당 그룹의 모든 isDuplicate를 0으로 설정

        df["isDuplicate"] = df.groupby("GroupIndex")["isDuplicate"].transform(
            lambda x: 0 if 0 in x.values else 1
        )

        return df
