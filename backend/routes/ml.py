from flask import Blueprint, jsonify, request
import pandas as pd
from utils.decorators import handle_exceptions, require_auth
from utils.logger import logger
from utils.error_handler import error_response

ml_bp = Blueprint("ml", __name__, url_prefix="/api")


@ml_bp.route("/get_ml_models", methods=["GET"])
@handle_exceptions
@require_auth
def get_ml_models():
    from pkg_MachineLearning.machine_learning import MachineLearning

    ml = MachineLearning()
    models = ml.get_ml_models()
    if models:
        logger.info(f"Available ML models: {models}")
    else:
        logger.warning("No ML models found in the configuration file.")
        models = []
    return jsonify({"status": "success", "models": models})


@ml_bp.route("/train_model", methods=["POST"])
@handle_exceptions
@require_auth
def train_model():
    """머신러닝 모델 훈련 API"""
    try:
        from pkg_MachineLearning.machine_learning import MachineLearning

        data = request.get_json()
        selected_model = data.get("model")

        if not selected_model:
            return error_response("모델이 선택되지 않았습니다.", 400)

        logger.info(f"Training request received for model: {selected_model}")

        # MachineLearning 클래스 인스턴스 생성 및 훈련 실행
        ml = MachineLearning()
        result = ml.train_model(selected_model)

        # 훈련 완료 로그는 machine_learning.py에서 처리하므로 중복 제거
        return jsonify(result)

    except Exception as e:
        logger.error(f"Training request failed: {str(e)}", exc_info=True)
        return error_response(str(e), 500)


@ml_bp.route("/model_versions_performance", methods=["GET"])
@handle_exceptions
@require_auth
def get_model_versions_performance():
    """
    모든 모델의 모든 버전과 성능 메트릭을 조회하는 API

    Query Parameters:
        - prediction_type (optional): 'intensity', 'power', 'temperature'
        - model_name (optional): 특정 모델만 조회

    Returns:
        JSON: 모델별 버전 및 성능 데이터
    """
    try:
        from utils.database_manager import DatabaseManager

        # 쿼리 파라미터 가져오기
        prediction_type = request.args.get("prediction_type", None)
        model_name = request.args.get("model_name", None)

        # 데이터베이스 연결
        db_manager = DatabaseManager()
        db = db_manager.get_mlflow_connection()

        # 동적 WHERE 절 구성
        where_conditions = []
        params = []

        if prediction_type:
            where_conditions.append("mv.prediction_type = ?")
            params.append(prediction_type)

        if model_name:
            where_conditions.append("rm.model_name = ?")
            params.append(model_name)

        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)

        # 모델 버전 및 성능 데이터 조회
        query = f"""
            SELECT 
                rm.model_id,
                rm.model_name,
                rm.model_type,
                rm.description,
                mv.version_id,
                mv.version_number,
                mv.stage,
                mv.creation_time,
                mv.user_id,
                mv.prediction_type,
                mv.model_class_name,
                mp.metric_name,
                mp.metric_value,
                mp.dataset_type
            FROM ml_registered_models rm
            JOIN ml_model_versions mv ON rm.model_id = mv.model_id
            LEFT JOIN ml_model_performance mp ON mv.version_id = mp.model_version_id
            {where_clause}
            ORDER BY rm.model_name, mv.version_number DESC, mp.metric_name
        """

        if params:
            result_df = db.execute_query(query, tuple(params))
        else:
            result_df = db.execute_query(query)

        # 디버깅: 쿼리 결과 로깅
        logger.info(f"Query returned {len(result_df)} rows")

        if result_df.empty:
            logger.info("No model version data found")
            return jsonify(
                {
                    "status": "success",
                    "data": [],
                    "message": "훈련된 모델 버전이 없습니다.",
                }
            )

        # 데이터 구조화: 모델별 -> 버전별 -> 메트릭 (groupby로 벡터화하여 iterrows 제거)
        models_dict = {}

        for (model_name, model_id), model_group in result_df.groupby(
            ["model_name", "model_id"], sort=False
        ):
            first_model_row = model_group.iloc[0]
            versions = {}

            for version_id, version_group in model_group.groupby("version_id", sort=False):
                first_ver = version_group.iloc[0]

                # 메트릭 빌드: zip으로 한 번에 구성 (iterrows 불필요)
                mask = (
                    version_group["metric_name"].notna()
                    & version_group["metric_value"].notna()
                )
                metric_rows = version_group[mask]
                metrics = {}
                for name, val in zip(metric_rows["metric_name"], metric_rows["metric_value"]):
                    try:
                        metrics[name] = float(val)
                    except (TypeError, ValueError):
                        logger.warning(f"Cannot convert metric value to float: {val}")
                        metrics[name] = None

                ct = first_ver["creation_time"]
                versions[version_id] = {
                    "version_id": int(version_id),
                    "version_number": int(first_ver["version_number"]),
                    "stage": first_ver["stage"],
                    "creation_time": (
                        ct.isoformat()
                        if ct is not None and hasattr(ct, "isoformat")
                        else None
                    ),
                    "user_id": first_ver["user_id"],
                    "model_class_name": first_ver["model_class_name"],
                    "metrics": metrics,
                }

            models_dict[model_name] = {
                "model_id": int(model_id),
                "model_name": model_name,
                "model_type": first_model_row["model_type"],
                "description": first_model_row["description"],
                "prediction_type": first_model_row["prediction_type"],
                "versions": list(versions.values()),
            }

        result_data = list(models_dict.values())

        logger.info(
            f"Model versions performance data retrieved: {len(result_data)} models"
        )

        return jsonify({"status": "success", "data": result_data})

    except Exception as e:
        logger.error(
            f"Failed to retrieve model versions performance: {str(e)}", exc_info=True
        )
        return error_response(str(e), 500)


