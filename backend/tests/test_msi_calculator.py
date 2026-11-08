import pytest

from pkg_MsiInput.calculator import (
    MsiInputError,
    MsiRowError,
    ProbeGeometry,
    build_insert_row,
    compute_base_params,
    has_sub_verif_ref,
    parse_verif_filter,
    process_selection,
)
from pkg_MsiInput.store import DryRunStore

GEOM_1D = {"azpitchcm": 0.03, "elpitchcm": 0.4, "elpitch1cm": None, "mechfocuscm": 2.0, "mechfocus1cm": None}


def sub_row(**over):
    row = {
        "subverifid": 11, "verifid": 1, "submodename": "B", "pulsetype": "Pulse", "apodtype": "Hamming",
        "apertype": "rect", "fmmhz": 5.0, "focuspcm": 3.0, "focusqcm": None, "azimfnum": 2.0,
        "elevfnum": None, "elevindex": 0, "isphaseinverse": True, "splitfocusenable": None,
        "pulsedurus": 0.4, "txgain": 50.0, "soundspeed": None,
    }
    row.update(over)
    return row


class FakeStore:
    def __init__(self, subs, verifs, meas=None, geom=GEOM_1D):
        self.subs = {s["subverifid"]: s for s in subs}
        self.verifs = {v["verifid"]: v for v in verifs}
        self.meas = list(meas or [])
        self.geom = geom
        self.inserted = []
        self.updated = []
        self.created = set()
        self._next = 1000

    def probe_geometry(self, probe_id):
        return self.geom

    def sub_verif(self, sid):
        return self.subs.get(sid)

    def verification(self, vid):
        return self.verifs.get(vid)

    def meas_candidates(self, probe_id, pulse_type):
        # DbStore 와 같이 이번 실행에서 만든 행에 표시를 단다.
        return [{**r, "_created_in_run": True} if r["meassetid"] in self.created else dict(r)
                for r in self.meas if r["probeid"] == probe_id and r["pmpulsetype"].lower() == pulse_type.lower()]

    def insert_meas(self, row):
        self._next += 1
        self.inserted.append(row)
        self.created.add(self._next)
        self.meas.append({**{k.lower(): v for k, v in row.items()}, "meassetid": self._next})
        return self._next

    def update_excel_name(self, mid, value):
        self.updated.append((mid, value))
        for r in self.meas:
            if r["meassetid"] == mid:
                r["excelfilename"] = value


# ─── 파서 ──────────────────────────────────────────────────────────────────

def test_parse_verif_filter():
    assert parse_verif_filter("") == ("", [])
    clause, params = parse_verif_filter("1, 3,5~9")
    assert clause == "(verifId = ? OR verifId = ? OR verifId BETWEEN ? AND ?)"
    assert params == [1, 3, 5, 9]


@pytest.mark.parametrize("bad", ["1;DROP", "5~", "9~5", "a", "1 OR 1=1"])
def test_parse_verif_filter_rejects(bad):
    with pytest.raises(MsiInputError):
        parse_verif_filter(bad)


# ─── 기본 계산 ─────────────────────────────────────────────────────────────

def test_base_params_regular_1d():
    p = compute_base_params(sub_row(), ProbeGeometry.from_row(GEOM_1D), 7, "SSR", "MI")
    assert p["FocusPMm"] == pytest.approx(30)
    assert p["azAperSizeMm"] == pytest.approx(15)
    assert p["numTxCycles"] == pytest.approx(2)
    assert p["pulseBandwidthMHz"] == pytest.approx(2.5)
    assert p["isScw"] == 0
    assert p["isPhaseInverse"] == 1
    assert p["elAperSizeMm"] == pytest.approx(4)
    assert p["zEndCm"] == pytest.approx(4)  # max(3, mech 2) + 1
    assert p["splitFocusEnable"] == 0 and p["speedOfSoundMPerS"] == 1540
    assert p["ExcelFileName"] == "From subVerifId=11,SSR,MI"


def test_base_params_cw_and_cycle_cap():
    cw = compute_base_params(sub_row(pulsetype="Cw", pulsedurus=10.0), ProbeGeometry.from_row(GEOM_1D), 7, "IEC", "TIS")
    assert cw["isScw"] == 1 and cw["numTxCycles"] == 1
    assert cw["pulseWidthUsec"] == pytest.approx(0.2)
    long = compute_base_params(sub_row(pulsedurus=4.0), ProbeGeometry.from_row(GEOM_1D), 7, "IEC", "TIS")
    assert long["numTxCycles"] == 12
    assert long["pulseWidthUsec"] == pytest.approx(12 / 5)


