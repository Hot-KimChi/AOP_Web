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
