"""로그인 세션(JWT jti) 레지스트리 — 서버 측 무효화를 위한 프로세스 메모리 저장소.

JWT 서명만 확인하면 로그아웃 후에도 탈취·보관된 토큰을 만료 시각까지 재사용할 수 있다.
그래서 로그인 시 추측 불가능한 jti 를 발급해 여기에 등록하고, 보호 API·상태 확인은
등록된 활성 jti 인지 매번 확인한다. 로그아웃은 jti 를 폐기한다.

프로세스 메모리이므로 Flask 재시작 시 모든 세션이 무효화된다(재로그인은 SSO 로 자동).
단일 Flask 프로세스를 전제로 한다. 다중 worker/다중 호스트로 확장하면 공유 저장소가 필요하다.
"""

from __future__ import annotations

import secrets
import threading
import time
from typing import Dict, Optional, Tuple

_lock = threading.Lock()
_sessions: Dict[str, Tuple[str, float]] = {}


def _purge_expired_locked(now: float) -> None:
    expired = [jti for jti, (_, exp) in _sessions.items() if exp <= now]
    for jti in expired:
        _sessions.pop(jti, None)


def register(username: str, expires_at: float) -> str:
    """새 세션을 등록하고 jti 를 돌려준다. expires_at 은 Unix epoch 초."""
    jti = secrets.token_urlsafe(32)
    with _lock:
        _purge_expired_locked(time.time())
        _sessions[jti] = (username.lower(), float(expires_at))
    return jti


def is_active(jti: Optional[str], username: Optional[str]) -> bool:
    if not jti or not username or not isinstance(jti, str):
        return False
    now = time.time()
    with _lock:
        entry = _sessions.get(jti)
        if entry is None:
            return False
        owner, exp = entry
        if exp <= now:
            _sessions.pop(jti, None)
            return False
        return owner == username.lower()


def revoke(jti: Optional[str]) -> None:
    if not jti or not isinstance(jti, str):
        return
    with _lock:
        _sessions.pop(jti, None)


def clear() -> None:
    """모든 세션 폐기(테스트·재시작 시뮬레이션용)."""
    with _lock:
        _sessions.clear()
