"""접속자(selxxxxx) 전용 개인 Todo API.

소유자는 항상 `g.current_user`(JWT 에서 꺼낸 값)만 사용한다. 요청 본문에
사용자명이 들어오더라도 절대 신뢰하지 않는다 — 그러면 남의 목록을 조작할 수 있다.
"""

from flask import Blueprint, request, jsonify, g

from utils.decorators import handle_exceptions, require_auth
from utils.error_handler import error_response
from utils import todo_store

todo_bp = Blueprint("todo", __name__, url_prefix="/api/todos")


def _parse_title(data):
    """제목을 검증해 (title, error_response) 형태로 돌려준다."""
    if not isinstance(data, dict):
        return None, error_response("Request body must be valid JSON", 400)
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return None, error_response("할 일 내용을 입력해 주세요.", 400)
    title = title.strip()
    if len(title) > todo_store.MAX_TITLE_LENGTH:
        return None, error_response(
            f"할 일은 {todo_store.MAX_TITLE_LENGTH}자 이내로 입력해 주세요.", 400
        )
    return title, None


@todo_bp.route("", methods=["GET"])
@handle_exceptions
@require_auth
def list_todos():
    return jsonify({"status": "success", "user": g.current_user,
                    "todos": todo_store.list_todos(g.current_user)})


@todo_bp.route("", methods=["POST"])
@handle_exceptions
@require_auth
def create_todo():
    title, err = _parse_title(request.get_json(silent=True))
    if err:
        return err
    if todo_store.count_todos(g.current_user) >= todo_store.MAX_TODOS_PER_USER:
        return error_response(
            f"할 일은 최대 {todo_store.MAX_TODOS_PER_USER}개까지 저장할 수 있습니다.", 400
        )
    return jsonify({"status": "success", "todo": todo_store.create_todo(g.current_user, title)}), 201


@todo_bp.route("/<int:todo_id>", methods=["PATCH"])
@handle_exceptions
@require_auth
def update_todo(todo_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("Request body must be valid JSON", 400)

    title = None
    if "title" in data:
        title, err = _parse_title(data)
        if err:
            return err

    done = None
    if "done" in data:
        if not isinstance(data["done"], bool):
            return error_response("done 은 true/false 여야 합니다.", 400)
        done = data["done"]

    if title is None and done is None:
        return error_response("변경할 내용이 없습니다.", 400)

    todo = todo_store.update_todo(g.current_user, todo_id, title=title, done=done)
    if todo is None:
        # 남의 항목이어도 "없음"으로 답한다. 존재 여부를 흘리지 않기 위함이다.
        return error_response("할 일을 찾을 수 없습니다.", 404)
    return jsonify({"status": "success", "todo": todo})


@todo_bp.route("/<int:todo_id>", methods=["DELETE"])
@handle_exceptions
@require_auth
def delete_todo(todo_id):
    if not todo_store.delete_todo(g.current_user, todo_id):
        return error_response("할 일을 찾을 수 없습니다.", 404)
    return jsonify({"status": "success"})
