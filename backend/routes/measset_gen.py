from flask import Blueprint, request, jsonify, current_app as app
import os
import tempfile
from werkzeug.utils import secure_filename
from utils.decorators import handle_exceptions, require_auth
from utils.error_handler import error_response
from pkg_MeasSetGen.meas_generation import MeasSetGen
from routes._input import is_business_db

measset_gen_bp = Blueprint("measset_gen", __name__, url_prefix="/api")


@measset_gen_bp.route("/measset-generation", methods=["POST"])
@handle_exceptions
@require_auth
def upload_file():
    if "file" not in request.files:
        return error_response("No file part", 400)
    file = request.files["file"]
    if file.filename == "":
        return error_response("No selected file", 400)
    database = request.form.get("database")
    probe_id = request.form.get("probeId")
    probe_name = request.form.get("probeName")
    if not all([database, probe_id, probe_name]):
        return error_response(
            "Missing required fields: database, probeId, or probeName", 400
        )
    # with_db_connection 을 쓰지 않는 경로이므로 DB 이름 허용 목록을 직접 검증한다.
    if not is_business_db(database):
        return error_response("유효하지 않은 데이터베이스입니다", 400)

    upload_folder = app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)
    original_name = secure_filename(file.filename)
    extension = os.path.splitext(original_name)[1]
    file_descriptor, file_path = tempfile.mkstemp(
        prefix="measset_input_",
        suffix=extension,
        dir=upload_folder,
    )
    os.close(file_descriptor)
    try:
        file.save(file_path)
        meas_gen = MeasSetGen(database, probe_id, probe_name, file_path)
        result_file_path = meas_gen.generate()
        if result_file_path:
            return jsonify({"status": "success", "csv_key": result_file_path}), 200
        return error_response(
            "Generation failed. Please check input data or file integrity.", 500
        )
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)
    return error_response("File handling issue", 400)
