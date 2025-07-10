from flask import Blueprint, jsonify
from utils.decorators import handle_exceptions, require_auth
from utils.logger import logger

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
