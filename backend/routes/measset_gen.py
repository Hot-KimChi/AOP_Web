from flask import Blueprint, request, jsonify, current_app as app
import os
from werkzeug.utils import secure_filename
from utils.decorators import handle_exceptions, require_auth
from utils.error_handler import error_response
from pkg_MeasSetGen.meas_generation import MeasSetGen

measset_gen_bp = Blueprint("measset_gen", __name__, url_prefix="/api")


@measset_gen_bp.route("/measset-generation", methods=["POST"])
@handle_exceptions
@require_auth
def upload_file():
    if not os.path.exists(app.config["UPLOAD_FOLDER"]):
        os.makedirs(app.config["UPLOAD_FOLDER"])
    if "file" not in request.files:
        return error_response("No file part", 400)
    file = request.files["file"]
    if file.filename == "":
        return error_response("No selected file", 400)
    if file and file.filename:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(file_path)
        database = request.form.get("database")
        probeId = request.form.get("probeId")
        probeName = request.form.get("probeName")
        if not all([database, probeId, probeName]):
            return error_response(
                "Missing required fields: database, probeId, or probeName", 400
            )
        try:
            meas_gen = MeasSetGen(database, probeId, probeName, file_path)
            result_file_path = meas_gen.generate()
            if result_file_path:
                return jsonify({"status": "success", "csv_key": result_file_path}), 200
            else:
                return error_response(
                    "Generation failed. Please check input data or file integrity.", 500
                )
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)
    return error_response("File handling issue", 400)
