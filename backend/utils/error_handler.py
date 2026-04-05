from flask import jsonify


class CredentialsRequired(Exception):
    """세션에 DB 인증 정보가 없을 때 발생하는 예외 — handle_exceptions 가 422 로 변환합니다."""
    pass


def error_response(message: str, status_code: int):
    return jsonify({"status": "error", "message": message}), status_code
