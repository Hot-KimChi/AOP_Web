import os
import pandas as pd
from pkg_SQL.database import SQL


def fetchData():
    # 데이터베이스에서 데이터를 가져오는 함수
    # 환경변수 이름을 기존 설정과 맞춤
    server_address = os.environ.get("SERVER_ADDRESS_ADDRESS") or os.environ.get(
        "SERVER_ADDRESS"
    )
    ID = os.environ.get("USER_NAME")
    password = os.environ.get("PASSWORD")
    databases = os.environ.get("DB_ML") or os.environ.get("DATABASE_NAME", "")

    if not all([server_address, ID, password, databases]):
        raise ValueError(
            "필수 환경변수가 설정되지 않았습니다. (SERVER_ADDRESS, USER_NAME, PASSWORD, DB_ML)"
        )

    list_database = databases.split(",")

    print(f"연결할 데이터베이스 목록: {list_database}")

    SQL_list = []
    # K2, Juniper, NX3, NX2 and FROSK
    for db in list_database:
        print(f"[{db}] 데이터베이스 연결 중...")

        # 기존 SQL 클래스 사용
        sql_connection = SQL(ID, password, db)

        query = f"""
            SELECT * FROM
            (
            SELECT a.[measSetId]
            ,a.[probeId]
            ,a.[beamstyleIndex]
            ,a.[txFrequencyHz]
            ,a.[focusRangeCm]
            ,a.[numTxElements]
            ,a.[txpgWaveformStyle]
            ,a.[numTxCycles]
            ,a.[elevAperIndex]
            ,a.[IsTxAperModulationEn]
            ,d.[probeName]
            ,d.[probePitchCm]
            ,d.[probeRadiusCm]
            ,d.[probeElevAperCm0]
            ,d.[probeElevAperCm1]
            ,d.[probeElevFocusRangCm]
            ,d.[probeElevFocusRangCm1]
            ,b.[measResId]
            ,b.[zt]
            ,ROW_NUMBER() over (partition by a.measSetId order by b.measResId desc) as RankNo
            FROM meas_setting AS a
            LEFT JOIN meas_res_summary AS b
                ON a.[measSetId] = b.[measSetId]
            LEFT JOIN meas_station_setup AS c
                ON b.[measSSId] = c.[measSSId]
            LEFT JOIN probe_geo AS d
                ON a.[probeId] = d.[probeId]
            where b.[isDataUsable] ='yes' and c.[measPurpose] like '%Beamstyle%' and b.[errorDataLog] = ''
            ) T
            where RankNo = 1
            order by 1
            """

        # SQL 클래스의 execute_query 메서드 사용
        Raw_data = sql_connection.execute_query(query)
        print(Raw_data["probeName"].value_counts(dropna=False))
        SQL_list.append(Raw_data)
        # SQL 클래스는 자동으로 연결 해제됨

    return SQL_list


def merge_selectionFeature():
    SQL_list = fetchData()
    # 결합할 데이터프레임 list: SQL_list
    AOP_data = pd.concat(SQL_list, ignore_index=True)

    # 결측치 제거 및 대체
    AOP_data["probeRadiusCm"] = AOP_data["probeRadiusCm"].fillna(0)
    AOP_data["probeElevAperCm1"] = AOP_data["probeElevAperCm1"].fillna(0)
    AOP_data["probeElevFocusRangCm1"] = AOP_data["probeElevFocusRangCm1"].fillna(0)
    AOP_data = AOP_data.drop(AOP_data[AOP_data["beamstyleIndex"] == 12].index)
    AOP_data = AOP_data.dropna()

    print(AOP_data.count())

    # CSV 파일을 적절한 경로에 저장
    import os

    output_dir = os.path.join(os.path.dirname(__file__), "..", "1_uploads")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "AOP_Raw_data.csv")
    AOP_data.to_csv(output_path, index=False)
    print(f"데이터가 저장되었습니다: {output_path}")

    feature_list = [
        "txFrequencyHz",
        "focusRangeCm",
        "numTxElements",
        "txpgWaveformStyle",
        "numTxCycles",
        "elevAperIndex",
        "IsTxAperModulationEn",
        "probePitchCm",
        "probeRadiusCm",
        "probeElevAperCm0",
        "probeElevAperCm1",
        "probeElevFocusRangCm",
        "probeElevFocusRangCm1",
    ]
    # feature 2개 추가.
    data = AOP_data[feature_list].to_numpy()
    target = AOP_data["zt"].to_numpy()

    return data, target
