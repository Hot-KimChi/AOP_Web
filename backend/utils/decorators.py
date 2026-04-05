from functools import wraps
from flask import request, g
import jwt
from config import Config
from utils.database_manager import db_manager
from .error_handler import error_response, CredentialsRequired
from .logger import logger


def handle_exceptions(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except CredentialsRequired as e:
            logger.warning(f"Credentials required: {str(e)}")
            return error_response("Username and password are required", 422)
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
            db_name = database or kwargs.get("database") or request.args.get("database")
            if not db_name and request.is_json:
                json_data = request.get_json(silent=True)
                if json_data and "database" in json_data:
                    db_name = json_data["database"]
            if not db_name:
                return error_response("No database specified", 400)
            # CredentialsRequired가 발생하면 handle_exceptions에서 422로 처리
            g.current_db = db_manager.get_connection(db_name)
            return f(*args, **kwargs)

        return decorated_function

    return decorator
