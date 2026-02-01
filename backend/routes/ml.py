from flask import Blueprint, jsonify, request
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
        from flask import session
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

        if result_df.empty:
            logger.info("No model version data found")
            return jsonify(
                {
                    "status": "success",
                    "data": [],
                    "message": "훈련된 모델 버전이 없습니다.",
                }
            )

        # 데이터 구조화: 모델별 -> 버전별 -> 메트릭
        models_dict = {}

        for _, row in result_df.iterrows():
            model_name = row["model_name"]
            version_id = row["version_id"]

            # 모델이 딕셔너리에 없으면 추가
            if model_name not in models_dict:
                models_dict[model_name] = {
                    "model_id": int(row["model_id"]),
                    "model_name": model_name,
                    "model_type": row["model_type"],
                    "description": row["description"],
                    "prediction_type": row["prediction_type"],
                    "versions": {},
                }

            # 버전이 딕셔너리에 없으면 추가
            if version_id not in models_dict[model_name]["versions"]:
                models_dict[model_name]["versions"][version_id] = {
                    "version_id": int(version_id),
                    "version_number": int(row["version_number"]),
                    "stage": row["stage"],
                    "creation_time": (
                        row["creation_time"].isoformat()
                        if row["creation_time"]
                        else None
                    ),
                    "user_id": row["user_id"],
                    "model_class_name": row["model_class_name"],
                    "metrics": {},
                }

            # 메트릭 추가
            if row["metric_name"] and row["metric_value"] is not None:
                metric_name = row["metric_name"]
                models_dict[model_name]["versions"][version_id]["metrics"][
                    metric_name
                ] = float(row["metric_value"])

        # 딕셔너리를 리스트로 변환
        result_data = []
        for model_name, model_data in models_dict.items():
            # 버전 딕셔너리를 리스트로 변환
            versions_list = list(model_data["versions"].values())
            model_data["versions"] = versions_list
            result_data.append(model_data)

        logger.info(
            f"Model versions performance data retrieved: {len(result_data)} models"
        )

        return jsonify({"status": "success", "data": result_data})

    except Exception as e:
        logger.error(
            f"Failed to retrieve model versions performance: {str(e)}", exc_info=True
        )
        return error_response(str(e), 500)
