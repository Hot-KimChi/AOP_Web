"""로그인 DB 자격증명을 서버 메모리에서 관리하는 저장소.

Flask 기본 세션(SecureCookieSessionInterface)은 **서명만 될 뿐 암호화되지 않는다.**
따라서 `session["password"] = ...` 로 DB 비밀번호를 담으면 클라이언트가 쿠키를
base64 디코딩하는 것만으로 평문 비밀번호를 읽을 수 있다.

이 모듈은 세션에는 추측 불가능한 불투명 토큰만 저장하고, 실제 username/password는
서버 프로세스 메모리에 보관한다. 토큰은 TTL 기반으로 만료되며 접근할 때마다 갱신된다.
서버 재시작 시 저장소가 비워지므로 사용자는 다시 로그인해야 한다(의도된 동작).
"""

from __future__ import annotations

import secrets
import threading
import time
from typing import Dict, Optional, Tuple

from flask import session

from config import Config

# 세션 쿠키에 저장되는 키 — 값은 자격증명이 아니라 불투명 토큰이다.
CREDENTIAL_TOKEN_KEY = "cred_token"

_lock = threading.Lock()
_store: Dict[str, Dict[str, object]] = {}


def _purge_expired_locked(now: float) -> None:
    """만료된 항목 제거. 호출 전에 _lock 을 획득해야 한다."""
    expired = [token for token, entry in _store.items() if entry["expires_at"] <= now]
    for token in expired:
        _store.pop(token, None)


def store_credentials(username: str, password: str) -> str:
    """자격증명을 저장하고 세션에 넣을 불투명 토큰을 반환한다."""
    token = secrets.token_urlsafe(32)
    now = time.monotonic()
    ttl = float(Config.EXPIRE_TIME)
    with _lock:
        _purge_expired_locked(now)
        _store[token] = {
            "username": username,
            "password": password,
            "expires_at": now + ttl,
        }
    return token


def resolve(token: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """토큰으로 (username, password) 를 조회한다. 조회 성공 시 TTL 을 갱신한다."""
    if not token:
        return None, None
    now = time.monotonic()
    with _lock:
        entry = _store.get(token)
        if entry is None:
            return None, None
        if entry["expires_at"] <= now:
            _store.pop(token, None)
            return None, None
        # 활성 사용자는 만료되지 않도록 슬라이딩 갱신
        entry["expires_at"] = now + float(Config.EXPIRE_TIME)
        return str(entry["username"]), str(entry["password"])


def revoke(token: Optional[str]) -> None:
    """토큰을 폐기한다(로그아웃)."""
    if not token:
        return
    with _lock:
        _store.pop(token, None)


def bind_to_session(username: str, password: str) -> None:
    """로그인 성공 시 호출 — 자격증명을 저장하고 세션에 토큰만 남긴다.

    구버전에서 발급된 세션 쿠키에는 평문 `password` 가 담겨 있을 수 있다.
    `SECRET_KEY` 가 유지된 채 배포되면 그 쿠키가 그대로 통과하므로,
    토큰을 새로 넣기 전에 **세션 전체를 비워** 잔존 평문 자격증명을 제거한다.
    """
    revoke(session.get(CREDENTIAL_TOKEN_KEY))
    session.clear()
    session[CREDENTIAL_TOKEN_KEY] = store_credentials(username, password)
    session["username"] = username


def get_session_credentials() -> Tuple[Optional[str], Optional[str]]:
    """현재 요청 세션의 (username, password) 를 반환한다. 없으면 (None, None)."""
    return resolve(session.get(CREDENTIAL_TOKEN_KEY))


def has_session_credentials() -> bool:
    """현재 세션이 유효한 DB 자격증명을 보유하는지 여부."""
    username, password = get_session_credentials()
    return bool(username and password)


def clear_session() -> None:
    """로그아웃 — 토큰 폐기 후 세션 전체 정리."""
    revoke(session.get(CREDENTIAL_TOKEN_KEY))
    session.clear()
