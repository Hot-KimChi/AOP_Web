"""measSetInput(msiReader, "MSI Input From Excel") API.

원본: 11_소스_CompassTool_VB_2nd/measSetInput.vb. 계산은 pkg_MsiInput.excel_engine,
DB 는 pkg_MsiInput.excel_store 에 있고 이 모듈은 입력 검증과 응답만 맡는다.
"""

from __future__ import annotations

import io
import re

from flask import Blueprint, g, jsonify, request, send_file

from pkg_MsiInput import excel_engine as eng
from pkg_MsiInput import excel_store as xstore
from pkg_MsiInput.excel_io import parse_upload, write_xlsx
from pkg_MsiInput.excel_vb import MsiExcelError
from routes._input import RouteInputError, is_business_db, json_body, require_business_db
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response

msi_excel_bp = Blueprint("msi_excel", __name__, url_prefix="/api/msi-excel")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_SAFE_NAME = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def _ok(data):
    return jsonify({"status": "success", "data": data})


def _guard(fn):
    try:
        return fn()
    except (RouteInputError, MsiExcelError) as exc:
        return error_response(str(exc), 400)


def _file_name(name, default: str) -> str:
    if not isinstance(name, str) or name.strip() == "":
        return default
    return _SAFE_NAME.sub("_", name.strip())[:150]


@msi_excel_bp.route("/parse", methods=["POST"])
@handle_exceptions
@require_auth
def parse():
    def run():
        if not is_business_db(request.form.get("database")):
            raise RouteInputError("유효하지 않은 데이터베이스입니다.")
        up = request.files.get("file")
        if up is None or not up.filename:
            raise RouteInputError("파일을 선택하십시오.")
        data = up.stream.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise RouteInputError(f"파일이 너무 큽니다(최대 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB).")
        result = parse_upload(up.filename, data)
        result["fileName"] = up.filename
        return _ok(result)

    return _guard(run)


def _save(kind: str):
    def run():
        require_business_db()
        form = eng.form_from_body(json_body())
        if kind == "tank":
            return _ok(xstore.run_write(g.current_db, lambda repo: eng.save_tank(form, repo)))
        if kind == "power":
            return _ok(xstore.run_write(g.current_db, lambda repo: eng.save_power(form, repo)))
        return _ok(xstore.run_write(g.current_db, lambda repo: eng.save_temp(form, repo),
                                    resource=xstore.TEMP_APPLOCK_RESOURCE))

    return _guard(run)


@msi_excel_bp.route("/save-tank", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def save_tank():
    return _save("tank")


@msi_excel_bp.route("/save-power", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def save_power():
    return _save("power")


@msi_excel_bp.route("/save-temp", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def save_temp():
    return _save("temp")


@msi_excel_bp.route("/check-dup", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def check_dup():
    """#49: 저장 전 중복 조건 사전 검사(읽기 전용 — 쓰기 메서드는 PreviewRepo 가 막는다)."""
    def run():
        require_business_db()
        body = json_body()
        kind = body.get("kind")
        if kind not in eng.SAVE_KINDS:
            raise RouteInputError("kind 는 tank/power/temp 중 하나여야 합니다.")
        form = eng.form_from_body(body)
        return _ok(xstore.run_read(g.current_db, lambda repo: eng.check_duplicates(kind, form, repo)))

    return _guard(run)


@msi_excel_bp.route("/update-prf", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def update_prf():
    def run():
        require_business_db()
        body = json_body()
        pid = body.get("selectedProbeId")
        limit = body.get("tempLimit", "")
        if isinstance(pid, bool) or not isinstance(pid, (str, int, float, type(None))):
            raise RouteInputError("selectedProbeId 형식이 올바르지 않습니다.")
        if not isinstance(limit, (str, int, float)) or isinstance(limit, bool):
            raise RouteInputError("TempLimit 형식이 올바르지 않습니다.")
        return _ok(xstore.run_write(
            g.current_db, lambda repo: eng.update_prf(pid, str(limit)[:50], repo),
            resource=xstore.TEMP_APPLOCK_RESOURCE, timeout_s=xstore.PRF_TIMEOUT_S,
        ))

    return _guard(run)


@msi_excel_bp.route("/power-setids", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def power_setids():
    def run():
        require_business_db()
        rng = json_body().get("setRange", "")
        if not isinstance(rng, str) or len(rng) > 100:
            raise RouteInputError("SetId Range 형식이 올바르지 않습니다.")
        return _ok(xstore.run_read(g.current_db, lambda repo: eng.power_setid_text(rng, repo)))

    return _guard(run)


@msi_excel_bp.route("/export-xlsx", methods=["POST"])
@handle_exceptions
@require_auth
def export_xlsx():
    def run():
        body = json_body()
        form = eng.form_from_body({"columns": body.get("columns"), "rows": body.get("rows")})
        if not form.rows:
            raise MsiExcelError("Nothing in Selected RTP table. No new Excel file.")
        name = _file_name(body.get("fileName"), "Selected-Sel.xlsx")
        if not name.lower().endswith(".xlsx"):
            name += ".xlsx"
        data = write_xlsx(form.columns, form.rows)
        return send_file(io.BytesIO(data), as_attachment=True, download_name=name,
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    return _guard(run)
