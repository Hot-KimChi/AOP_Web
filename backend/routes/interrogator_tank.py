"""Tank Data Analysis API — 레거시 frmTank(intTank)·frmDetail·frmVoltageS 이식."""

from __future__ import annotations

import datetime as _dt
import io

from flask import Blueprint, g, jsonify, request, send_file

from pkg_Interrogator import tank
from pkg_MsiInput.store import open_raw_connection
from routes._input import RouteInputError, int_param, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger

interrogator_tank_bp = Blueprint("interrogator_tank", __name__, url_prefix="/api/interrogator/tank")

PROC_TIMEOUT_S = 2000  # 원본 SQLCmd.CommandTimeout


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _run(fn, *, write: bool = False, timeout: int | None = None):
    """업무 DB 검사 → raw 연결 1개에서 fn(cur) 실행 → 쓰기면 commit, 실패 시 rollback."""
    try:
        require_business_db()
        conn = open_raw_connection(g.current_db)
        driver = getattr(conn, "driver_connection", None) or getattr(conn, "dbapi_connection", None) or conn
        previous_timeout = getattr(driver, "timeout", 0)
        done = False
        try:
            if timeout:
                driver.timeout = timeout
            cur = conn.cursor()
            result = fn(cur)
            if write:
                conn.commit()
            else:
                conn.rollback()
            done = True
            return result
        finally:
            if not done:
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
    except (RouteInputError, tank.TankInputError) as exc:
        return error_response(str(exc), 400)


def _zmin(body: dict) -> float:
    v = body.get("zmin")
    return 0.5 if v in (None, "") else tank.to_float(v, "zmin")


def _confirm(body: dict) -> None:
    if body.get("confirm") is not True:
        raise RouteInputError("DB 변경 확인(confirm)이 필요합니다.")


