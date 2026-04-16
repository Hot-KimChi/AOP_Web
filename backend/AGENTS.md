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
├── app.py                  # Flask app factory (create_app, teardown, CORS)
├── config.py               # Config class: AOP_config.cfg → env vars → class attrs
├── AOP_config.cfg           # INI config → [SECTION]_KEY env vars
├── routes/                  # Blueprints
│   ├── auth.py              # /api/auth/* — login, logout, status, refresh
│   ├── db_api.py            # /api/* — DB viewer, table data, CSV export
│   ├── measset_gen.py       # /api/measset-generation/*
│   └── ml.py                # /api/ml/* — ML model train/predict/list
├── utils/
│   ├── database_manager.py  # DatabaseManager (per-request cache via flask.g)
│   ├── decorators.py        # @handle_exceptions, @require_auth, @with_db_connection
│   ├── error_handler.py     # error_response(), CredentialsRequired
│   └── logger.py            # Named logger "AOP_Web"
├── pkg_SQL/                 # SQL class: SQLAlchemy engine + pyodbc
├── pkg_MachineLearning/     # ML training/prediction
├── pkg_MeasSetGen/          # Measurement set generation
└── db/                      # DB schema/migration scripts
```

---

## Request Lifecycle

```
Client → route → @handle_exceptions → @require_auth → @with_db_connection()
  → g.current_db.execute_query(sql, params)
  → JSON response
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

All DB code is **safety-critical**.

```python
# CORRECT
result = g.current_db.execute_query("SELECT * FROM dbo.T WHERE col = ?", params=["value"])
# → SELECT returns pandas DataFrame, INSERT returns {"insert_id": ...}

# WRONG — SQL injection
result = g.current_db.execute_query(f"SELECT * FROM {user_input}")
```

- Parameterized queries only (`?` placeholders). Never f-string SQL
- Allowlist table/database names in routes
- Convert numpy types via `.item()` before cursor

---

## Response & Error Format

- Success: `{"status": "success", "data": [...]}` or `{"message": "..."}`
- Error: `error_response(msg, code)` → `{"status": "error", "message": "..."}`
- Codes: 400 (bad input) · 401 (no token) · 403 (invalid token) · 422 (no credentials) · 500 (server)

---

## Critical Invariants

- `CORS supports_credentials=True`
- `SESSION_COOKIE_HTTPONLY=True`, `SAMESITE="Lax"`
- `Config.load_config()` before `create_app()`
- `logger.error(msg, exc_info=True)` — always include traceback

---

## Common Tasks

- **Add route**: Blueprint in `routes/`, register in `app.py`, use decorator stack
- **Add query**: `g.current_db.execute_query(sql, params)`, never build SQL strings
- **Add package**: `pkg_*/` directory, import via utils layer
- **Add config**: `AOP_config.cfg` + `config.py` (re-assign in `load_config()`)