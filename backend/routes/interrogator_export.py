"""Interrogator "RTP Export"(IntExport) API."""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from pkg_Interrogator import export
from pkg_MsiInput.store import open_raw_connection
from routes._input import RouteInputError, int_param, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger

interrogator_export_bp = Blueprint("interrogator_export", __name__, url_prefix="/api/interrogator/export")


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _run(fn, *, write: bool = False, timeout: int | None = None):
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
    except (RouteInputError, export.ExportInputError) as e:
        return error_response(str(e), 400)
    except Exception:
        logger.error("interrogator export 처리 실패", exc_info=True)
        raise


@interrogator_export_bp.route("/probes", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def probes():
    return _guarded(lambda: _run(export.list_probes))


@interrogator_export_bp.route("/rtp-names", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def rtp_names():
    def work():
        probe_id = int_param(request.args, "probeId")
        return _run(lambda cur: export.list_rtp_names(cur, probe_id))
    return _guarded(work)


@interrogator_export_bp.route("/records", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def records():
    """cmdGet_Click."""
    def work():
        probe_id = int_param(request.args, "probeId")
        rtp = export.check_rtp_name(request.args.get("rtpName"))
        return _run(lambda cur: export.get_records(cur, probe_id, rtp))
    return _guarded(work)


@interrogator_export_bp.route("/duplicate", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def duplicate():
    """cmdCopy_Click: EXEC dbo.rtp_M_duplicate (CommandTimeout 3000)."""
    def work():
        body = json_body()
        if body.get("confirm") is not True:
            raise RouteInputError("DB 변경 작업에는 confirm=true 가 필요합니다.")
        probe_id = int_param(body, "probeId")
        rtp = export.check_rtp_name(body.get("rtpName"))
        return _run(lambda cur: export.run_duplicate(cur, probe_id, rtp), write=True,
                    timeout=export.DUPLICATE_TIMEOUT)
    return _guarded(work)


@interrogator_export_bp.route("/convert", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def convert():
    """cmdConvert_Click: 6개 CSV 내용·파일명(브라우저 다운로드용)."""
    def work():
        body = json_body()
        probe_id = int_param(body, "probeId")
        rtp = export.check_rtp_name(body.get("rtpName"))
        return _run(lambda cur: export.build_csv_files(cur, probe_id, rtp))
    return _guarded(work)
