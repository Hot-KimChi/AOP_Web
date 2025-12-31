import joblib
import os
import logging
import numpy as np
import pandas as pd
import warnings
import xgboost as xgb
from typing import Dict, Any


warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r"pandas only supports SQLAlchemy connectable.*",
)

# ===== 정책 상수 =====
DEFAULT_POLICY_PRF: float = float(
    os.getenv("POLICY_PRF", 30000.0)
)  # <10°C 또는 invalid일 때 반환할 PRF
MIN_VALID_TEMPRISE: float = float(
    os.getenv("MIN_VALID_TR", 10.0)
)  # < 이 값이면 POLICY_PRF 반환
MAX_ALLOWED_PRR: float = float(
    os.getenv("MAX_ALLOWED_PRR", 30000.0)
)  # 탐색 상한(일관성용)
MIN_ALLOWED_PRR: float = float(
    os.getenv("MIN_ALLOWED_PRR", 50.0)
)  # 탐색 하한(일관성용)

# 1) 전압, PRF, 사이클 중 하나라도 0 이하 → 발열 없음 처리
# → {"pred_temprise": 0.0, "prf": DEFAULT_POLICY_PRF} 반환
# 2) 예측 TempRise < Min Valid TempRise 의 경우,
# 예측 TempRise 는 출력하되, PRF는 DEFAULT_POLICY_PRF 출력


# ==== 학습 모델 아티팩트 (Booster, feature_columns 등) 불러오기 ====
def load_artifacts():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    art_path = os.path.join(
        current_dir, "Temperature_artifacts", "TempPRR_Predict.joblib"
    )

    if not os.path.exists(art_path):
        raise FileNotFoundError(
            "모델 아티팩트가 없습니다. 먼저 train_pipeline()을 실행하세요."
        )
    art = joblib.load(art_path)
    return art["booster"], art["feature_columns"]


# ===== 유틸리티 ======


#  예측 출력 형식이 dict/float 섞여 있어도 일관된 float으로 변환
def _extract_temprise(y) -> float:
    try:
        # 케이스1 dict인 경우 {"pred_temprise": ...}
        if isinstance(y, dict):
            return float(y.get("pred_temprise", 0.0))
        # 케이스2 스칼라 -> 그대로 변환
        return float(y)
    except Exception:
        return 0.0


## ===== 예측을 위한 XGBoost 모델 호출 ====
# 모델 normalization(TempRise/V2) -> 예측 후 복원 "denormalization" (TempRise) =====
def predict_temprise_with_xgb(
    booster, feature_columns, X_one_row, user_input: dict
) -> float:
    # g(·) 예측 후 V² 곱해 복원
    eps = 1e-9
    V = float(user_input.get("pulseVoltage", 0) or 0)
    # 0V 가드: 물리 보장
    if V <= 0 or float(user_input.get("numTxCycles", 0) or 0) <= 0:
        return 0.0

    # X_one_row 는 features.extract_features_and_target* 이후의 인코딩 스키마를 따르는 Series/DataFrame이어야 함
    if isinstance(X_one_row, pd.Series):
        X_df = X_one_row.to_frame().T
    else:
        X_df = X_one_row.copy()

    # 누락 컬럼 채우기(훈련 시 컬럼과 동일 순서/집합 보장)
    for c in feature_columns:
        if c not in X_df.columns:
            X_df[c] = 0
    X_df = X_df[feature_columns]

    dmatrix = xgb.DMatrix(X_df, feature_names=feature_columns)
    g_hat = float(booster.predict(dmatrix)[0])
    return (V**2) * g_hat


# ===== TempRise 예측 =====


def _predict_temprise_one(
    user_input: Dict[str, Any], booster, feature_columns
) -> float:
    """
    #    단일 user_input에서 TempRise 예측 (XGBoost g(·) + V^2 복원).
    #    물리 가드(Voltage/PRF/Cycle 중 하나라도 0 이하 → 0°C) + 10°C 미만 차단 포함.
    #    반환: {"pred_temprise": float, "prf": float}
    #"""
    # user_input = _attach_probe_geometry(user_input)

    V = float(user_input.get("pulseVoltage", 0) or 0)
    prf = float(user_input.get("pulseRepetRate", 0) or 0)
    cycles = float(user_input.get("numTxCycles", 0) or 0)

    # 물리 가드: 전압/PRF/사이클 중 하나라도 0 이하 → 발열 없음 처리
    if V <= 0 or prf <= 0 or cycles <= 0:
        return {"pred_temprise": 0.0, "prf": DEFAULT_POLICY_PRF}
    # 입력 → DataFrame 변환 후 물리 feature 생성 및 원-핫 인코딩 적용
    row = pd.DataFrame([user_input])
    for c in ["isTxAperModulationEn", "txpgWaveformStyle", "elevAperIndex", "VTxindex"]:
        row[c] = pd.to_numeric(row.get(c, 0), errors="coerce").fillna(0).astype(int)

    row["VTxindex"] = (
        pd.to_numeric(row.get("VTxindex", 1), errors="coerce").fillna(1).astype(int)
    )
    row = _add_physics_features(row)
    row = apply_one_hot_encoding(
        row, ["isTxAperModulationEn", "txpgWaveformStyle", "elevAperIndex"]
    )

    # XGBoost로 g_hat 예측 후 V^2 곱해 TempRise 복원
    pred = float(predict_temprise_with_xgb(booster, feature_columns, row, user_input))

    # 정책: 10°C 미만 예측값은 무효 처리
    if pred < MIN_VALID_TEMPRISE:
        result = {"pred_temprise": pred, "prf": DEFAULT_POLICY_PRF}
        return result

    # 정상 예측 결과
    result = {"pred_temprise": pred, "prf": prf}
    return result


