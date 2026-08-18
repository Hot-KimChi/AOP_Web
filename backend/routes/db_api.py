from flask import Blueprint, request, jsonify, g, Response
import os, io, json, re
from io import StringIO
from pathlib import Path
from docx import Document
from utils.decorators import handle_exceptions, require_auth, with_db_connection
from utils.error_handler import error_response
from utils.logger import logger
import pandas as pd
import numpy as np

db_api_bp = Blueprint("db_api", __name__, url_prefix="/api")

# (database, table) -> {소문자 컬럼명: 실제 컬럼명}. 스키마는 런타임 중 바뀌지 않으므로
# 요청마다 INFORMATION_SCHEMA를 조회하는 왕복 비용을 제거한다.
_COLUMN_CACHE: dict = {}


def _is_allowed_database(database_name: str) -> bool:
    raw = os.environ.get("DATABASE_NAME", "")
    allowed = {d.strip() for d in raw.split(",") if d.strip()}
    return database_name in allowed


def _get_column_lookup(database: str, table: str) -> dict:
    cache_key = (str(database).strip().lower(), str(table).strip().lower())
    cached = _COLUMN_CACHE.get(cache_key)
    if cached is not None:
        return cached
    if not _is_allowed_database(database):
        return {}
    schema_df = g.current_db.execute_query(
        f"SELECT COLUMN_NAME FROM [{database}].INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?",
        params=(table,),
    )
    actual_columns = (
        [str(c) for c in schema_df["COLUMN_NAME"].tolist()]
        if schema_df is not None and not schema_df.empty
        else []
    )
    lookup = {c.strip().lower(): c for c in actual_columns}
    if lookup:
        _COLUMN_CACHE[cache_key] = lookup
    return lookup


_ALLOWED_TX_EXTENSIONS = (".csv", ".txt")


def _is_allowed_tx_file(filename: str) -> bool:
    return bool(filename) and filename.strip().lower().endswith(_ALLOWED_TX_EXTENSIONS)


def _read_tx_dataframe(file_storage) -> pd.DataFrame:
    """Tx summary 입력 파일(CSV/TXT)을 DataFrame으로 읽는다.

    TXT(`날짜_ProbeName_TxRequestSummary.txt`)는 tab 등 구분자가 다를 수 있어
    sniffing으로 판별하고, 실패 시 tab 구분자로 재시도한다.
    """
    raw_bytes = file_storage.read()
    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = raw_bytes.decode("cp949")
    filename = (file_storage.filename or "").strip().lower()
    if filename.endswith(".txt"):
        try:
            return pd.read_csv(
                StringIO(content),
                sep=None,
                engine="python",
                keep_default_na=False,
            )
        except Exception:
            return pd.read_csv(StringIO(content), sep="\t", keep_default_na=False)
    return pd.read_csv(StringIO(content), keep_default_na=False)


def compute_combined_mode(mode: str) -> int:
    """Mode 문자열을 기준으로 combined_mode 계산 (0 또는 1)"""
    if not mode:
        return 0
    mode_str = str(mode).strip().upper()
    # Mode='M' (또는 'M*') → combined_mode=1, 나머지는 0
    if mode_str == 'M' or mode_str.startswith('M'):
        return 1
    return 0


