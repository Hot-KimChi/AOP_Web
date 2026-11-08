"""MSI input(Silverstone) API — 레거시 msiFromDump 기능."""

from flask import Blueprint, g, jsonify, request

from pkg_MsiInput import store as msi_store
from pkg_MsiInput.calculator import PURPOSE_MODES, MsiInputError
from routes._input import RouteInputError, int_param, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger

msi_input_bp = Blueprint("msi_input", __name__, url_prefix="/api/msi")

MAX_FILTER_LEN = 200


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _common_args(body: dict) -> tuple[int, list, str, int]:
    probe_id = int_param(body, "probeId")
    ids = body.get("subVerifIds")
    mode = body.get("purposeMode")
    if mode not in PURPOSE_MODES:
        raise RouteInputError("지원하지 않는 purpose 모드입니다.")
    min_id = int_param(body, "minMeasSetId", minimum=0, default=0)
    return probe_id, ids, mode, min_id


def _guard(fn):
    try:
        return fn()
    except (RouteInputError, MsiInputError) as exc:
        return error_response(str(exc), 400)


@msi_input_bp.route("/probes", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def probes():
    return _guard(lambda: (require_business_db(), _ok(msi_store.list_probes(g.current_db)))[1])


@msi_input_bp.route("/verifications", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def verifications():
    def run():
        require_business_db()
        probe_id = int_param(request.args, "probeId")
        verif_filter = request.args.get("verifFilter", "")
        if len(verif_filter) > MAX_FILTER_LEN:
            raise RouteInputError("verifId 필터가 너무 깁니다.")
        return _ok(msi_store.list_verifications(g.current_db, probe_id, verif_filter))

    return _guard(run)


@msi_input_bp.route("/probe-ids", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def probe_ids():
    return _guard(lambda: (require_business_db(), _ok(msi_store.list_probe_ids(g.current_db)))[1])


@msi_input_bp.route("/dump-records", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def dump_records():
    def run():
        require_business_db()
        probe_id = int_param(request.args, "probeId")
        verif_filter = request.args.get("verifFilter", "")
        if len(verif_filter) > MAX_FILTER_LEN:
            raise RouteInputError("verifId 필터가 너무 깁니다.")
        return _ok(msi_store.dump_records(g.current_db, probe_id, verif_filter))

    return _guard(run)


@msi_input_bp.route("/preview", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def preview():
    def run():
        require_business_db()
        body = json_body()
        plan = msi_store.preview(g.current_db, *_common_args(body))
        return _ok(plan.to_dict())

    return _guard(run)


@msi_input_bp.route("/create", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def create():
    def run():
        require_business_db()
        body = json_body()
        if body.get("confirm") is not True:
            raise RouteInputError("생성 확인(confirm)이 필요합니다.")
        args = _common_args(body)
        try:
            plan = msi_store.create(g.current_db, *args, body.get("planHash"))
        except msi_store.MsiConflictError as exc:
            return jsonify({"status": "error", "message": str(exc), "data": exc.plan.to_dict()}), 409
        logger.info(
            f"MSI input created by {g.current_user}: probeId={args[0]}, "
            f"mode={args[2]}, measSetIds={plan.created_ids}"
        )
        created = msi_store.meas_setting_rows(g.current_db, plan.created_ids)
        return _ok({**plan.to_dict(), "createdIds": plan.created_ids, "created": created})

    return _guard(run)