# ===== 목표 TemperatureRise(target_tr)에 맞는 PRF를 역 탐색 ====

# 로그스케일 샘플링
## PRF 후보군(log scale) 생성 + 탐색 알고리즘


def find_prr_for_temprise(
    user_input: Dict[str, Any],
    target_tr: float,
    prr_min: float = 100.0,
    prr_max: float = 30000.0,
    tol: float = 0.05,
    max_iter: int = 40,
) -> Dict[str, Any]:
    """
    목표 TemperatureRise(target_tr)를 만족하는 PRF 탐색.
    PRF↑ ⇒ TempRise↑ 단조 가정. 비교는 항상 float로 수행.
    정책: pred < MIN_VALID_TEMPRISE → pred_temprise=0.0, best_prr=DEFAULT_POLICY_PRF
    """
    logging.info(f"[find_prr] input bracket=({prr_min}, {prr_max})")

    # 런타임에서 허용 범위 보정
    prr_min = max(float(prr_min), MIN_ALLOWED_PRR)
    prr_max = min(float(prr_max), MAX_ALLOWED_PRR)
    if prr_min >= prr_max:
        return {
            "best_prr": None,
            "pred_temprise": float("nan"),
            "iters": 0,
            "note": "invalid bracket after clipping",
        }

    booster, feature_columns = load_artifacts()
    # 물리적 가드: 전압/사이클이 0 이하라면 발열이 없으므로 탐색 무의미
    V = float(user_input.get("pulseVoltage", 0) or 0)
    cycles = float(user_input.get("numTxCycles", 0) or 0)
    if V <= 0 or cycles <= 0:
        return {
            "best_prr": DEFAULT_POLICY_PRF,
            "pred_temprise": 0.0,
            "iters": 0,
            "note": "0 V or 0 cycles",
        }

    # 초기 로그 스케일 샘플링(전역 탐색용): 구간을 기하간격으로 나눠 거친 스캔 --> 13개 후보
    grid = np.geomspace(prr_min, prr_max, num=13)

    # 초기 샘플 평가: 각 PRF 후보에 대해 _predict_temprise_one 호출해서 TempRise 예측
    preds = []
    for g in grid:
        u = dict(user_input)
        u["pulseRepetRate"] = float(g)
        y_dict = _predict_temprise_one(u, booster, feature_columns)
        y_val = _extract_temprise(y_dict)
        preds.append((float(g), float(y_val)))

    ys = [p[1] for p in preds]

    # 이분 탐색
    def _scale_prr(x: float) -> float:
        # 필요 시 배율 넣을 자리(ALPHA_PRR), 지금은 1.0
        return min(float(x), MAX_ALLOWED_PRR)

    # (정책 1) 전 구간이 차단(< MIN_VALID_TEMPRISE → pred=0.0)
    if max(ys) <= 0.0:
        return {
            "best_prr": DEFAULT_POLICY_PRF,
            "pred_temprise": max(ys),
            "iters": 0,
            "note": "policy: all < MIN_VALID_TEMPRISE → fallback PRF",
        }

    # 타깃이 범위 밖이면 가장 가까운 점
    if not (min(ys) <= target_tr <= max(ys)):
        best = min(preds, key=lambda t: abs(t[1] - target_tr))
        if best[1] <= 0.0:
            return {
                "best_prr": DEFAULT_POLICY_PRF,
                "pred_temprise": 0.0,
                "iters": 0,
                "note": "policy: no crossing & pred=0 → fallback PRF",
            }
        return {
            "best_prr": _scale_prr(best[0]),
            "pred_temprise": best[1],
            "iters": 0,
            "note": "no crossing",
        }

    lo, hi = prr_min, prr_max
    y_lo = _extract_temprise(
        _predict_temprise_one(
            {**user_input, "pulseRepetRate": lo}, booster, feature_columns
        )
    )
    y_hi = _extract_temprise(
        _predict_temprise_one(
            {**user_input, "pulseRepetRate": hi}, booster, feature_columns
        )
    )
    if y_lo > y_hi:  # 단조 ↑ 가정 보정을 위한 스왑
        lo, hi = hi, lo
        y_lo, y_hi = y_hi, y_lo

    iters = 0
    best = (None, float("inf"))  # (prr, pred)

    while iters < max_iter:
        mid = 0.5 * (lo + hi)
        y_mid = _extract_temprise(
            _predict_temprise_one(
                {**user_input, "pulseRepetRate": mid}, booster, feature_columns
            )
        )
        # 최적 후보 갱신
        if abs(y_mid - target_tr) < abs(best[1] - target_tr):
            best = (mid, y_mid)

        # 수렴 체크
        if abs(y_mid - target_tr) <= tol * max(1.0, target_tr):
            if y_mid <= 0.0:
                return {
                    "best_prr": DEFAULT_POLICY_PRF,
                    "pred_temprise": 0.0,
                    "iters": iters + 1,
                    "note": "policy: converged to 0 → fallback PRF",
                }
            return {
                "best_prr": _scale_prr(mid),
                "pred_temprise": y_mid,
                "iters": iters + 1,
                "note": "converged",
            }

        # 브래킷 갱신
        if y_mid < target_tr:
            lo, y_lo = mid, y_mid
        else:
            hi, y_hi = mid, y_mid
        iters += 1

    #     # 최대 반복 도달 or 수렴 종료 시점
    # → 항상 target에 가장 가까운 후보 반환
    if best[0] is None:
        return {
            "best_prr": None,
            "pred_temprise": float("nan"),
            "iters": iters,
            "note": "no valid candidate",
        }

    # 최종 결과를 target에 가장 가까운 후보로 선택
    final_prr, final_pred = best

    return {
        "best_prr": _scale_prr(final_prr),
        "pred_temprise": final_pred,
        "iters": iters,
        "note": "max_iter reached",
    }


