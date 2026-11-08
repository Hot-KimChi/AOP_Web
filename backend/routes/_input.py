"""라우트 공통 입력 검증 헬퍼(MSI input · Interrogator)."""

from __future__ import annotations

import os

from flask import request


class RouteInputError(ValueError):
    pass


def json_body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise RouteInputError("JSON 본문이 필요합니다.")
    return body


def require_business_db() -> None:
    """업무 DB(DATABASE_NAME 목록)만 허용한다. MLflow 추적 DB 는 제외."""
    name = request.args.get("database")
    if not name and request.is_json:
        body = request.get_json(silent=True) or {}
        name = body.get("database") if isinstance(body, dict) else None
    allowed = {d.strip() for d in os.environ.get("DATABASE_NAME", "").split(",") if d.strip()}
    if name not in allowed:
        raise RouteInputError("유효하지 않은 데이터베이스입니다.")


def int_param(source: dict, key: str, *, minimum: int = 1, maximum: int = 2_147_483_647,
              default: int | None = None) -> int:
    value = source.get(key, default)
    if value is None or value == "":
        if default is not None:
            return default
        raise RouteInputError(f"{key} 값이 필요합니다.")
    if isinstance(value, bool):
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.")
    if isinstance(value, str):
        value = value.strip()
        if not value.lstrip("-").isdigit():
            raise RouteInputError(f"{key} 값이 올바르지 않습니다.")
        value = int(value)
    if not isinstance(value, int):
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.")
    if value < minimum or value > maximum:
        raise RouteInputError(f"{key} 값이 허용 범위를 벗어났습니다.")
    return value
