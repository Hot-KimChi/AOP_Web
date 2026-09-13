"""사용자별 Todo 저장소.

왜 SQLite 인가 — 이 데이터는 AOP 웹 앱의 개인 메모일 뿐, 측정 데이터가 아니다.
운영 MS-SQL 에 앱 전용 테이블을 만들면 DB 권한·백업·스키마 관리에 얽히므로,
서버 로컬 파일 하나로 분리해 두는 편이 안전하고 되돌리기도 쉽다.

격리 원칙 — 모든 조회·수정·삭제 쿼리는 예외 없이 `owner = ?` 조건을 포함한다.
소유자는 JWT 에서 꺼낸 값(`g.current_user`)만 사용하며 클라이언트 입력은 믿지 않는다.
"""

import os
import sqlite3
import threading
from datetime import datetime, timezone

from config import PROJECT_ROOT

DATA_DIR = os.path.join(PROJECT_ROOT, "backend", "data")
DB_PATH = os.path.join(DATA_DIR, "user_data.db")

MAX_TITLE_LENGTH = 200
MAX_TODOS_PER_USER = 500

# SQLite 의 INTEGER 범위(부호 있는 64비트). 범위를 넘는 id 를 그대로 넘기면
# OverflowError 가 나면서 404 대신 500 이 된다.
_SQLITE_INT_MIN = -(2 ** 63)
_SQLITE_INT_MAX = 2 ** 63 - 1


def _is_valid_id(todo_id) -> bool:
    return isinstance(todo_id, int) and _SQLITE_INT_MIN <= todo_id <= _SQLITE_INT_MAX


_init_lock = threading.Lock()
_initialized = False


def _connect():
    global _initialized
    if not _initialized:
        with _init_lock:
            if not _initialized:
                os.makedirs(DATA_DIR, exist_ok=True)
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS user_todos (
                            id         INTEGER PRIMARY KEY AUTOINCREMENT,
                            owner      TEXT    NOT NULL,
                            title      TEXT    NOT NULL,
                            done       INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT    NOT NULL,
                            updated_at TEXT    NOT NULL
                        )
                        """
                    )
                    conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_user_todos_owner "
                        "ON user_todos(owner, done, id)"
                    )
                _initialized = True
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _normalize_owner(username: str) -> str:
    """SQL Server 로그인은 대소문자를 구분하지 않으므로 소유자 키를 소문자로 고정한다.
    그렇지 않으면 'SEL02776' 과 'sel02776' 이 서로 다른 사람으로 취급된다."""
    return (username or "").strip().lower()


def _row_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "done": bool(row["done"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def list_todos(owner: str):
    owner = _normalize_owner(owner)
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, done, created_at, updated_at FROM user_todos "
            "WHERE owner = ? ORDER BY done ASC, id DESC",
            (owner,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def count_todos(owner: str) -> int:
    owner = _normalize_owner(owner)
    with _connect() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM user_todos WHERE owner = ?", (owner,)
        ).fetchone()[0]


def create_todo(owner: str, title: str):
    owner = _normalize_owner(owner)
    title = (title or "").strip()
    now = _now()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO user_todos (owner, title, done, created_at, updated_at) "
            "VALUES (?, ?, 0, ?, ?)",
            (owner, title, now, now),
        )
        row = conn.execute(
            "SELECT id, title, done, created_at, updated_at FROM user_todos WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return _row_to_dict(row)


def update_todo(owner: str, todo_id: int, *, title=None, done=None):
    """소유자가 일치할 때만 수정한다. 아니면 None 을 돌려준다."""
    if not _is_valid_id(todo_id):
        return None
    owner = _normalize_owner(owner)
    fields = []
    params = []
    if title is not None:
        fields.append("title = ?")
        params.append(title.strip())
    if done is not None:
        fields.append("done = ?")
        params.append(1 if done else 0)
    if not fields:
        return None
    fields.append("updated_at = ?")
    params.append(_now())
    params.extend([todo_id, owner])

    with _connect() as conn:
        cur = conn.execute(
            # 컬럼명은 위에서 코드로만 구성한 고정 문자열이고, 값은 전부
            # 파라미터(?)로 전달한다.
            f"UPDATE user_todos SET {', '.join(fields)} WHERE id = ? AND owner = ?",
            params,
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, title, done, created_at, updated_at FROM user_todos WHERE id = ?",
            (todo_id,),
        ).fetchone()
    return _row_to_dict(row)


def delete_todo(owner: str, todo_id: int) -> bool:
    if not _is_valid_id(todo_id):
        return False
    owner = _normalize_owner(owner)
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM user_todos WHERE id = ? AND owner = ?", (todo_id, owner)
        )
        return cur.rowcount > 0
