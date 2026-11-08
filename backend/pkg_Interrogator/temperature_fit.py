"""레거시 Interrogator 의 MATLAB(COM) 계산을 SciPy/NumPy 로 변환한 모듈.

원본(11_소스_CompassTool_VB_2nd, 읽기 전용)과의 대응:
- ``fit_temp10``          ← frmTemp10.vb ``MatlabTemp10Fit`` / AWCSTemp.vb (fminsearch)
- ``fit_aperture_1d``     ← frmTemp.vb ``UseMatlabFminSearch1D`` (fmincon, 경계 0~100)
- ``fit_aperture_2d``     ← frmTemp.vb ``UseMatlabFminSearch2D`` (fmincon, 경계 0~100)
- ``solve_tr_spectrum``   ← frmTemp.vb ``UseMatlabTrSpec`` (``sys_spectrum \\ TR_meas``)

MATLAB 과 최적화 알고리즘 구현이 달라 계수가 비트 단위로 같지는 않다. 대신 같은
목적함수·초기값·경계를 쓰고, 합성 데이터로 계수 복원을 테스트로 보장한다.
레거시에서 선언만 하고 fmincon 에 넘기지 않은 ``optimset`` 옵션은 반영하지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Sequence

import numpy as np
from scipy.optimize import minimize

MAX_POINTS = 10_000
MAX_MATRIX_CELLS = 1_000_000

# fminsearch 기본값(TolX=TolFun=1e-4, MaxIter=MaxFunEvals=200*n)과 맞춘다.
_NM_TOL = 1e-4
# frmTemp10: x0 = [i0, 1700, 19, 19, 0.8, 0.1], i0 = 10, 20, ..., 70
TEMP10_TAU1_STARTS = tuple(range(10, 80, 10))
APERTURE_BOUNDS = (0.0, 100.0)
# x/0 을 막기 위한 하한. MATLAB fmincon(interior-point)도 경계 내부에서만 평가해 0 에 닿지 않는다.
_POSITIVE_EPS = 1e-9
_PENALTY = 1e300


class FitInputError(ValueError):
    """입력 배열이 fitting 에 부적합할 때 발생한다."""


@dataclass
class FitResult:
    coefficients: list[float]
    error: float
    success: bool
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "coefficients": [float(c) for c in self.coefficients],
            "error": float(self.error),
            "success": bool(self.success),
            "warnings": list(self.warnings),
        }


def _as_vector(values: Sequence[float], name: str, min_len: int = 1) -> np.ndarray:
    try:
        arr = np.asarray(values, dtype=float).reshape(-1)
    except (TypeError, ValueError) as exc:
        raise FitInputError(f"{name}: 숫자 배열이어야 합니다.") from exc
    if arr.size < min_len:
        raise FitInputError(f"{name}: 최소 {min_len}개 값이 필요합니다.")
    if arr.size > MAX_POINTS:
        raise FitInputError(f"{name}: 최대 {MAX_POINTS}개까지 허용됩니다.")
    if not np.all(np.isfinite(arr)):
        raise FitInputError(f"{name}: NaN/Inf 값이 포함돼 있습니다.")
    return arr


def _same_length(*pairs: tuple[str, np.ndarray]) -> None:
    if len({arr.size for _, arr in pairs}) != 1:
        names = ", ".join(name for name, _ in pairs)
        raise FitInputError(f"{names}: 길이가 같아야 합니다.")


def _safe_objective(fun: Callable[[np.ndarray], float]) -> Callable[[np.ndarray], float]:
    """오버플로·0 나눗셈 결과를 큰 값으로 바꿔 최적화기가 그 영역을 피하게 한다."""

    def wrapped(x: np.ndarray) -> float:
        with np.errstate(all="ignore"):
            value = fun(x)
        return float(value) if np.isfinite(value) else _PENALTY

    return wrapped


# ─── 10분 온도상승 6계수 모델 ───────────────────────────────────────────────


def temp10_model(x: Sequence[float], t: np.ndarray) -> np.ndarray:
    """MATLAB: (x4 - x3*e2) ./ (1 - x5*e2 - x6*e1) .* (1 - e1), e1=exp(-t/x1), e2=exp(-t/x2)."""
    tau1, tau2, c1, c2, c3, c4 = (float(v) for v in x)
    with np.errstate(all="ignore"):
        e1 = np.exp(-t / tau1)
        e2 = np.exp(-t / tau2)
        return (c2 - c1 * e2) / (1.0 - c3 * e2 - c4 * e1) * (1.0 - e1)


def fit_temp10(time_elapsed_s: Sequence[float], temp_rise_c: Sequence[float]) -> FitResult:
    """10분 온도상승 곡선 fitting. 계수 순서는 DB 컬럼 (tau1, tau2, c1, c2, c3, c4).

    레거시는 tau1 초기값 7종으로 fminsearch 를 반복해 평균제곱오차가 가장 작은 해를 쓴다.
    VB 의 배열 참조 대입(``bestX = x``)으로 최소오차 해가 이후 반복 값에 덮일 수 있던
    결함은 재현하지 않고, 최소오차 해를 복사해 반환한다.
    """
    t = _as_vector(time_elapsed_s, "timeElapsed", min_len=6)
    y = _as_vector(temp_rise_c, "tempRise", min_len=6)
    _same_length(("timeElapsed", t), ("tempRise", y))

    objective = _safe_objective(lambda x: np.mean((y - temp10_model(x, t)) ** 2))
    n = 6
    best: FitResult | None = None
    for tau1_start in TEMP10_TAU1_STARTS:
        x0 = np.array([tau1_start, 1700.0, 19.0, 19.0, 0.8, 0.1])
        res = minimize(
            objective,
            x0,
            method="Nelder-Mead",
            options={"xatol": _NM_TOL, "fatol": _NM_TOL, "maxiter": 200 * n, "maxfev": 200 * n},
        )
        err = float(res.fun)
        if best is None or err < best.error:
            best = FitResult([float(v) for v in res.x], err, bool(res.success))

    assert best is not None
    if not best.success:
        best.warnings.append("최대 반복에 도달했습니다(MATLAB fminsearch 기본 한도와 동일). 결과를 확인하세요.")
    if best.error >= _PENALTY:
        best.warnings.append("유효한 해를 찾지 못했습니다(발산).")
    return best


# ─── 개구(aperture) 보정 ────────────────────────────────────────────────────


def _aperture_term(gain: float, aper: np.ndarray, scale: float) -> np.ndarray:
    r = aper / scale
    return 1.0 + gain * r - (1.0 + r) * np.exp(-2.0 * r)


def aperture_model_1d(x: Sequence[float], az_aper_cm: np.ndarray) -> np.ndarray:
    a1, a2, a3 = (float(v) for v in x)
    with np.errstate(all="ignore"):
        return a1 * _aperture_term(a2, az_aper_cm, a3)


def aperture_model_2d(x: Sequence[float], az_aper_cm: np.ndarray, el_aper_cm: np.ndarray) -> np.ndarray:
    a1, a2, a3, a4, a5 = (float(v) for v in x)
    with np.errstate(all="ignore"):
        return a1 * _aperture_term(a2, az_aper_cm, a4) * _aperture_term(a3, el_aper_cm, a5)


def _bounded_fit(objective: Callable[[np.ndarray], float], x0: Sequence[float],
                 scale: float = 1.0) -> tuple[list[float], float, bool]:
    """``scale`` 로 나눈 목적함수를 최적화한다(해는 같고, 작은 값에서의 조기 종료를 막는다)."""
    lo, hi = APERTURE_BOUNDS
    bounds = [(max(lo, _POSITIVE_EPS), hi)] * len(x0)
    scale = scale if scale > 0 and np.isfinite(scale) else 1.0
    res = minimize(
        lambda x: objective(x) / scale,
        np.asarray(x0, dtype=float),
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": 5000, "ftol": 1e-15, "gtol": 1e-12},
    )
    coeffs = [float(v) for v in np.clip(res.x, lo, hi)]
    return coeffs, float(objective(np.asarray(coeffs))), bool(res.success)


def fit_aperture_1d(
    az_aper_cm: Sequence[float],
    temp_rise: Sequence[float],
    norm_coeff: Sequence[float],
    az_pitch_cm: float | None = None,
) -> FitResult:
    """1D 개구 보정 3계수. 목적함수는 정규화 계수로 가중한 평균제곱오차, 초기값 2종 중 최소오차."""
    a = _as_vector(az_aper_cm, "azAperCm", min_len=3)
    y = _as_vector(temp_rise, "tempRise", min_len=3)
    w = _as_vector(norm_coeff, "normCoeff", min_len=3)
    _same_length(("azAperCm", a), ("tempRise", y), ("normCoeff", w))
    if np.any(w == 0):
        raise FitInputError("normCoeff: 0 은 허용되지 않습니다(가중치 분모).")

    objective = _safe_objective(lambda x: np.mean((y - aperture_model_1d(x, a)) ** 2 / w**2))
    best: FitResult | None = None
    for x0 in ((0.01, 0.2, 0.2), (0.1, 0.1, 0.1)):
        coeffs, err, ok = _bounded_fit(objective, x0, scale=float(np.mean(y**2 / w**2)))
        if best is None or err < best.error:
            best = FitResult(coeffs, err, ok)

    assert best is not None
    if az_pitch_cm and best.coefficients[2] / az_pitch_cm < 10:
        best.warnings.append("x(3)/azPitch < 10 — fitting 계수를 확인하세요(레거시와 같은 경고).")
    return best


def fit_aperture_2d(
    az_aper_cm: Sequence[float],
    el_aper_cm: Sequence[float],
    temp_rise: Sequence[float],
    az_pitch_cm: float | None = None,
    el_pitch_cm: float | None = None,
) -> FitResult:
    """2D 개구 보정 5계수. 레거시와 같이 가중치 없는 평균제곱오차를 쓴다."""
    a = _as_vector(az_aper_cm, "azAperCm", min_len=5)
    e = _as_vector(el_aper_cm, "elAperCm", min_len=5)
    y = _as_vector(temp_rise, "tempRise", min_len=5)
    _same_length(("azAperCm", a), ("elAperCm", e), ("tempRise", y))

    objective = _safe_objective(lambda x: np.mean((y - aperture_model_2d(x, a, e)) ** 2))
    coeffs, err, ok = _bounded_fit(objective, (0.005, 0.2, 0.2, 0.2, 0.2), scale=float(np.mean(y**2)))
    result = FitResult(coeffs, err, ok)
    az_low = bool(az_pitch_cm) and coeffs[3] / float(az_pitch_cm) < 10
    el_low = bool(el_pitch_cm) and coeffs[4] / float(el_pitch_cm) < 10
    if az_low or el_low:
        result.warnings.append("x(4)/azPitch 또는 x(5)/elPitch < 10 — fitting 계수를 확인하세요.")
    return result


# ─── TR 스펙트럼 ────────────────────────────────────────────────────────────


def solve_tr_spectrum(sys_spectrum: Sequence[Sequence[float]], tr_meas: Sequence[float]) -> dict:
    """MATLAB ``sys_spectrum \\ TR_meas`` (행: 주파수, 열: 스펙트럼 bin)를 최소제곱으로 푼다.

    정방·정칙이면 MATLAB 과 같은 해다. rank 부족이면 MATLAB 은 QR 기본해, NumPy 는
    최소노름해를 돌려주므로 값이 다를 수 있어 경고로 알린다.
    """
    try:
        matrix = np.asarray(sys_spectrum, dtype=float)
    except (TypeError, ValueError) as exc:
        raise FitInputError("sysSpectrum: 숫자 2차원 배열이어야 합니다.") from exc
    if matrix.ndim != 2 or matrix.size == 0:
        raise FitInputError("sysSpectrum: 2차원 배열이어야 합니다.")
    if matrix.size > MAX_MATRIX_CELLS:
        raise FitInputError(f"sysSpectrum: 최대 {MAX_MATRIX_CELLS}개 셀까지 허용됩니다.")
    if not np.all(np.isfinite(matrix)):
        raise FitInputError("sysSpectrum: NaN/Inf 값이 포함돼 있습니다.")
    rhs = _as_vector(tr_meas, "trMeas")
    if rhs.size != matrix.shape[0]:
        raise FitInputError("trMeas: 길이가 sysSpectrum 행 수와 같아야 합니다.")

    solution, _residuals, rank, _sv = np.linalg.lstsq(matrix, rhs, rcond=None)
    warnings: list[str] = []
    if rank < min(matrix.shape):
        warnings.append("계수 행렬이 rank 부족입니다. MATLAB(QR 기본해)과 해가 다를 수 있습니다.")
    return {
        "probeSpectrum": [float(v) for v in solution],
        "rank": int(rank),
        "residualNorm": float(np.linalg.norm(matrix @ solution - rhs)),
        "warnings": warnings,
    }
