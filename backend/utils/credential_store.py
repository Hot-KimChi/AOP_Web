"""로그인 DB 자격증명을 서버 메모리에서 관리하는 저장소.

Flask 기본 세션(SecureCookieSessionInterface)은 **서명만 될 뿐 암호화되지 않는다.**
따라서 `session["password"] = ...` 로 DB 비밀번호를 담으면 클라이언트가 쿠키를
base64 디코딩하는 것만으로 평문 비밀번호를 읽을 수 있다.

이 모듈은 세션에는 추측 불가능한 불투명 토큰만 저장하고, 실제 username/password는
서버 프로세스 메모리에 보관한다. EXPIRE_TIME > 0 이면 유휴 TTL 로 만료되며 접근할 때마다
갱신되고, 0 이하면 시간 만료가 없다. 어느 경우든 항목 수는 MAX_ENTRIES 로 제한해
가장 오래 사용하지 않은 항목부터 제거한다(버려진 세션의 메모리 누적 방지).
서버 재시작 시 저장소가 비워지므로 사용자는 다시 로그인해야 한다(의도된 동작).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import OrderedDict
from typing import Dict, Optional, Tuple

from flask import session

from config import Config

# 세션 쿠키에 저장되는 키 — 값은 자격증명이 아니라 불투명 토큰이다.
CREDENTIAL_TOKEN_KEY = "cred_token"

_lock = threading.Lock()
_store: "OrderedDict[str, Dict[str, object]]" = OrderedDict()

# 동시 보관 세션 상한. 초과 시 가장 오래 사용하지 않은 세션이 로그아웃된다.
MAX_ENTRIES = 2000


def _expiry(now: float) -> float:
    ttl = float(Config.EXPIRE_TIME)
    return now + ttl if ttl > 0 else float("inf")


def _purge_expired_locked(now: float) -> None:
    """만료된 항목 제거. 호출 전에 _lock 을 획득해야 한다."""
    expired = [token for token, entry in _store.items() if entry["expires_at"] <= now]
    for token in expired:
        _store.pop(token, None)


def store_credentials(username: str, password: str) -> str:
    """자격증명을 저장하고 세션에 넣을 불투명 토큰을 반환한다."""
    token = secrets.token_urlsafe(32)
    now = time.monotonic()
    with _lock:
        _purge_expired_locked(now)
        _store[token] = {
            "username": username,
            "password": password,
            "expires_at": _expiry(now),
        }
        while len(_store) > MAX_ENTRIES:
            _store.popitem(last=False)
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
        # 활성 사용자는 만료되지 않도록 슬라이딩 갱신(LRU 순서도 갱신)
        entry["expires_at"] = _expiry(now)
        _store.move_to_end(token)
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


# JWT 에 실어 세션(자격증명 저장소 항목)과 묶는 클레임. 값은 세션 토큰의 SHA-256 이다.
JWT_BINDING_CLAIM = "cid"


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_binding() -> Optional[str]:
    """현재 세션 토큰의 해시 — 로그인 시 JWT 의 `cid` 클레임으로 넣는다."""
    token = session.get(CREDENTIAL_TOKEN_KEY)
    return _digest(token) if token else None


def is_jwt_session_alive(payload: dict) -> bool:
    """JWT 가 묶인 세션이 아직 살아 있는지 확인한다.

    exp 없는 JWT 는 서버에서 폐기할 수 없으므로, 로그아웃·서버 재시작·LRU 제거로
    저장소 항목이 사라지면 같은 JWT 도 무효가 되도록 세션과 묶는다.
    `cid` 가 없는 토큰은 이 바인딩 도입 전 발급분으로 보고 `exp` 가 있을 때만 통과시킨다
    (cid·exp 가 모두 없으면 폐기 수단이 없는 영구 토큰이므로 거부).
    """
    cid = payload.get(JWT_BINDING_CLAIM)
    if cid is None:
        return "exp" in payload
    token = session.get(CREDENTIAL_TOKEN_KEY)
    if not token or not hmac.compare_digest(_digest(token), str(cid)):
        return False
    return has_session_credentials()


def has_session_credentials() -> bool:
    """현재 세션이 유효한 DB 자격증명을 보유하는지 여부."""
    username, password = get_session_credentials()
    return bool(username and password)


def clear_session() -> None:
    """로그아웃 — 토큰 폐기 후 세션 전체 정리."""
    revoke(session.get(CREDENTIAL_TOKEN_KEY))
    session.clear()
