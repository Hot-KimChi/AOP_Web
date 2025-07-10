from flask import Blueprint, jsonify
from utils.decorators import handle_exceptions, require_auth

etc_bp = Blueprint("etc", __name__, url_prefix="/api")

# 기타 라우트가 필요할 경우 여기에 추가
