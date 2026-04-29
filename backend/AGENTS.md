# Backend Architecture Map & Rules

> Read this before modifying any file under `backend/`.

---

## Coding Standards

- **PEP8** strictly; type hints mandatory for all public functions
- Prefer pure functions; no business logic in route handlers
- Layered: `routes/` → `utils/` → `pkg_*` — respect boundaries

---

## File Structure

```
backend/
├── app.py               # Flask app factory (create_app, teardown, CORS)
├── config.py            # Config class: AOP_config.cfg → env vars → class attrs
├── routes/              # Blueprints (auth, db_api, measset_gen, ml)
├── utils/               # decorators, database_manager, error_handler, logger
├── pkg_SQL/             # SQL class: SQLAlchemy + pyodbc
├── pkg_MachineLearning/ # ML training/prediction
├── pkg_MeasSetGen/      # Measurement set generation
└── db/                  # DB schema/migration scripts
```

---

## Request Lifecycle & Decorator Order

```
Request → @handle_exceptions → @require_auth → @with_db_connection()
  → g.current_db.execute_query(sql, params) → JSON response
  → teardown_appcontext (close connections)
```

Decorator order is **mandatory**: `@handle_exceptions` → `@require_auth` → `@with_db_connection()`. Never reverse.

---

## Auth Flow

1. **Login**: username/password → DB connection attempt → JWT (HttpOnly cookie) + session stores DB credentials
2. **Requests**: JWT from cookie (identity) + session credentials (DB access)
3. **Logout**: clear session + delete cookie

---

## Database (MS-SQL Server)

All DB code is **safety-critical**. Parameterized queries only (`?` placeholders). Never f-string SQL.

```python
# CORRECT
g.current_db.execute_query("SELECT * FROM dbo.T WHERE col = ?", params=["value"])
# SELECT → DataFrame, INSERT → {"insert_id": ...}

# WRONG — SQL injection
g.current_db.execute_query(f"SELECT * FROM {user_input}")
```

- Allowlist table/database names in routes
- Convert numpy types via `.item()` before cursor

---

## Response Format & Critical Invariants

- Success: `{"status": "success", "data": [...]}` · Error: `error_response(msg, code)`
- Codes: 400 (bad input) · 401 (no token) · 403 (invalid) · 422 (no credentials) · 500 (server)
- `CORS supports_credentials=True` · `SESSION_COOKIE_HTTPONLY=True` · `SAMESITE="Lax"`
- `Config.load_config()` before `create_app()`
- `logger.error(msg, exc_info=True)` — always include traceback

---

## Common Tasks

- **Add route**: Blueprint in `routes/`, register in `app.py`, use decorator stack
- **Add query**: `g.current_db.execute_query(sql, params)`, never build SQL strings
- **Add package**: `pkg_*/` directory, import via utils layer
- **Add config**: `AOP_config.cfg` + `config.py` (re-assign in `load_config()`)

---

## ⚠️ Top 5 Costly Mistakes

1. **Decorator 순서 위반** → 500 노출 (see: Request Lifecycle & Decorator Order)
2. **SQL f-string** → 인젝션 취약점 (see: Database)
3. **numpy 타입 직접 전달** → cursor 오류. `.item()` 필수 (see: Database)
4. **session 자원 미정리** → 커넥션 풀 고갈 (see: Response Format & Critical Invariants)
5. **`Config.load_config()` 누락** → 기본값 오작동 (see: Response Format & Critical Invariants)

---

## 🔍 Diagnostic Flow

```
문제 발생
  ├─ 401/403 에러? → auth.py: JWT 만료/세션 credentials 확인
  ├─ 500 에러? → logs/ 확인 → decorator 순서 → 쿼리 파라미터 타입
  ├─ 빈 DataFrame? → SQL 쿼리 결과 확인 → 테이블/DB명 오타
  └─ 연결 실패? → AOP_config.cfg 서버 주소 → ODBC 드라이버 → 방화벽
```