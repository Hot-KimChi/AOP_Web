import numpy as np
import pytest

from pkg_Interrogator.temperature_fit import (
    FitInputError,
    aperture_model_1d,
    aperture_model_2d,
    fit_aperture_1d,
    fit_aperture_2d,
    fit_temp10,
    solve_tr_spectrum,
    temp10_model,
)


def test_temp10_fit_tracks_synthetic_curve():
    t = np.linspace(0, 600, 61)
    true = [40.0, 1800.0, 18.0, 20.0, 0.7, 0.05]
    y = temp10_model(true, t)
    result = fit_temp10(t, y)
    assert len(result.coefficients) == 6
    fitted = temp10_model(result.coefficients, t)
    assert np.sqrt(np.mean((fitted - y) ** 2)) < 0.05 * np.max(np.abs(y))
    assert result.error == pytest.approx(np.mean((fitted - y) ** 2), rel=1e-6)


def test_temp10_rejects_short_or_mismatched_input():
    with pytest.raises(FitInputError):
        fit_temp10([0], [0])
    with pytest.raises(FitInputError):
        fit_temp10(list(range(10)), list(range(9)))
    with pytest.raises(FitInputError):
        fit_temp10([0, 1, 2, 3, 4, float("nan")], [0] * 6)
    with pytest.raises(FitInputError):
        fit_temp10(None, None)


def test_aperture_1d_recovers_coefficients():
    a = np.linspace(0.2, 4.0, 20)
    true = (0.05, 0.3, 1.5)
    y = aperture_model_1d(true, a)
    w = np.ones_like(a)
    result = fit_aperture_1d(a, y, w, az_pitch_cm=0.03)
    assert np.allclose(aperture_model_1d(result.coefficients, a), y, atol=1e-4)
    assert all(1e-9 <= c <= 100 for c in result.coefficients)


def test_aperture_1d_rejects_zero_weight():
    with pytest.raises(FitInputError):
        fit_aperture_1d([1, 2, 3], [1, 2, 3], [1, 0, 1])


def test_few_points_fit_with_warning_like_legacy():
    # 레거시는 2점 이상이면 fitting 했다 → 차단하지 않고 경고만
    r1 = fit_aperture_1d([0.5, 1.5], [0.02, 0.04], [1, 1])
    assert len(r1.coefficients) == 3 and any("계수 3개" in w for w in r1.warnings)
    r2 = fit_aperture_2d([0.5, 1.5], [0.4, 0.9], [0.01, 0.02])
    assert len(r2.coefficients) == 5 and any("계수 5개" in w for w in r2.warnings)
    r3 = fit_temp10([60, 300, 0], [1.0, 2.0, 0.0])
    assert len(r3.coefficients) == 6 and any("계수 6개" in w for w in r3.warnings)
    with pytest.raises(FitInputError):
        fit_aperture_1d([1.0], [1.0], [1.0])


def test_aperture_2d_fits_and_bounds():
    rng = np.random.default_rng(0)
    a = rng.uniform(0.2, 3.0, 30)
    e = rng.uniform(0.2, 1.5, 30)
    true = (0.01, 0.3, 0.4, 1.2, 0.8)
    y = aperture_model_2d(true, a, e)
    result = fit_aperture_2d(a, e, y)
    assert np.sqrt(result.error) < 0.01 * np.max(np.abs(y))
    assert all(1e-9 <= c <= 100 for c in result.coefficients)


def test_tr_spectrum_matches_direct_solve():
    m = np.array([[2.0, 1.0], [1.0, 3.0]])
    x = np.array([0.5, -1.0])
    out = solve_tr_spectrum(m.tolist(), (m @ x).tolist())
    assert np.allclose(out["probeSpectrum"], x)
    assert out["rank"] == 2
    assert out["warnings"] == []


def test_tr_spectrum_rank_deficient_warns_and_validates():
    out = solve_tr_spectrum([[1, 1], [2, 2]], [1, 2])
    assert out["warnings"]
    with pytest.raises(FitInputError):
        solve_tr_spectrum([[1, 2]], [1, 2])
    with pytest.raises(FitInputError):
        solve_tr_spectrum([1, 2], [1])
