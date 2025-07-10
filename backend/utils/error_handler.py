from flask import jsonify


def error_response(message: str, status_code: int):
    return jsonify({"status": "error", "message": message}), status_code