def test_base_params_2d_and_zend_cap():
    geom = ProbeGeometry.from_row({**GEOM_1D, "elpitch1cm": 0.1, "mechfocus1cm": 20.0})
    p = compute_base_params(sub_row(focusqcm=2.0, elevfnum=4.0, elevindex=1, focuspcm=5.0), geom, 7, "SSR", "MI")
    assert p["elAperSizeMm"] == pytest.approx(5)
    assert p["zEndCm"] == 14


def test_base_params_row_errors():
    geom = ProbeGeometry.from_row(GEOM_1D)
    with pytest.raises(MsiRowError):
        compute_base_params(sub_row(azimfnum=0), geom, 7, "SSR", "MI")
    with pytest.raises(MsiRowError):
        compute_base_params(sub_row(fmmhz=None), geom, 7, "SSR", "MI")


def test_insert_row_excludes_fnum_and_empty():
    p = compute_base_params(sub_row(), ProbeGeometry.from_row(GEOM_1D), 7, "SSR", "MI")
    p["comments"] = "Sample"
    row = build_insert_row(p, 0)
    assert "azFnum" not in row and "elFnum" not in row and "FocusQMm" not in row
    assert row["ePulseString"] == " " and row["pulseRateHz"] == 0


def test_sub_verif_ref_boundary():
    assert has_sub_verif_ref("From subVerifId=12,SSR", 12)
    assert not has_sub_verif_ref("From subVerifId=123,SSR", 12)


# ─── 분기 ──────────────────────────────────────────────────────────────────

def rtp_ref(**over):
    row = {
        "meassetid": 50, "probeid": 7, "comments": "RTP", "pmpulsetype": "Pulse", "fmmhz": 5.0,
        "azapodtype": "Hamming", "elapertype": "rect", "elevindex": 0, "profvoltagevolt": 70.0,
        "ceiltxgain": 1.0, "maxvoltagevolt": 90.0, "nummeasvoltage": 3, "totalvoltagept": 5,
        "pulseratehz": 2000.0, "edgetreatment": "none", "cpatype": None, "apexcm": None,
    }
    row.update(over)
    return row


def power_ref(**over):
    row = {
        "meassetid": 60, "probeid": 7, "comments": "Power", "pmpulsetype": "Pulse", "fmmhz": 5.0,
        "azapodtype": "Rectangle", "elapertype": "rect", "elevindex": 0, "numtxcycles": 4,
        "pulsewidthusec": 0.8, "focuspmm": 40.0, "azapersizemm": 20.0, "edgetreatment": "e",
        "cpatype": None, "apexcm": None, "profvoltagevolt": 60.0, "ceiltxgain": 1, "maxvoltagevolt": 90,
        "nummeasvoltage": 3, "totalvoltagept": 5, "pulseratehz": None, "excelfilename": "ref",
    }
    row.update(over)
    return row


def test_ssr_insert_uses_rtp_reference():
    store = FakeStore([sub_row()], [{"verifid": 1, "probeid": 7, "purpose": "SSR", "reportterm": "MI"}], [rtp_ref()])
    plan = process_selection(store, 7, [11], "Auto Detect")
    assert [a.action for a in plan.actions] == ["insert"]
    row = store.inserted[0]
    assert row["comments"] == "Sample" and row["profVoltageVolt"] == 70 and row["pulseRateHz"] == 2000


def test_duplicate_appends_then_exists():
    store = FakeStore([sub_row(), sub_row(subverifid=12)],
                      [{"verifid": 1, "probeid": 7, "purpose": "SSR", "reportterm": "MI"}], [rtp_ref()])
    plan = process_selection(store, 7, [11, 12], "Auto Detect")
    assert [a.action for a in plan.actions] == ["insert", "append"]
    assert "subVerifId=12,SSR,MI" in store.updated[0][1]
    plan2 = process_selection(store, 7, [12], "Auto Detect")
    assert [a.action for a in plan2.actions] == ["exists"]


