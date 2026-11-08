"""Interrogator "Power Data Analysis"(intPower) API."""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from pkg_Interrogator import power
from pkg_MsiInput.store import open_raw_connection
from routes._input import RouteInputError, int_param, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger

interrogator_power_bp = Blueprint("interrogator_power", __name__, url_prefix="/api/interrogator/power")


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _run(fn, *, write: bool = False, timeout: int | None = None):
    """연결 하나에서 fn(cur) 실행. 쓰기는 성공 시 commit, 실패 시 rollback."""
    conn = open_raw_connection(g.current_db)
    driver = getattr(conn, "driver_connection", None) or getattr(conn, "dbapi_connection", None) or conn
    previous_timeout = getattr(driver, "timeout", 0)
    committed = False
    try:
        if timeout:
            driver.timeout = timeout
        cur = conn.cursor()
        result = fn(cur)
        if write:
            conn.commit()
        committed = True
        return result
    finally:
        if write and not committed:
            try:
                conn.rollback()
            except Exception:
                pass
        if timeout:
            try:
                driver.timeout = previous_timeout
            except Exception:
                pass
        conn.close()


def _guarded(fn):
    try:
        require_business_db()
        return _ok(fn())
    except (RouteInputError, power.PowerInputError) as e:
        return error_response(str(e), 400)
    except Exception:
        logger.error("interrogator power 처리 실패", exc_info=True)
        raise


def _require_confirm(body: dict) -> None:
    if body.get("confirm") is not True:
        raise RouteInputError("DB 변경 작업에는 confirm=true 가 필요합니다.")


def _key(body: dict) -> tuple:
    return power.dataset_key(body.get("dataset"))


@interrogator_power_bp.route("/sw-versions", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def sw_versions():
    def work():
        probe_id = int_param(request.args, "probeId")
        return _run(lambda cur: power.sw_versions(cur, probe_id))
    return _guarded(work)


@interrogator_power_bp.route("/records", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def get_records():
    """cmdGetRecords: pre_RTP_power 실행(trtp_power 재생성) 후 목록·그리드."""
    def work():
        body = json_body()
        probe_id = int_param(body, "probeId")
        sw = power.sw_version_param(body.get("swVersions"))
        return _run(lambda cur: power.get_records(cur, probe_id, sw), write=True, timeout=power.PROC_TIMEOUT)
    return _guarded(work)


@interrogator_power_bp.route("/items", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def list_items():
    """cmdUpdate: 1st~4th order 로 목록 재조회."""
    def work():
        body = json_body()
        orders = body.get("orders") or []
        if not isinstance(orders, list) or len(orders) > 4:
            raise RouteInputError("orders 값이 올바르지 않습니다.")
        power.order_clause(orders)
        return _run(lambda cur: power.list_items(cur, orders, default_order=False))
    return _guarded(work)


@interrogator_power_bp.route("/plot", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def plot():
    """DrawGraph / EditGraph: 데이터셋 범위와 점."""
    def work():
        body = json_body()
        datasets = body.get("datasets")
        if not isinstance(datasets, list) or not datasets or len(datasets) > 200:
            raise RouteInputError("datasets 값이 올바르지 않습니다.")
        keys = [power.dataset_key(d) for d in datasets]
        return _run(lambda cur: power.plot_datasets(cur, keys))
    return _guarded(work)


@interrogator_power_bp.route("/mark", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def set_mark():
    """chkMark_CheckStateChanged: 데이터셋 mark 토글 저장."""
    def work():
        body = json_body()
        _require_confirm(body)
        key = _key(body)
        mark = body.get("mark")
        _run(lambda cur: power.set_mark(cur, key, mark), write=True)
        return {"mark": mark}
    return _guarded(work)


@interrogator_power_bp.route("/mark-all", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def mark_all():
    def work():
        _require_confirm(json_body())
        _run(power.mark_all, write=True)
        return {"mark": "checked"}
    return _guarded(work)


@interrogator_power_bp.route("/point", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def save_point():
    """SaveEdit: 편집한 점 저장."""
    def work():
        body = json_body()
        _require_confirm(body)
        power_id = int_param(body, "powerId")
        try:
            x = float(body.get("x"))
            y = float(body.get("y"))
        except (TypeError, ValueError):
            raise RouteInputError("x/y 값이 올바르지 않습니다.") from None
        if x != x or y != y or x in (float("inf"), float("-inf")) or y in (float("inf"), float("-inf")):
            raise RouteInputError("x/y 값이 올바르지 않습니다.")
        _run(lambda cur: power.save_point(cur, power_id, x, y), write=True)
        return {"powerId": power_id, "x": power.sng(x), "y": power.sng(y)}
    return _guarded(work)


@interrogator_power_bp.route("/auto-check", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def auto_check():
    """cmdAutoCheck: CheckPowerData 결과(저장 없음)."""
    def work():
        key = _key(json_body())
        return _run(lambda cur: power.auto_check(cur, key))
    return _guarded(work)


@interrogator_power_bp.route("/auto-save", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def auto_save():
    """SaveAutoCheck: 서버에서 다시 계산해 trtp_power·ws_power 갱신(단일 트랜잭션)."""
    def work():
        body = json_body()
        _require_confirm(body)
        key = _key(body)
        return _run(lambda cur: power.auto_save(cur, key), write=True)
    return _guarded(work)
