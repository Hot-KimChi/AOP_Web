from flask import jsonify


class CredentialsRequired(Exception):
    """인증된 사용자 컨텍스트 없이 DB 접근을 시도할 때 발생 — handle_exceptions 가 401 로 변환합니다."""
    pass


def error_response(message: str, status_code: int):
    return jsonify({"status": "error", "message": message}), status_code
