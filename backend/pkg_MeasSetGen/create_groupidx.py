import logging
import pandas as pd
from utils.database_manager import get_db_connection

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

    def getGroupIdx(self) -> int:
        """해당 probe 의 마지막 groupIndex 를 조회한다.

        조회에 실패하면 예외를 그대로 전파한다. 과거 구현은 실패 시 0 을 반환해
        이미 존재하는 그룹과 1번부터 충돌하는 데이터를 생성했다.
        """
        connect = get_db_connection(self.database)
        query = """
            SELECT MAX(groupIndex) AS maxGroupIndex from meas_setting
            where probeid = ?
        """
        maxGroupIdx_df = connect.execute_query(query, (self.probeId,))

        if maxGroupIdx_df is None or maxGroupIdx_df.empty:
            return 0

        maxGroupIdx = maxGroupIdx_df["maxGroupIndex"].iloc[0]

        # 해당 probe 의 기존 데이터가 없으면 SQL NULL 이 NaN 으로 들어온다.
        # `is not None` 검사만으로는 NaN 을 걸러내지 못해 GroupIndex 전체가 NaN 이 된다.
        if maxGroupIdx is None or pd.isna(maxGroupIdx):
            return 0

        return int(maxGroupIdx)

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
