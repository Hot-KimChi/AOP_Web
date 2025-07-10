from functools import wraps
from flask import request, session, g
import jwt
from config import Config
from db.manager import DatabaseManager
from .error_handler import error_response
from .logger import logger


def handle_exceptions(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error occurred: {str(e)}", exc_info=True)
            return error_response(str(e), 500)

    return decorated_function


def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.cookies.get("auth_token")
        if not token:
            return error_response("Authentication required", 401)
        try:
            jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return error_response("Token expired", 401)
        except jwt.InvalidTokenError:
            return error_response("Invalid token", 403)
        return f(*args, **kwargs)

    return decorated_function


def with_db_connection(database=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            username = session.get("username")
            password = session.get("password")
            if not username or not password:
                return error_response("Username and password are required", 422)
            db_name = database or kwargs.get("database") or request.args.get("database")
            if not db_name and request.is_json:
                json_data = request.get_json(silent=True)
                if json_data and "database" in json_data:
                    db_name = json_data["database"]
            if not db_name:
                return error_response("No database specified", 400)
            db = DatabaseManager()
            with db.get_connection(username, password, db_name) as conn:
                g.current_db = conn
                return f(*args, **kwargs)

        return decorated_function

    return decorator
