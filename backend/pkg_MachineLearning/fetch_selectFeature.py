import os
import pandas as pd
from pkg_SQL.database import SQL
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import session, g


def fetchData():
    # 데이터베이스에서 데이터를 가져오는 함수 (병렬 처리)
    # session에서 인증 정보 가져오기
    username = session.get("username")
    password = session.get("password")

    if not username or not password:
        raise ValueError("세션에 사용자 인증 정보가 없습니다.")

    server_address = os.environ.get("SERVER_ADDRESS_ADDRESS")
    databases_ML = os.environ.get("DATABASE_ML_NAME")

    if not all([server_address, databases_ML]):
        raise ValueError("필수 환경변수가 설정되지 않았습니다. (SERVER_ADDRESS, DB_ML)")

    list_database = databases_ML.split(",")
    print(f"연결할 데이터베이스 목록: {list_database}")

    def fetch_one_db(db):
        print(f"[{db}] 데이터베이스 연결 중...")
        sql_connection = None
        try:
            sql_connection = SQL(username, password, db)
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
            Raw_data = sql_connection.execute_query(query)
            print(Raw_data["probeName"].value_counts(dropna=False))
            return Raw_data
        except Exception as e:
            print(f"[ERROR] {db} DB 처리 중 오류 발생: {e}")
            return None
        finally:
            if sql_connection and hasattr(sql_connection, "engine"):
                sql_connection.engine.dispose()

    SQL_get_data = []
    with ThreadPoolExecutor(max_workers=min(8, len(list_database))) as executor:
        future_to_db = {executor.submit(fetch_one_db, db): db for db in list_database}
        for future in as_completed(future_to_db):
            result = future.result()
            if result is not None:
                SQL_get_data.append(result)
    return SQL_get_data


def merge_selectionFeature():
    SQL_get_data = fetchData()
    # 결합할 데이터프레임 list: SQL_get_data
    AOP_data = pd.concat(SQL_get_data, ignore_index=True)

    # 결측치 제거 및 대체
    AOP_data["probeRadiusCm"] = AOP_data["probeRadiusCm"].fillna(0)
    AOP_data["probeElevAperCm1"] = AOP_data["probeElevAperCm1"].fillna(0)
    AOP_data["probeElevFocusRangCm1"] = AOP_data["probeElevFocusRangCm1"].fillna(0)
    AOP_data = AOP_data.drop(AOP_data[AOP_data["beamstyleIndex"] == 12].index)
    AOP_data = AOP_data.dropna()

    print(AOP_data.count())

    # CSV 파일을 pkg_MachineLearning/SQL_get_Data 하위에 저장
    import os
    from datetime import datetime

    output_dir = os.path.join(os.path.dirname(__file__), "SQL_get_Data")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"{now}_Intensity_SQL_Get_Data.csv"
    output_path = os.path.join(output_dir, output_filename)
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