def test_fda_tis_runs_power_branch():
    verif = {"verifid": 1, "probeid": 7, "purpose": "FDA", "reportterm": "TIS"}
    store = FakeStore([sub_row(submodename="D")], [verif], [rtp_ref(), power_ref()])
    plan = process_selection(store, 7, [11], "Auto Detect")
    assert [(a.branch, a.action) for a in plan.actions] == [("main", "insert"), ("power", "insert")]
    main_row, power_row = store.inserted
    assert main_row["profVoltageVolt"] == 50  # FDA nonscan 은 subVerif 전압 유지
    assert power_row["comments"] == "Power" and power_row["azApodType"] == "Rectangle"
    assert power_row["pulseWidthUsec"] == pytest.approx(0.8) and power_row["numTxCycles"] == 4
    assert power_row["profVoltageVolt"] == 60  # sel 에 FDA 없음 → 기준 행 전압
    assert power_row["pulseRateHz"] == 2000  # 레거시: 기준 pulseRate 가 NULL 이면 일반 분기 값 승계


def test_unknown_purpose_and_foreign_probe_are_skipped():
    store = FakeStore([sub_row(), sub_row(subverifid=12, verifid=2)],
                      [{"verifid": 1, "probeid": 7, "purpose": "Other", "reportterm": "MI"},
                       {"verifid": 2, "probeid": 8, "purpose": "SSR", "reportterm": "MI"}])
    plan = process_selection(store, 7, [11, 12, 99], "Auto Detect")
    assert [a.action for a in plan.actions] == ["skip", "skip", "skip"]
    assert store.inserted == []


def test_power_without_reference_skips():
    store = FakeStore([sub_row()], [{"verifid": 1, "probeid": 7, "purpose": "IEC", "reportterm": "TIS"}], [rtp_ref()])
    plan = process_selection(store, 7, [11], "Power")
    assert [(a.branch, a.action) for a in plan.actions] == [("power", "skip")]


def test_dry_run_matches_real_and_does_not_write():
    subs = [sub_row(), sub_row(subverifid=12)]
    verifs = [{"verifid": 1, "probeid": 7, "purpose": "SSR", "reportterm": "MI"}]
    real = FakeStore(subs, verifs, [rtp_ref()])
    shadow = FakeStore(subs, verifs, [rtp_ref()])
    dry_plan = process_selection(DryRunStore(shadow), 7, [11, 12], "Auto Detect")
    assert shadow.inserted == [] and shadow.updated == []
    dry_again = process_selection(DryRunStore(shadow), 7, [11, 12], "Auto Detect")
    assert dry_plan.fingerprint() == dry_again.fingerprint()
    real_plan = process_selection(real, 7, [11, 12], "Auto Detect")
    assert [a.action for a in dry_plan.actions] == [a.action for a in real_plan.actions]
    assert [a.row for a in dry_plan.actions] == [a.row for a in real_plan.actions]
    assert dry_plan.fingerprint() == real_plan.fingerprint()


def test_dry_run_matches_real_when_min_id_exceeds_new_ids():
    # 신규 실제 ID(1001)가 minMeasSetId 보다 작아도 미리보기와 실행 계획이 같아야 한다.
    subs = [sub_row(), sub_row(subverifid=12)]
    verifs = [{"verifid": 1, "probeid": 7, "purpose": "SSR", "reportterm": "MI"}]
    shadow = FakeStore(subs, verifs, [rtp_ref()])
    real = FakeStore(subs, verifs, [rtp_ref()])
    dry_plan = process_selection(DryRunStore(shadow), 7, [11, 12], "Auto Detect", 1500)
    real_plan = process_selection(real, 7, [11, 12], "Auto Detect", 1500)
    assert [a.action for a in dry_plan.actions] == ["insert", "append"]
    assert [a.action for a in real_plan.actions] == ["insert", "append"]
    assert dry_plan.fingerprint() == real_plan.fingerprint()


def test_store_rejects_ids_beyond_sql_int():
    from pkg_MsiInput.store import _validate_ids
    with pytest.raises(MsiInputError):
        _validate_ids([2**31])
    assert _validate_ids([2**31 - 1]) == [2**31 - 1]


def test_selection_limits():
    store = FakeStore([], [])
    with pytest.raises(MsiInputError):
        process_selection(store, 7, [], "Auto Detect")
    with pytest.raises(MsiInputError):
        process_selection(store, 7, [1], "Drop")
    with pytest.raises(MsiInputError):
        process_selection(store, 7, list(range(1, 202)), "Auto Detect")
