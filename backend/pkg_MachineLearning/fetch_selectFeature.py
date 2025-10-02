import os
import pandas as pd
from pkg_SQL.database import SQL
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import session, g
from utils.database_manager import get_db_connection


def fetchData():
    # 데이터베이스에서 데이터를 가져오는 함수 (병렬 처리)
    # session에서 인증 정보 가져오기 (메인 스레드에서 미리 추출)
    username = session.get("username")
    password = session.get("password")

    if not username or not password:
        raise ValueError("세션에 사용자 인증 정보가 없습니다.")

    # config 모듈을 통해 설정 로드
    try:
        from config import Config

        Config.load_config()

        server_address = os.environ.get("SERVER_ADDRESS_ADDRESS")
        databases_ML = os.environ.get("DATABASE_ML_NAME")

    except Exception as e:
        pass

    if not all([server_address, databases_ML]):
        raise ValueError(
            "필수 설정이 없습니다. AOP_config.cfg를 확인하세요. (SERVER_ADDRESS, DATABASE_ML_NAME)"
        )

    list_database = databases_ML.split(",")

    def fetch_one_db(db, auth_username, auth_password):
        sql_connection = None
        try:
            # DatabaseManager를 직접 사용하지 않고 SQL 객체 직접 생성
            from pkg_SQL.database import SQL

            sql_connection = SQL(auth_username, auth_password, db)

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

            if Raw_data is None or Raw_data.empty:
                return None
            else:
                return Raw_data

        except Exception as e:
            return None
        finally:
            if sql_connection and hasattr(sql_connection, "engine"):
                sql_connection.engine.dispose()

    SQL_get_data = []
    with ThreadPoolExecutor(max_workers=min(8, len(list_database))) as executor:
        # 인증 정보를 각 스레드에 전달
        future_to_db = {
            executor.submit(fetch_one_db, db, username, password): db
            for db in list_database
        }
        for future in as_completed(future_to_db):
            result = future.result()
            if result is not None and not result.empty:
                SQL_get_data.append(result)
    return SQL_get_data


def merge_selectionFeature():
    SQL_get_data = fetchData()

    # 수집된 데이터가 없는 경우 예외 발생
    if not SQL_get_data:
        raise ValueError(
            "데이터베이스에서 사용 가능한 데이터를 찾을 수 없습니다. 데이터베이스 연결 또는 쿼리 조건을 확인하세요."
        )

    # 결합할 데이터프레임 list: SQL_get_data
    AOP_data = pd.concat(SQL_get_data, ignore_index=True)

    # 결측치 제거 및 대체
    AOP_data["probeRadiusCm"] = AOP_data["probeRadiusCm"].fillna(0)
    AOP_data["probeElevAperCm1"] = AOP_data["probeElevAperCm1"].fillna(0)
    AOP_data["probeElevFocusRangCm1"] = AOP_data["probeElevFocusRangCm1"].fillna(0)
    AOP_data = AOP_data.drop(AOP_data[AOP_data["beamstyleIndex"] == 12].index)
    AOP_data = AOP_data.dropna()

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
    # DataFrame으로 반환하여 feature_names_in_ 속성이 설정되도록 함
    data = AOP_data[feature_list]
    target = AOP_data["zt"]

    return data, target
