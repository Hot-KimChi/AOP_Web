import logging
import os
import pandas as pd
from datetime import datetime
from pkg_SQL.database import SQL
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import g
from utils.credential_store import get_session_credentials
from utils.database_manager import get_db_connection


def fetchData():
    # 데이터베이스에서 데이터를 가져오는 함수 (병렬 처리)
    # 자격증명은 서버 메모리(credential_store)에서 가져온다 (메인 스레드에서 미리 추출)
    username, password = get_session_credentials()

    if not username or not password:
        raise ValueError("세션에 사용자 인증 정보가 없습니다.")

    server_address = os.environ.get("SERVER_ADDRESS_ADDRESS")
    databases_ML = os.environ.get("DATABASE_ML_NAME")

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
            logging.warning(f"DB '{db}' 데이터 조회 실패: {e}")
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

    # 필터·결측 제거 후 학습 가능한 표본이 남았는지 확인한다.
    # (빈 DataFrame 이 그대로 내려가면 train_test_split 에서 런타임 실패한다)
    MIN_TRAINING_ROWS = 10
    if len(AOP_data) < MIN_TRAINING_ROWS:
        raise ValueError(
            f"학습 가능한 데이터가 부족합니다(유효 {len(AOP_data)}행, 최소 "
            f"{MIN_TRAINING_ROWS}행 필요). 조회 조건 또는 결측치를 확인하세요."
        )

    # 수집 데이터 스냅샷 CSV 저장 (AOP_SAVE_TRAINING_CSV=false 로 끌 수 있음)
    if os.environ.get("AOP_SAVE_TRAINING_CSV", "true").lower() != "false":
        output_dir = os.path.join(os.path.dirname(__file__), "SQL_get_Data")
        os.makedirs(output_dir, exist_ok=True)
        now = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(output_dir, f"{now}_Intensity_SQL_Get_Data.csv")
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