@db_api_bp.route("/insert-sql", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def insert_sql_measset():
    data = request.get_json()
    table_name = data.get("table")
    records = data.get("data")
    if not table_name or not records:
        return error_response("Invalid data: table and data fields are required", 400)
    allowed_insert_tables = ["meas_setting"]
    if table_name not in allowed_insert_tables:
        return error_response("유효하지 않은 테이블 이름입니다", 400)
    try:
        json_str = json.dumps(records)
        df = pd.read_json(StringIO(json_str), orient="records")
    except Exception as e:
        logger.error(f"DataFrame conversion error: {str(e)}")
        return error_response("Failed to parse records into DataFrame", 500)
    try:
        g.current_db.insert_data(table_name, df)
        return (
            jsonify({"status": "success", "message": "Data inserted successfully"}),
            200,
        )
    except Exception as e:
        logger.error(f"Data insertion failed: {str(e)}", exc_info=True)
        return error_response(str(e), 500)


@db_api_bp.route("/csv-data", methods=["GET"])
@handle_exceptions
@require_auth
def get_csv_data():
    csv_key = request.args.get("csv_key")
    if not csv_key:
        return error_response("csv_key is required", 400)

    # 경로 탐색 공격 방지: 절대 경로로 변환 후 프로젝트 루트 내에 있는지 검증
    try:
        file_path = Path(csv_key).resolve()
        project_root = Path(os.getcwd()).resolve()
        file_path.relative_to(project_root)
    except ValueError:
        logger.warning(f"Path traversal attempt blocked: {csv_key!r}")
        return error_response("Invalid file path", 400)
    except Exception:
        return error_response("Invalid file path", 400)

    if not file_path.exists():
        return error_response("CSV data not found", 404)
    with open(file_path, "r", encoding="utf-8") as f:
        csv_data = f.read()
    return jsonify({"status": "success", "data": csv_data}), 200


@db_api_bp.route("/get_list_database", methods=["GET"])
@handle_exceptions
@require_auth
def get_list_database():
    raw = os.environ.get("DATABASE_NAME", "")
    databases = [d.strip() for d in raw.split(",") if d.strip()]
    return jsonify({"status": "success", "databases": databases})


@db_api_bp.route("/get_list_table", methods=["GET"])
@handle_exceptions
@require_auth
def get_list_table():
    raw = os.environ.get("SERVER_TABLE_TABLE", "")
    tables = [t.strip() for t in raw.split(",") if t.strip()]
    return jsonify({"status": "success", "tables": tables})


@db_api_bp.route("/get_probes", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def get_probes():
    selected_database = request.args.get("database")
    selected_table = request.args.get("table")
    logger.info(f"Database: {selected_database}, Table: {selected_table}")
    allowed_tables = ["Tx_summary", "probe_geo"]
    if selected_table not in allowed_tables:
        return (
            jsonify({"status": "error", "message": "유효하지 않은 테이블 이름입니다"}),
            400,
        )
    query = f"SELECT probeId, probeName FROM [{selected_table}]"
    df = g.current_db.execute_query(query)
    df["probeId"] = df["probeId"].fillna("Empty")
    df_unique = df.drop_duplicates(subset=["probeId", "probeName"])
    df_unique = df_unique.sort_values(by="probeName").reset_index(drop=True)
    df_unique["_id"] = df_unique["probeId"].astype(str) + "_" + df_unique.index.astype(str)
    probes = df_unique[["probeId", "probeName", "_id"]].to_dict("records")
    return jsonify({"status": "success", "probes": probes})


@db_api_bp.route("/get_table_data", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def get_table_data():
    selected_database = request.args.get("database")
    selected_table = request.args.get("table")
    logger.info(f"Database: {selected_database}, Table: {selected_table}")
    allowed_tables = ["Tx_summary", "probe_geo", "WCS", "meas_station_setup"]
    if selected_table not in allowed_tables:
        return (
            jsonify({"status": "error", "message": "유효하지 않은 테이블 이름입니다"}),
            400,
        )
    if selected_table == "meas_station_setup":
        df = g.current_db.execute_query(
            f"SELECT measSSId, measComments, probeId, measPersonName, measPurpose, imagingSysSn, probeSn, hydrophId, imagingSwVersion FROM [{selected_table}] where measPurpose not like '%Beamstyle%' order by measSSId desc"
        )
        data = df.to_dict(orient="records") if df is not None else []
        columns = list(df.columns) if df is not None else []
        return jsonify({"status": "success", "data": data, "columns": columns})
    if selected_table == "Tx_summary":
        query = f"SELECT DISTINCT ProbeID AS probeId, ProbeName AS probeName, Software_version AS software_version FROM [{selected_table}] ORDER BY software_version DESC"
    elif selected_table == "WCS":
        query = f"SELECT DISTINCT probeId, LTRIM(RTRIM(CAST(myVersion AS NVARCHAR(255)))) AS myVersion FROM [{selected_table}] ORDER BY myVersion DESC"
    else:
        query = f"SELECT DISTINCT probeId, probeName FROM [{selected_table}]"
    df = g.current_db.execute_query(query)
    if selected_table == "WCS":
        df = df.dropna(subset=["probeId", "myVersion"])
    else:
        df = df.dropna(subset=["probeId", "probeName"])
    response_data = {
        "status": "success",
        "hasSoftwareData": selected_table == "Tx_summary",
    }
    if selected_table == "WCS":
        df["probeId"] = df["probeId"].astype(str)
        df["myVersion"] = df["myVersion"].astype(str).str.replace(r'\s+', '', regex=True)
        df = df.drop_duplicates(subset=["probeId", "myVersion"]).reset_index(drop=True)
        df["_id"] = "wcs_" + df.index.astype(str)
        response_data["wcsVersions"] = df[["probeId", "myVersion", "_id"]].to_dict("records")
        return jsonify(response_data)
    df_probes = df.drop_duplicates(subset=["probeId", "probeName"])
    df_probes = df_probes.sort_values(by="probeName").reset_index(drop=True)
    df_probes["probeId"] = df_probes["probeId"].astype(str)
    df_probes["probeName"] = df_probes["probeName"].astype(str)
    df_probes["_id"] = df_probes["probeId"] + "_" + df_probes.index.astype(str)
    probes = df_probes[["probeId", "probeName", "_id"]].to_dict("records")
    response_data["probes"] = probes
    if selected_table == "Tx_summary":
        df["software_version"] = df["software_version"].fillna("Empty")
        df["software_version"] = df["software_version"].astype(str)
        df_software = df.drop_duplicates(subset=["software_version"])
        df_software = df_software.sort_values(
            by="software_version", key=lambda x: x.astype(str)
        )
        # probe_software_map: groupby로 O(n²) 중복 탐지 제거
        df_sw_map = df[["probeId", "software_version"]].copy()
        df_sw_map["probeId"] = df_sw_map["probeId"].astype(str)
        df_sw_map = df_sw_map[df_sw_map["software_version"].str.lower() != "empty"]
        probe_software_map = {
            probe_id: [{"softwareVersion": v} for v in group["software_version"].unique()]
            for probe_id, group in df_sw_map.groupby("probeId", sort=False)
        }
        # software 목록 벡터화
        df_sw_filtered = df_software[
            df_software["software_version"].str.lower() != "empty"
        ].reset_index(drop=True)
        df_sw_filtered["_id"] = "sw_version_" + df_sw_filtered.index.astype(str)
        software = df_sw_filtered.rename(
            columns={"software_version": "softwareVersion"}
        )[["softwareVersion", "_id"]].to_dict("records")
        response_data["software"] = software
        response_data["mapping"] = probe_software_map
    return jsonify(response_data)


@db_api_bp.route("/get_imaging_sw_versions", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def get_imaging_sw_versions():
    selected_database = request.args.get("database")
    probe_id = request.args.get("probeId")
    if not selected_database or not probe_id:
        return error_response("database, probeId 파라미터가 필요합니다.", 400)
    if not _is_allowed_database(selected_database):
        return error_response("유효하지 않은 database 이름입니다.", 400)
    normalized_probe_id = _normalize_probe_id(probe_id)
    try:
        probe_id_param = int(normalized_probe_id)
    except Exception:
        return error_response("probeId는 정수 값이어야 합니다.", 400)
    query = (
        "SELECT softwareVersion FROM ("
        "  SELECT "
        "    LTRIM(RTRIM(CAST(imagingSwVersion AS NVARCHAR(255)))) AS softwareVersion, "
        "    MAX(measSSId) AS latestMeasSSId "
        f"  FROM [{selected_database}].[dbo].[meas_station_setup] "
        "  WHERE probeId = ? "
        "    AND imagingSwVersion IS NOT NULL "
        "    AND LTRIM(RTRIM(CAST(imagingSwVersion AS NVARCHAR(255)))) <> '' "
        "  GROUP BY LTRIM(RTRIM(CAST(imagingSwVersion AS NVARCHAR(255))))"
        ") versions "
        "ORDER BY latestMeasSSId DESC"
    )
    df = g.current_db.execute_query(query, params=(probe_id_param,))
    if df is None or df.empty:
        return jsonify({"status": "success", "softwareVersions": []})
    software_values = df["softwareVersion"].astype(str).tolist()
    software_versions = [
        {"softwareVersion": version, "_id": f"imaging_sw_{idx}"}
        for idx, version in enumerate(software_values)
        if version
    ]
    return jsonify({"status": "success", "softwareVersions": software_versions})


def _normalize_probe_id(value):
    if value is None:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    try:
        return str(int(float(raw)))
    except Exception:
        return raw


@db_api_bp.route("/preview_tx_summary_file", methods=["POST"])
@handle_exceptions
@require_auth
def preview_tx_summary_file():
    if "file" not in request.files:
        return error_response("No file provided", 400)
    file = request.files["file"]
    if not _is_allowed_tx_file(file.filename):
        return error_response("CSV 또는 TXT 파일만 업로드할 수 있습니다.", 400)
    try:
        df = _read_tx_dataframe(file)
    except Exception as e:
        logger.error(f"Tx summary preview parse error: {str(e)}", exc_info=True)
        return error_response("파일 파싱에 실패했습니다.", 400)
    if df is None or df.empty:
        return jsonify({"status": "success", "previewData": [], "columns": []})
    df = df.replace({np.nan: None})
    preview_df = df.head(300)
    return jsonify(
        {
            "status": "success",
            "previewData": preview_df.to_dict(orient="records"),
            "columns": list(preview_df.columns),
            "rowCount": int(len(df)),
        }
    )


@db_api_bp.route("/validate_tx_summary_file", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def validate_tx_summary_file():
    if "file" not in request.files:
        return error_response("No file provided", 400)
    selected_database = request.form.get(
        "database", os.environ.get("SERVER_NAME_DB", "AOP_DB")
    )
    selected_probe_id = request.form.get("probeId")
    selected_sw_version = request.form.get("softwareVersion")
    selected_probe_name = (request.form.get("probeName") or "").strip()
    if not selected_probe_id or not selected_sw_version:
        return error_response("probeId, softwareVersion 파라미터가 필요합니다.", 400)
    if not selected_database or not _is_allowed_database(selected_database):
        return error_response("유효하지 않은 database 이름입니다.", 400)
    file = request.files["file"]
    if not _is_allowed_tx_file(file.filename):
        return error_response("CSV 또는 TXT 파일만 업로드할 수 있습니다.", 400)

    # ── 파일 읽기 ──
    df_raw = None
    file_parse_warning = None
    try:
        df_raw = _read_tx_dataframe(file)
        if df_raw is not None and not df_raw.empty:
            valid_idxs = [i for i, col in enumerate(df_raw.columns) if str(col).strip()]
            df_raw = df_raw.iloc[:, valid_idxs]
    except Exception as e:
        logger.warning(f"Tx summary file parse warning: {str(e)}")
        file_parse_warning = str(e)

    # ── DB에서 probe+sw 기준 전체 컬럼 조회 (reference) ──
    selected_probe_norm = _normalize_probe_id(selected_probe_id)
    selected_sw_norm = str(selected_sw_version).strip()
    db_probe_param = selected_probe_norm
    try:
        db_probe_param = int(selected_probe_norm)
    except Exception:
        pass

    db_match_df = g.current_db.execute_query(
        f"SELECT TOP 500 * FROM [{selected_database}].[dbo].[Tx_summary] "
        "WHERE ProbeID = ? "
        "  AND LTRIM(RTRIM(CAST(Software_version AS NVARCHAR(255)))) = LTRIM(RTRIM(CAST(? AS NVARCHAR(255))))",
        params=(db_probe_param, selected_sw_norm),
    )
    db_has_matching_rows = db_match_df is not None and not db_match_df.empty

    # ProbeID/SW 필터 매칭 없으면 → 컬럼 구조 참조용으로 TOP 1 조회
    if not db_has_matching_rows:
        db_schema_df = g.current_db.execute_query(
            f"SELECT TOP 1 * FROM [{selected_database}].[dbo].[Tx_summary]"
        )
    else:
        db_schema_df = db_match_df

    # ── 컬럼 매핑: 파일 컬럼 → DB 컬럼명 (퍼지 매칭) ──
    # 알파뉴메릭만 남긴 키로 비교 (예: "Probe_ID" → "probeid", "ProbeID" → "probeid")
    import re as _re
    def _alphanumeric_key(s):
        return _re.sub(r'[^a-z0-9]', '', str(s).strip().lower())

    df_norm = None
    column_map_log = {}          # {파일 원본 컬럼: 매핑된 DB 컬럼}
    unmapped_file_cols = []      # 매핑 못한 파일 컬럼 목록

    if df_raw is not None and not df_raw.empty:
        column_lookup = _get_column_lookup(selected_database, "Tx_summary")
        # 두 단계 룩업: ① 정확한 소문자 ② 알파뉴메릭 키
        alpha_lookup = {_alphanumeric_key(k): v for k, v in column_lookup.items()}

        col_map = {}
        for col in df_raw.columns:
            exact_key = str(col).strip().lower()
            alpha_key = _alphanumeric_key(col)
            if exact_key in column_lookup:
                col_map[col] = column_lookup[exact_key]
                column_map_log[col] = column_lookup[exact_key]
            elif alpha_key in alpha_lookup:
                col_map[col] = alpha_lookup[alpha_key]
                column_map_log[col] = alpha_lookup[alpha_key]
            else:
                unmapped_file_cols.append(col)

        df_norm = df_raw.rename(columns=col_map)
        logger.info(f"Column mapping: {column_map_log}, unmapped: {unmapped_file_cols}")

    # ── 파일 필터링: ProbeID+SW 있으면 필터, 없으면 전체 사용 ──
    df_filtered = None
    matches_selection = False
    file_probe_values = []
    file_sw_values = []

    if df_norm is not None and not df_norm.empty:
        if "ProbeID" in df_norm.columns and "Software_version" in df_norm.columns:
            normalized_probe_series = df_norm["ProbeID"].map(_normalize_probe_id)
            normalized_sw_series = df_norm["Software_version"].astype(str).str.strip()
            filtered = df_norm[
                (normalized_probe_series == selected_probe_norm)
                & (normalized_sw_series == selected_sw_norm)
            ]
            # 선택값 필터 결과가 비어도 파일 전체를 보여줘야 하므로 fallback 사용
            df_filtered = filtered if not filtered.empty else df_norm
            matches_selection = not filtered.empty
            file_probe_values = sorted(
                {v for v in normalized_probe_series.dropna().tolist() if str(v).strip()}
            )
            file_sw_values = sorted(
                {v for v in normalized_sw_series.dropna().tolist() if str(v).strip()}
            )
        else:
            df_filtered = df_norm
            matches_selection = True

    # ── DB 기준 파라미터별 비교 rows 생성 ──
    # db_has_matching_rows이면 DB값+파일값 비교, 아니면 파일값만 표시 (컬럼 구조는 db_schema_df 사용)
    comparison_rows = []
    parameter_order = [
        "TxSummaryID",
        "ProbeName",
        "ExamName",
        "Mode",
        "SubModeIndex",
        "BeamStyleIndex",
        "TxFreqIndex",
        "ProbeNumElevAper",
        "ProbeNumTxCycles",
        "TxpgWaveformStyle",
        "TxChannelModulationEn",
        "CompoundingIndex",
        "TxPulseRle",
        "IsPresetCpaEn",
        "IsProcessed",
        "ProbeID",
        "Software_version",
        "Combined_mode",
        "TxFrequency",
    ]
    schema_ref = db_schema_df if (db_schema_df is not None and not db_schema_df.empty) else None

    db_match_records = []

    if schema_ref is not None:
        schema_cols = list(schema_ref.columns)
        schema_col_map = {str(c).strip().lower(): c for c in schema_cols}
        db_cols = [c for c in parameter_order if c != "Mode"]

        # DB Mode별 행 매핑 (ProbeID/SW 매칭 있을 때만)
        db_by_mode = {}
        if db_has_matching_rows and "Mode" in db_match_df.columns:
            db_match_records = db_match_df.replace({np.nan: None}).to_dict(
                orient="records"
            )
            for row in db_match_records:
                db_by_mode[str(row.get("Mode", "")).strip()] = row

        # 파일 Mode별 행 목록 매핑 (같은 Mode 여러 행 모두 저장)
        file_rows_by_mode: dict = {}
        if df_filtered is not None and not df_filtered.empty:
            file_records = df_filtered.replace({np.nan: None}).to_dict(orient="records")
            mode_col = next(
                (
                    c
                    for c in df_filtered.columns
                    if str(c).strip().lower() == "mode"
                ),
                None,
            )
            if mode_col is not None:
                for row in file_records:
                    mode_key = str(row.get(mode_col, "")).strip()
                    file_rows_by_mode.setdefault(mode_key, []).append(row)
            else:
                # Mode 컬럼 없으면 전체 행을 빈 모드로
                for row in file_records:
                    file_rows_by_mode.setdefault("", []).append(row)

        # Mode 목록 결정: txt 파일 Mode를 우선 사용
        if file_rows_by_mode:
            all_modes = sorted(file_rows_by_mode.keys())
            if db_by_mode:
                for db_mode in sorted(db_by_mode.keys()):
                    if db_mode not in all_modes:
                        all_modes.append(db_mode)
        elif db_by_mode:
            all_modes = sorted(db_by_mode.keys())
        else:
            all_modes = [""]

        row_no = 1
        for mode in all_modes:
            db_row = db_by_mode.get(mode)
            file_rows = file_rows_by_mode.get(mode) or [None]

            for file_row in file_rows:
                status = "DB_ONLY" if file_row is None else ("BOTH" if db_row is not None else "FILE_ONLY")

                for param in db_cols:
                    actual_db_col = schema_col_map.get(param.lower(), param)

                    dv = "—"
                    if db_row is not None and actual_db_col in db_row:
                        raw_dv = db_row.get(actual_db_col)
                        dv = (
                            "—"
                            if raw_dv is None
                            or str(raw_dv).lower() in ("nan", "none", "")
                            else str(raw_dv)
                        )

                    # fv 구분:
                    #   "UNMATCHED" → 파일에 파라미터 컬럼 자체가 없음 (매핑 불가)
                    #   "NULL"      → 파라미터 컬럼은 있으나 값이 null/비어있음
                    #   실제 문자열 → 정상 데이터
                    fv = "UNMATCHED"

                    if param == "ProbeID":
                        fv = selected_probe_norm or "NULL"
                    elif param == "Software_version":
                        fv = selected_sw_norm or "NULL"
                    elif param == "ProbeName":
                        fv = selected_probe_name or "NULL"
                    elif param == "Combined_mode":
                        mode_len = len(str(mode or "").strip())
                        fv = "0" if mode_len == 1 else ("1" if mode_len >= 2 else "NULL")
                    elif param == "IsProcessed":
                        fv = "1"
                    else:
                        if file_row is not None:
                            lookup = {str(c).strip().lower(): c for c in file_row}

                            candidate_cols = []
                            if param == "ExamName":
                                candidate_cols = [
                                    "ExamName",
                                    "Exam",
                                    "exam",
                                    "Exam_Name",
                                ]
                            else:
                                candidate_cols = [
                                    param,
                                    actual_db_col,
                                ]

                            matched_col = None
                            for cand in candidate_cols:
                                if cand in file_row:
                                    matched_col = cand
                                    break
                                lower_cand = str(cand).strip().lower()
                                if lower_cand in lookup:
                                    matched_col = lookup[lower_cand]
                                    break

                            if matched_col is not None:
                                raw_fv = file_row[matched_col]
                                if raw_fv is None or str(raw_fv).lower() in (
                                    "nan",
                                    "none",
                                    "",
                                ):
                                    fv = "NULL"
                                else:
                                    fv = str(raw_fv)

                    matched = fv not in ("UNMATCHED", "NULL")

                    comparison_rows.append({
                        "No": row_no,
                        "Mode": mode,
                        "Parameter": param,
                        "DBValue": dv,
                        "FileValue": fv,
                        "Match": "O" if matched else "X",
                        "Status": status,
                    })
                row_no += 1

    matching_rows_simple = (
        db_match_records
        if db_has_matching_rows else []
    )

    # 메시지 결정
    excluded_for_match = {
        "TxSummaryID",
        "ProbeID",
        "Software_version",
        "ProbeName",
        "IsProcessed",
        "Combined_mode",
    }
    effective_rows = [
        r
        for r in comparison_rows
        if r.get("Parameter") not in excluded_for_match
    ]
    if file_parse_warning:
        message = f"파일 파싱 경고: {file_parse_warning}"
    elif not db_has_matching_rows and not comparison_rows:
        message = "선택한 Probe/Software 버전이 Tx_summary 테이블에 없습니다."
    elif not db_has_matching_rows:
        mismatch_cnt = sum(1 for r in effective_rows if r.get("Match") == "X")
        total_params = len(set(r["Parameter"] for r in effective_rows))
        message = (
            f"비교 완료: {total_params}개 파라미터 기준 "
            f"{mismatch_cnt}개 매핑 불가 "
            f"(TxSummaryID/ProbeID/SW/ProbeName/IsProcessed/Combined_mode 제외)"
        )
    else:
        mismatch_cnt = sum(1 for r in effective_rows if r.get("Match") == "X")
        total_cnt = len(effective_rows)
        mapped_cnt = len(column_map_log) if column_map_log else 0
        message = (
            f"비교 완료: {total_cnt}개 기준 {mismatch_cnt}개 불일치 "
            f"(TxSummaryID/ProbeID/SW/ProbeName/IsProcessed/Combined_mode 제외, 파일 컬럼 매핑: {mapped_cnt}개)"
        )

    return jsonify(
        {
            "status": "success",
            "validation": {
                "matchesSelection": matches_selection,
                "dbHasMatchingRows": db_has_matching_rows,
                "fileProbeIds": file_probe_values,
                "fileSoftwareVersions": file_sw_values,
                "selectedProbeId": selected_probe_norm,
                "selectedSoftwareVersion": selected_sw_norm,
                "matchingCount": len(matching_rows_simple),
                "matchingRows": matching_rows_simple,
                "comparisonRows": comparison_rows,
                "parameterOrder": parameter_order,
                "columnMapLog": column_map_log,
                "unmappedFileCols": unmapped_file_cols,
                "message": message,
            },
        }
    )


@db_api_bp.route("/run_tx_compare", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def run_tx_compare():
    if not request.is_json:
        return error_response(
            "요청 형식이 잘못되었습니다. JSON 형식이 필요합니다.", 400
        )
    data = request.get_json()
    required_params = ["probeId", "TxSumSoftware", "wcsSoftware"]
    missing_params = [param for param in required_params if not data.get(param)]
    if missing_params:
        return error_response(
            f"필수 파라미터가 누락되었습니다: {', '.join(missing_params)}", 400
        )
    ssid_temp = data.get("measSSId_Temp")
    ssid_mi = data.get("measSSId_MI")
    ssid_ispta3 = data.get("measSSId_Ispta")
    if not (ssid_temp or ssid_mi or ssid_ispta3):
        return error_response(
            "measSSId_Temp, measSSId_MI, measSSId_Ispta 중 적어도 하나는 입력해야 합니다.",
            400,
        )
    probeid = int(float(data.get("probeId")))
    tx_sw = re.sub(r'\s+', '', str(data.get("TxSumSoftware") or ""))
    wcs_sw = re.sub(r'\s+', '', str(data.get("wcsSoftware") or ""))
    ssid_temp = None if ssid_temp == "" or ssid_temp is None else ssid_temp
    ssid_mi = None if ssid_mi == "" or ssid_mi is None else ssid_mi
    ssid_ispta3 = None if ssid_ispta3 == "" or ssid_ispta3 is None else ssid_ispta3
    logger.info(
        f"TxCompare 실행 요청: probeId={probeid}, Tx_SW={tx_sw}, WCS_SW={wcs_sw}, SSid_Temp={ssid_temp}, SSid_MI={ssid_mi}, SSid_Ispta3={ssid_ispta3}"
    )
    params = (probeid, tx_sw, wcs_sw, ssid_temp, ssid_mi, ssid_ispta3)
    result_df = g.current_db.execute_procedure("TxCompare", params)

    result_df = result_df.replace({np.nan: None})
    if result_df is None or result_df.empty:
        return (
            jsonify(
                {
                    "status": "success",
                    "message": "비교 보고서 데이터가 없습니다.",
                    "reportData": [],
                }
            ),
            200,
        )
    report_data = result_df.to_dict(orient="records")
    columns = list(result_df.columns)
    return (
        jsonify(
            {
                "status": "success",
                "message": "비교 보고서 데이터를 성공적으로 추출했습니다.",
                "reportData": report_data,
                "columns": columns,
            }
        ),
        200,
    )


@db_api_bp.route("/export_table_to_word", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def export_table_to_word():
    selected_database = request.args.get("database")
    selected_table = request.args.get("table")
    measSSIds = request.args.get("measSSIds")
    if not selected_database or not selected_table:
        return error_response("database, table 파라미터가 필요합니다", 400)
    # SQL 인젝션 방지: 테이블명 allowlist 검증
    allowed_export_tables = ["SSR_table", "Tx_summary", "probe_geo", "WCS", "meas_station_setup"]
    if selected_table not in allowed_export_tables:
        return (
            jsonify({"status": "error", "message": "유효하지 않은 테이블 이름입니다"}),
            400,
        )
    if measSSIds:
        id_list = [int(s) for s in measSSIds.split(",") if s.strip().isdigit()]
        if not id_list:
            return error_response("measSSIds 파라미터가 올바르지 않습니다", 400)
        placeholders = ",".join(["?" for _ in id_list])
        query = f"SELECT * FROM [{selected_table}] WHERE measSSId IN ({placeholders})"
        df = g.current_db.execute_query(query, params=id_list)
    else:
        query = f"SELECT * FROM [{selected_table}]"
        df = g.current_db.execute_query(query)
    if df is None or df.empty:
        return error_response("해당 테이블에 데이터가 없습니다", 404)
    doc = Document()
    doc.add_heading(f"Table: {selected_table}", 0)
    table = doc.add_table(rows=1, cols=len(df.columns))
    hdr_cells = table.rows[0].cells
    for i, col in enumerate(df.columns):
        hdr_cells[i].text = str(col)
    for row_values in df.fillna("").astype(str).values.tolist():
        row_cells = table.add_row().cells
        for i, value in enumerate(row_values):
            row_cells[i].text = value
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    filename = f"{selected_table}.docx"
    return Response(
        buf.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@db_api_bp.route("/upload_tx_summary", methods=["POST"])
@handle_exceptions
@require_auth
@with_db_connection()
def upload_tx_summary():
    """TX Summary 파일(CSV/TXT)을 DB의 Tx_summary 테이블에 업로드"""
    if "file" not in request.files:
        return error_response("No file provided", 400)
    
    file = request.files["file"]
    if not _is_allowed_tx_file(file.filename):
        return error_response("CSV 또는 TXT 파일만 업로드할 수 있습니다.", 400)
    
    selected_database = request.form.get("database", os.environ.get("SERVER_NAME_DB", "AOP_DB"))
    selected_probe_id = request.form.get("probeId")
    selected_sw_version = request.form.get("softwareVersion")
    selected_probe_name = (request.form.get("probeName") or "").strip()
    
    try:
        # 입력 파일 읽기 (TXT는 구분자 자동 감지)
        df = _read_tx_dataframe(file)
        
        if df.empty:
            return error_response("파일에 데이터가 없습니다.", 400)
        
        # 1. 빈 헤더 사전 제거 (trailing delimiter 때문에 빈 컬럼 생성 가능)
        valid_header_indexes = [i for i, col in enumerate(df.columns) if str(col).strip()]
        df = df.iloc[:, valid_header_indexes]
        df = df.reset_index(drop=True)
        
        # 2. DB 스키마 조회 및 컬럼 매칭
        column_lookup = _get_column_lookup(selected_database, "Tx_summary")
        
        # 3. CSV 컬럼을 DB 스키마와 매칭, 없는 컬럼은 제외
        df_normalized = pd.DataFrame()
        excluded_cols = []
        
        for csv_col in df.columns:
            normalized_col = csv_col.strip().lower()
            if normalized_col in column_lookup:
                # DB의 실제 컬럼명 사용
                db_col = column_lookup[normalized_col]
                df_normalized[db_col] = df[csv_col]
            else:
                excluded_cols.append(csv_col)
                logger.warning(f"Column excluded (not in DB schema): {csv_col}")
        
        if excluded_cols:
            logger.warning(f"Excluded {len(excluded_cols)} columns not in DB schema")
        
        if df_normalized.empty:
            return error_response("No valid columns after schema matching", 400)
        df_normalized = df_normalized.reset_index(drop=True)
        
        # 4. 검증 팝업과 동일한 파생값 규칙 반영
        actual_probe_id_col = column_lookup.get("probeid", "ProbeID")
        actual_sw_col = column_lookup.get("software_version", "Software_version")
        actual_probe_name_col = column_lookup.get("probename", "ProbeName")
        actual_exam_name_col = column_lookup.get("examname", "ExamName")
        actual_mode_col = column_lookup.get("mode", "Mode")
        actual_tx_pulse_rle_col = column_lookup.get("txpulserle", "TxPulseRle")
        actual_combined_mode_col = (
            column_lookup.get("combined_mode")
            or column_lookup.get("combinedmode")
            or "Combined_mode"
        )
        actual_is_processed_col = column_lookup.get("isprocessed", "IsProcessed")

        # ProbeID / Software_version / ProbeName 강제 주입
        if selected_probe_id:
            df_normalized[actual_probe_id_col] = _normalize_probe_id(selected_probe_id)
        if selected_sw_version:
            df_normalized[actual_sw_col] = str(selected_sw_version).strip()
        if selected_probe_name:
            df_normalized[actual_probe_name_col] = selected_probe_name

        # ExamName은 txt 파일의 Exam/ExamName 컬럼 우선 사용
        exam_source_col = None
        for cand in ["ExamName", "Exam", "exam", "Exam_Name"]:
            if cand in df.columns:
                exam_source_col = cand
                break
        if exam_source_col is not None:
            exam_values = df[exam_source_col]
            if isinstance(exam_values, pd.DataFrame):
                exam_values = exam_values.iloc[:, 0]
            df_normalized[actual_exam_name_col] = exam_values.reset_index(drop=True).values

        # IsProcessed는 1 고정
        df_normalized[actual_is_processed_col] = 1

        # TxPulseRle은 DB NOT NULL 제약 대응: 결측은 0으로 강제
        if actual_tx_pulse_rle_col in df_normalized.columns:
            df_normalized[actual_tx_pulse_rle_col] = df_normalized[actual_tx_pulse_rle_col].apply(
                lambda v: 0
                if v is None or str(v).strip().lower() in ("", "nan", "none")
                else v
            )
        else:
            df_normalized[actual_tx_pulse_rle_col] = 0

        # Mode 길이에 따라 Combined_mode 계산(1글자=0, 2글자 이상=1)
        if actual_mode_col in df_normalized.columns:
            def _to_combined_mode(v):
                mode_len = len(str(v).strip()) if v is not None else 0
                return 0 if mode_len == 1 else (1 if mode_len >= 2 else None)
            df_normalized[actual_combined_mode_col] = df_normalized[actual_mode_col].apply(_to_combined_mode)
        
        # 5. numpy 타입 변환 후 DB에 삽입
        for col in df_normalized.columns:
            df_normalized[col] = df_normalized[col].apply(
                lambda x: x.item() if isinstance(x, (np.integer, np.floating)) else x
            )
        
        g.current_db.insert_data("Tx_summary", df_normalized)
        return jsonify({"status": "success", "message": f"Uploaded {len(df_normalized)} rows"}), 200
        
    except Exception as e:
        logger.error(f"TX Summary upload error: {str(e)}", exc_info=True)
        return error_response(f"TX Summary 업로드 실패: {str(e)}", 500)


@db_api_bp.route("/get_viewer_data", methods=["GET"])
@handle_exceptions
@require_auth
@with_db_connection()
def get_viewer_data():
    """Database Viewer 팝업 전용: 선택된 테이블의 최신 데이터(TOP 1000)를 반환합니다."""
    selected_database = request.args.get("database")
    selected_table = request.args.get("table")

    if not selected_database or not selected_table:
        return error_response("database, table 파라미터가 필요합니다", 400)

    # SERVER_TABLE_TABLE 환경변수 기준 동적 allowlist (get_list_table과 동기화)
    allowed_tables_raw = os.environ.get("SERVER_TABLE_TABLE", "")
    allowed_tables = [t.strip() for t in allowed_tables_raw.split(",") if t.strip()]
    if selected_table not in allowed_tables:
        return error_response("유효하지 않은 테이블 이름입니다", 400)

    # IDENTITY 컬럼 탐지 → 최신 1000건 내림차순 정렬
    order_clause = ""
    try:
        id_df = g.current_db.execute_query(
            "SELECT TOP 1 c.name FROM sys.columns c "
            "JOIN sys.tables t ON c.object_id = t.object_id "
            "WHERE t.name = ? AND c.is_identity = 1",
            params=(selected_table,)
        )
        if id_df is not None and not id_df.empty:
            identity_col = id_df.iloc[0, 0]
            order_clause = f" ORDER BY [{identity_col}] DESC"
    except Exception:
        pass

    df = g.current_db.execute_query(f"SELECT TOP 1000 * FROM [{selected_table}]{order_clause}")
    if df is None or df.empty:
        return jsonify({"status": "success", "data": [], "columns": []})

    df = df.replace({np.nan: None})
    return jsonify({
        "status": "success",
        "data": df.to_dict(orient="records"),
        "columns": list(df.columns),
    })