@interrogator_tank_bp.route("/sw-versions", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def sw_versions():
    def fn(cur):
        return _ok(tank.sw_versions(cur, int_param(request.args, "probeId")))
    return _run(fn)


@interrogator_tank_bp.route("/records", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def get_records():
    """cmdGetRecords: pre_RTP_tank → lstMRI → 그리드 6개(zmin 포함). 같은 raw 연결에서 실행."""
    def fn(cur):
        body = json_body()
        _confirm(body)
        probe_id = int_param(body, "probeId")
        rtp_name = str(body.get("rtpName") or "")
        if len(rtp_name) > 30:
            raise RouteInputError("RTPName 이 너무 깁니다.")
        sw = tank.sw_version_param(body.get("swVersions"))
        zloc = tank.check_zloc(body.get("zloc"))
        tank.run_pre_rtp_tank(cur, probe_id, rtp_name, sw)
        payload = tank.records_payload(cur, zloc, None, after_proc=True)
        logger.info(f"pre_RTP_tank by {g.current_user}: probeId={probe_id}, rtp={rtp_name}, sw={sw}")
        return _ok(payload)
    return _run(fn, write=True, timeout=PROC_TIMEOUT_S)


@interrogator_tank_bp.route("/ok", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def use_checked():
    """cmdOK(Use checked MRI?): 프로시저 없이 기존 작업 테이블로 목록·그리드를 다시 읽는다."""
    def fn(cur):
        body = json_body()
        return _ok(tank.records_payload(cur, tank.check_zloc(body.get("zloc")), _zmin(body), after_proc=False))
    return _run(fn)


@interrogator_tank_bp.route("/mri-list", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def mri_list():
    """cmdUpdate: 1st~6th order 로 lstMRI 재조회."""
    def fn(cur):
        body = json_body()
        return _ok(tank.mri_list(cur, tank.order_clause(body.get("orders") or [])))
    return _run(fn)


@interrogator_tank_bp.route("/mark-all", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def mark_all():
    def fn(cur):
        _confirm(json_body())
        tank.mark_all(cur)
        return _ok(True)
    return _run(fn, write=True)


@interrogator_tank_bp.route("/mark", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def set_mark():
    def fn(cur):
        body = json_body()
        _confirm(body)
        tank.set_mark(cur, tank.check_resid(body.get("resId")), body.get("mark"))
        return _ok(True)
    return _run(fn, write=True)


@interrogator_tank_bp.route("/voltage-grid", methods=["GET", "POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def voltage_grid():
    """lstMRI_ItemCheck 의 voltage_grid 확인 / frmVoltageS.cmdSaveOk."""
    if request.method == "GET":
        def read(cur):
            pulse = str(request.args.get("pulseType") or "")
            return _ok(tank.voltage_grid_exists(cur, int_param(request.args, "probeId"), pulse))
        return _run(read)

    def write(cur):
        body = json_body()
        _confirm(body)
        probe_id = int_param(body, "probeId")
        pulse = str(body.get("pulseType") or "")
        vs = str(body.get("voltageString") or "")
        if len(pulse) > 100 or len(vs) > 4000:
            raise RouteInputError("입력이 너무 깁니다.")
        tank.insert_voltage_grid(cur, probe_id, pulse, vs)
        logger.info(f"voltage_grid insert by {g.current_user}: probeId={probe_id}, pulse={pulse}")
        return _ok(True)
    return _run(write, write=True)


@interrogator_tank_bp.route("/graphs", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def graphs():
    """DrawGraph: graphs 목록 각각에 대해 체크된 MRI 선 데이터."""
    def fn(cur):
        body = json_body()
        names = body.get("graphs") or list(tank.GRAPH_NAMES)
        if not isinstance(names, list):
            raise RouteInputError("graphs 가 올바르지 않습니다.")
        resids = tank.check_resids(body.get("resIds") or [])
        zloc = tank.check_zloc(body.get("zloc"))
        zmin = _zmin(body)
        return _ok([tank.draw_graph(cur, tank.check_graph(n), resids, zloc, zmin) for n in names])
    return _run(fn)


@interrogator_tank_bp.route("/edit-zloc", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def edit_zloc():
    def fn(cur):
        rid = tank.check_resid(request.args.get("resId"))
        return _ok(tank.edit_zloc_lookup(cur, rid, tank.check_zloc(request.args.get("zloc"))))
    return _run(fn)


@interrogator_tank_bp.route("/edit-graph", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def edit_graph():
    def fn(cur):
        body = json_body()
        return _ok(tank.edit_graph(cur, body.get("graph"), tank.check_resid(body.get("resId")),
                                   tank.check_zloc(body.get("zloc")), body.get("editZloc")))
    return _run(fn)


@interrogator_tank_bp.route("/save-edit", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def save_edit():
    def fn(cur):
        body = json_body()
        tank.save_edit(cur, body.get("graph"), body.get("bookmark"), body.get("x"), body.get("y"))
        logger.info(f"tank SaveEdit by {g.current_user}: graph={body.get('graph')}, key={body.get('bookmark')}")
        return _ok(True)
    return _run(fn, write=True)


@interrogator_tank_bp.route("/zdis", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def zdis():
    def fn(cur):
        rid = tank.check_resid(request.args.get("resId"))
        return _ok(tank.zdis(cur, rid, request.args.get("kind"), request.args.get("zloc") or "ztsii31Cm"))
    return _run(fn)


@interrogator_tank_bp.route("/z-locations", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def z_locations():
    def fn(cur):
        return _ok(tank.z_locations(cur, tank.check_resid(request.args.get("resId"))))
    return _run(fn)


@interrogator_tank_bp.route("/auto-check", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def auto_check():
    """DrawAutoMiPiiCheck: 점검 결과와 원래/보정 선."""
    def fn(cur):
        body = json_body()
        return _ok(tank.auto_check(
            cur, body.get("graph"), tank.check_resid(body.get("resId")), tank.to_float(body.get("key"), "z"),
            body.get("editZloc"), tank.check_zloc(body.get("zloc")), _zmin(body)))
    return _run(fn)


@interrogator_tank_bp.route("/auto-check/save", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def auto_check_save():
    """SaveAutoCheck: 같은 입력으로 다시 점검해 플래그된 점만 UPDATE."""
    def fn(cur):
        body = json_body()
        _confirm(body)
        rid = tank.check_resid(body.get("resId"))
        n = tank.save_auto_check(cur, body.get("graph"), rid, tank.to_float(body.get("key"), "z"))
        logger.info(f"tank SaveAutoCheck by {g.current_user}: graph={body.get('graph')}, resId={rid}, rows={n}")
        return _ok({"updated": n})
    return _run(fn, write=True)


@interrogator_tank_bp.route("/auto-check-all-mri", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def auto_check_all_mri():
    def fn(cur):
        body = json_body()
        _confirm(body)
        res = tank.auto_check_all_mri(cur, tank.check_zloc(body.get("zloc")), _zmin(body))
        logger.info(f"tank AutoEdit all MRI by {g.current_user}: updated={res['updated']}")
        return _ok(res)
    return _run(fn, write=True, timeout=PROC_TIMEOUT_S)


@interrogator_tank_bp.route("/details", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def details():
    def fn(cur):
        body = json_body()
        return _ok(tank.detail_grid(cur, tank.check_resids(body.get("resIds") or []), body.get("selectAll") is True))
    return _run(fn)


def _wave_cases(body: dict) -> tuple[list[tuple[int, str, str]], int]:
    cases = body.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 2:
        raise RouteInputError("Please input 1st and 2nd zLocations")
    out = []
    for c in cases:
        if not isinstance(c, dict) or str(c.get("z") or "").strip() == "":
            raise RouteInputError("Please input 1st and 2nd zLocations")
        z_text = str(c.get("z")).strip()
        out.append((tank.check_resid(c.get("resId")), z_text, tank.decimal_text(z_text, "zLoc")))
    delay_raw = body.get("delay")
    delay = 0 if delay_raw in (None, "") else int_param(body, "delay", minimum=-32768, maximum=32767)
    return out, delay


@interrogator_tank_bp.route("/waveform", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def waveform():
    """frmDetail.cmdPlot."""
    def fn(cur):
        cases, delay = _wave_cases(json_body())
        waves = [tank.fetch_waveform(cur, rid, z) for rid, _text, z in cases]
        return _ok(tank.build_waveforms(waves, delay))
    return _run(fn)


@interrogator_tank_bp.route("/waveform-xlsx", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def waveform_xlsx():
    """frmDetail.cmdSave: Excel COM 저장 → xlsx 다운로드."""
    def fn(cur):
        body = json_body()
        if not str(body.get("excelFile") or "").strip():
            raise RouteInputError("Please input 1st, 2nd zLocations and excel file name. ")
        cases, _delay = _wave_cases(body)
        data = tank.waveform_xlsx([(rid, text, tank.fetch_waveform(cur, rid, z)) for rid, text, z in cases])
        name = tank.excel_filename(body.get("excelFile"))
        return send_file(
            io.BytesIO(data), as_attachment=True, download_name=name,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            last_modified=_dt.datetime.now())
    return _run(fn)
