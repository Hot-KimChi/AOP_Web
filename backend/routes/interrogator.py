"""Interrogator API — 레거시 RTP Display/Generation, Temp10 fitting, MATLAB 계산기."""

from flask import Blueprint, g, jsonify, request

from pkg_Interrogator import queries
from pkg_Interrogator.temperature_fit import (
    FitInputError,
    fit_aperture_1d,
    fit_aperture_2d,
    solve_tr_spectrum,
)
from routes._input import RouteInputError, int_param, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger

interrogator_bp = Blueprint("interrogator", __name__, url_prefix="/api/interrogator")


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _guard(fn):
    try:
        return fn()
    except (RouteInputError, FitInputError, queries.InterrogatorInputError) as exc:
        return error_response(str(exc), 400)


def _db_route(fn):
    def run():
        require_business_db()
        return fn()

    return _guard(run)


@interrogator_bp.route("/probes", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def probes():
    return _db_route(lambda: _ok(queries.list_probes(g.current_db)))


@interrogator_bp.route("/rtp-names", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def rtp_names():
    return _db_route(lambda: _ok(queries.list_rtp_names(g.current_db, int_param(request.args, "probeId"))))


@interrogator_bp.route("/rtp-display", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def rtp_display():
    return _db_route(lambda: _ok(queries.rtp_display(
        g.current_db, int_param(request.args, "probeId"), request.args.get("rtpName", ""))))


@interrogator_bp.route("/rtp-generate", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def rtp_generate():
    def run():
        body = json_body()
        if body.get("confirm") is not True:
            raise RouteInputError("RTP 생성 확인(confirm)이 필요합니다.")
        probe_id = int_param(body, "probeId")
        variant = body.get("variant", "standard")
        queries.generate_rtp(g.current_db, probe_id, variant)
        logger.info(f"RTP generation by {g.current_user}: probeId={probe_id}, variant={variant}")
        return _ok({"probeId": probe_id, "variant": variant})

    return _db_route(run)


@interrogator_bp.route("/rtp-names-all", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def rtp_names_all():
    return _db_route(lambda: _ok(queries.list_all_rtp_names(g.current_db)))


@interrogator_bp.route("/rtp-analysis", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def rtp_analysis():
    def run():
        body = json_body()
        name = body.get("rtpName", "")
        result = queries.rtp_analysis(g.current_db, name)
        logger.info(f"RTP analysis by {g.current_user}: rtpName={name!r}")
        return _ok(result)

    return _db_route(run)


@interrogator_bp.route("/temp10/stations", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def temp10_stations():
    return _db_route(lambda: _ok(queries.temp10_stations(g.current_db, int_param(request.args, "probeId"))))


@interrogator_bp.route("/temp10/sets", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def temp10_sets():
    return _db_route(lambda: _ok(queries.temp10_sets(
        g.current_db, int_param(request.args, "probeId"), int_param(request.args, "tempSSId"))))


def _temp10_ids(source) -> tuple[int, int, int]:
    return int_param(source, "probeId"), int_param(source, "tempSSId"), int_param(source, "tempSetId")


@interrogator_bp.route("/temp10/fit", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def temp10_fit():
    return _db_route(lambda: _ok(queries.temp10_fit(g.current_db, *_temp10_ids(json_body()))))


@interrogator_bp.route("/temp10/save", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def temp10_save():
    def run():
        body = json_body()
        if body.get("confirm") is not True:
            raise RouteInputError("저장 확인(confirm)이 필요합니다.")
        ids = _temp10_ids(body)
        result = queries.temp10_save(g.current_db, *ids)
        logger.info(f"temp10 fit saved by {g.current_user}: ids={ids}, saved={result['saved']}")
        return _ok(result)

    return _db_route(run)


def _optional_float(body: dict, key: str):
    value = body.get(key)
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.")
    try:
        out = float(value)
    except (TypeError, ValueError) as exc:
        raise RouteInputError(f"{key} 값이 올바르지 않습니다.") from exc
    if out <= 0 or out != out or out == float("inf"):
        raise RouteInputError(f"{key} 값은 양수여야 합니다.")
    return out


@interrogator_bp.route("/fit/aperture", methods=["POST"])
@handle_exceptions
@require_auth
def fit_aperture():
    def run():
        body = json_body()
        mode = body.get("mode")
        if mode == "1d":
            result = fit_aperture_1d(body.get("azAperCm"), body.get("tempRise"), body.get("normCoeff"),
                                     _optional_float(body, "azPitchCm"))
        elif mode == "2d":
            result = fit_aperture_2d(body.get("azAperCm"), body.get("elAperCm"), body.get("tempRise"),
                                     _optional_float(body, "azPitchCm"), _optional_float(body, "elPitchCm"))
        else:
            raise RouteInputError("mode 는 1d 또는 2d 여야 합니다.")
        return _ok(result.to_dict())

    return _guard(run)


@interrogator_bp.route("/fit/tr-spectrum", methods=["POST"])
@handle_exceptions
@require_auth
def fit_tr_spectrum():
    def run():
        body = json_body()
        return _ok(solve_tr_spectrum(body.get("sysSpectrum"), body.get("trMeas")))

    return _guard(run)