## ======== feature / target 분리 (TempRise 예측기) + one-hot encoding
import pandas as pd
import numpy as np


def apply_one_hot_encoding(
    X: pd.DataFrame, categorical_cols: list[str]
) -> pd.DataFrame:
    return pd.get_dummies(X, columns=categorical_cols)


## ===== 물리적 관계 feature 정의 =====
def _add_physics_features(df: pd.DataFrame) -> pd.DataFrame:
    import numpy as np

    out = df.copy()

    eps = 0.001
    V = (
        pd.to_numeric(out.get("pulseVoltage", 0), errors="coerce")
        .fillna(0)
        .clip(lower=0)
    )
    PRF = (
        pd.to_numeric(out.get("pulseRepetRate", 0), errors="coerce")
        .fillna(0)
        .clip(lower=0)
    )
    Freq = (
        pd.to_numeric(out.get("txFrequencyHz", 0), errors="coerce")
        .fillna(0)
        .clip(lower=eps)
    )
    Cycles = (
        pd.to_numeric(out.get("numTxCycles", 0), errors="coerce")
        .fillna(0)
        .clip(lower=0)
    )
    #    SR = pd.to_numeric(out.get("scanRange", pd.Series([0]*len(out))), errors="coerce").fillna(0)
    #    SR = pd.to_numeric(out.get("scanRange", 0), errors="coerce").fillna(0).clip(lower=1.0)
    SR = pd.to_numeric(
        out.get("scanRange", pd.Series([0] * len(out)) if len(out) > 1 else 0),
        errors="coerce",
    ).fillna(0)

    # 파생 feature
    # a. 물리적 관계
    out["volt2"] = V**2
    out["duty_approx"] = (Cycles * PRF) / Freq  # 무차원 근사 듀티
    out["power_like"] = out["volt2"] * out["duty_approx"]  # 전체 에너지 양

    # b.  scanRange feature: ScanRange 넓을수록 에너지가 넓게 분산 → 가열효과 ↓
    # scanRange 반비례
    #    out["scan_inv"]     = 1.0 / np.maximum(SR, eps)              # SR↑ ⇒ scan_inv↓
    out["scan_inv"] = np.where(SR == 0, 1.0, 1.0 / np.maximum(SR, eps))
    # scanrange 한 지점에서 받는 에너지 밀도
    out["power_like_scan"] = out["power_like"] * out["scan_inv"]  # 전력 × scan 보정

    # c. 스케일 안정화를 위한 로그형
    # 덧셈 구조로 바꿔주어 모델 학습을 더 용이하게 함
    # (volt2, duty, power_like, scan_inv, power_like_scan)
    out["log_volt2"] = np.log(out["volt2"] + eps)
    out["log_duty"] = np.log(out["duty_approx"] + eps)
    out["log_power_like"] = np.log(out["power_like"] + eps)
    out["log_scan_inv"] = np.log(out["scan_inv"] + eps)
    out["log_power_like_scan"] = np.log(out["power_like_scan"] + eps)

    return out


# ===== Voltage 계산 index 2 (Voltage, ScanRange 동일) =====

# def compute_voltage(user_input: dict, index: int) -> float:
#    Vmax = user_input.get("maxTxVoltageVolt")
#    Vceil = user_input.get("ceilTxVoltageVolt")
#    N = int(user_input.get("totalVoltagePt"))
#    base = float(min(Vmax, Vceil))
#    if N <= 1:
#        return round(base, 2)
#    i = 2
#    exponent = (N - 1 - i) / (N - 1)
#    v = base ** exponent
#    return round(v, 2)