@ml_bp.route("/prediction_points", methods=["GET"])
@handle_exceptions
@require_auth
def get_prediction_points():
    """
    특정 모델 버전의 Target vs Estimation 예측 포인트를 조회하는 API
    (산점도 시각화용)

    Query Parameters:
        - prediction_type (optional): 'intensity', 'power', 'temperature' (기본: 'intensity')
        - model_name (optional): 특정 모델만 조회
        - version_id (optional): 특정 버전 ID만 조회
        - latest_only (optional): 'true'이면 각 모델의 최신 버전만 조회 (기본: 'true')

    Returns:
        JSON: 모델별 target vs estimation 데이터 포인트
    """
    try:
        from utils.database_manager import DatabaseManager

        prediction_type = request.args.get("prediction_type", "intensity")
        model_name = request.args.get("model_name", None)
        version_id = request.args.get("version_id", None)
        latest_only = request.args.get("latest_only", "true").lower() == "true"

        db_manager = DatabaseManager()
        db = db_manager.get_mlflow_connection()

        logger.info(
            f"prediction_type={prediction_type}, model_name={model_name}, version_id={version_id}, latest_only={latest_only}"
        )

        if version_id:
            # 특정 버전 ID로 직접 조회
            query = """
                SELECT 
                    rm.model_name,
                    mv.version_id,
                    mv.version_number,
                    mv.stage,
                    pp.target_value,
                    pp.estimation_value,
                    pp.data_index,
                    pp.dataset_type
                FROM ml_prediction_points pp
                JOIN ml_model_versions mv ON pp.model_version_id = mv.version_id
                JOIN ml_registered_models rm ON mv.model_id = rm.model_id
                WHERE pp.model_version_id = ?
                ORDER BY pp.data_index
            """
            result_df = db.execute_query(query, (int(version_id),))
        else:
            # 동적 WHERE 절 구성
            where_conditions = ["mv.prediction_type = ?"]
            params = [prediction_type]

            if model_name:
                where_conditions.append("rm.model_name = ?")
                params.append(model_name)

            where_clause = " AND ".join(where_conditions)

            if latest_only:
                # 각 모델의 최신 버전만 조회 (Production 우선, 없으면 가장 높은 version_number)
                query = f"""
                    WITH LatestVersions AS (
                        SELECT 
                            mv.version_id,
                            mv.model_id,
                            mv.version_number,
                            mv.stage,
                            ROW_NUMBER() OVER (
                                PARTITION BY mv.model_id 
                                ORDER BY 
                                    CASE mv.stage WHEN 'Production' THEN 0 ELSE 1 END,
                                    mv.version_number DESC
                            ) as rn
                        FROM ml_model_versions mv
                        JOIN ml_registered_models rm ON mv.model_id = rm.model_id
                        WHERE {where_clause}
                    )
                    SELECT 
                        rm.model_name,
                        lv.version_id,
                        lv.version_number,
                        lv.stage,
                        pp.target_value,
                        pp.estimation_value,
                        pp.data_index,
                        pp.dataset_type
                    FROM LatestVersions lv
                    JOIN ml_prediction_points pp ON lv.version_id = pp.model_version_id
                    JOIN ml_registered_models rm ON lv.model_id = rm.model_id
                    WHERE lv.rn = 1
                    ORDER BY rm.model_name, pp.data_index
                """
            else:
                query = f"""
                    SELECT 
                        rm.model_name,
                        mv.version_id,
                        mv.version_number,
                        mv.stage,
                        pp.target_value,
                        pp.estimation_value,
                        pp.data_index,
                        pp.dataset_type
                    FROM ml_prediction_points pp
                    JOIN ml_model_versions mv ON pp.model_version_id = mv.version_id
                    JOIN ml_registered_models rm ON mv.model_id = rm.model_id
                    WHERE {where_clause}
                    ORDER BY rm.model_name, mv.version_number DESC, pp.data_index
                """

            result_df = db.execute_query(query, tuple(params))

        logger.info(
            f"Query returned {len(result_df)} rows"
        )

        if result_df.empty:
            return jsonify(
                {
                    "status": "success",
                    "data": [],
                    "message": "예측 포인트 데이터가 없습니다. Training을 먼저 실행해주세요.",
                }
            )

        # 모델/버전별로 데이터 구조화 (groupby로 벡터화하여 iterrows 제거)
        result_df["target_value"] = result_df["target_value"].astype(float)
        result_df["estimation_value"] = result_df["estimation_value"].astype(float)

        # data_index 타입을 미리 정수로 변환
        result_df["data_index"] = pd.to_numeric(result_df["data_index"], errors="coerce")
        result_df["data_index"] = result_df["data_index"].where(result_df["data_index"].notna(), None)

        models_dict = {}
        for (model_name_key, version_id_val), group in result_df.groupby(
            ["model_name", "version_id"], sort=False
        ):
            version_id_val = int(version_id_val)
            first_row = group.iloc[0]
            key = f"{model_name_key}_v{version_id_val}"

            # 포인트 목록: to_dict로 한 번에 변환
            pts = group[
                ["target_value", "estimation_value", "data_index", "dataset_type"]
            ].to_dict("records")
            for p in pts:
                di = p.get("data_index")
                p["data_index"] = int(di) if di is not None else None

            models_dict[key] = {
                "model_name": model_name_key,
                "version_id": version_id_val,
                "version_number": int(first_row["version_number"]),
                "stage": first_row["stage"],
                "points": pts,
            }

        result_data = list(models_dict.values())
        total_points = sum(len(m["points"]) for m in result_data)

        logger.info(
            f"Prediction points retrieved: {len(result_data)} models, {total_points} total points"
        )

        return jsonify({"status": "success", "data": result_data})

    except Exception as e:
        logger.error(f"Failed to retrieve prediction points: {str(e)}", exc_info=True)
        return error_response(str(e), 500)
