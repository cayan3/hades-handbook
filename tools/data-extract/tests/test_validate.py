"""Tests for the checks that decide whether an extraction may ship.

Until now this file did not exist, and the validator had no coverage of any
kind -- including the three checks that were added specifically because
something had already gone wrong in silence. A check nobody exercises is a
check that has never been observed to fire, which is most of the way back to
not having it.

Each test states the failure the rule exists to catch, builds the smallest
catalog that exhibits it, and asserts the run stops. The catalogs are tiny and
invented on purpose: a rule tested against the real extraction only proves the
real extraction currently passes, which is the thing that was already true when
these defects shipped.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOL / "src"))

import requirements  # noqa: E402
import validate  # noqa: E402


def boon(**fields):
    record = {
        "id": "X", "god": None, "godKind": None, "duoGods": None,
        "name": "X", "descriptionRef": "X", "icon": None,
        "boonCategory": "NonStandard", "slot": None, "tier": None,
        "rarity": [], "exclusiveGroup": None, "blockedBy": None,
        "elementAffinity": None, "prereq": None, "prereqSource": None,
        "activation": None, "source": "Scripts/TraitData.lua:1",
    }
    record.update(fields)
    return record


def check(boons, gods=None, keepsakes=None, **kw):
    """Validate one invented catalog, returning (report, fatal messages)."""
    return validate.validate_game(
        "hades1", boons, gods if gods is not None else {}, keepsakes or {}, **kw
    )


# ---------------------------------------------------------------------------
# Emission integrity: a field holding something that is not data
# ---------------------------------------------------------------------------

def test_an_unresolved_placeholder_anywhere_in_a_record_stops_the_run():
    """The dumper writes a placeholder wherever a table reached for a global
    that was not loaded yet. Reaching an emitted field, it is a value -- and
    the field it reached was never one anybody thought to guard, which is why
    the check walks the whole record rather than a list of fields."""
    _, fatal = check({"A": boon(id="A", icon="<unresolved:G.Something>")})
    assert any("unresolved" in f for f in fatal)


def test_a_known_carrier_is_exempted_so_a_new_leak_is_not_lost_in_the_noise():
    known = sorted(validate.UNRESOLVED_SENTINEL_KNOWN)[0]
    report, fatal = check({known: boon(id=known, icon="<unresolved:G.Something>")})
    assert fatal == []
    assert report["unresolvedSentinelKnown"]


def test_a_known_carrier_that_stopped_carrying_is_reported():
    """An exemption that outlives its defect should be deleted, not kept."""
    known = sorted(validate.UNRESOLVED_SENTINEL_KNOWN)[0]
    report, _ = check({known: boon(id=known)})
    assert known in report["unresolvedSentinelKnownNoLongerPresent"]


def test_an_exemption_still_counts_as_carrying_when_it_refuses_rather_than_leaks():
    """Normalization now refuses the broken clause instead of passing it
    through, so the evidence arrives as a build failure. If that did not count
    as carrying, cleaning up the output would read as fixing the defect."""
    known = sorted(validate.UNRESOLVED_SENTINEL_KNOWN)[0]
    report, fatal = check(
        {known: boon(id=known)},
        clause_report={"buildFailures": [
            {"id": known, "reason": requirements.UNRESOLVED_REASON, "clause": {}},
        ]},
    )
    assert report["unresolvedSentinelKnownNoLongerPresent"] == []
    assert fatal == []


def test_a_god_nobody_has_heard_of_stops_the_run():
    """Two gods are recovered from hand-written source comments, and the
    patterns match any capitalised word. An unattributed boon renders as
    unattributed; an invented god renders as somebody's, and only the second
    is silently wrong."""
    _, fatal = check({"A": boon(id="A", god="Deprecated")}, gods={"Zeus": {}})
    assert any("Deprecated" in f for f in fatal)


def test_a_cameo_god_with_no_loot_table_of_its_own_is_still_a_god():
    _, fatal = check({"A": boon(id="A", god="Athena")}, gods={"Zeus": {}})
    assert fatal == []


# ---------------------------------------------------------------------------
# The classifier's own exit path
# ---------------------------------------------------------------------------

def test_a_clause_that_did_not_classify_stops_the_run():
    """Requirements are modelled without negation, which is only safe because
    anything that does not fit is supposed to stop the build."""
    report, fatal = check(
        {"A": boon(id="A", prereq={"type": requirements.UNCLASSIFIED_MARKER})},
        clause_report={"buildFailures": [
            {"id": "A", "reason": "an unrecognised path", "clause": {"Path": ["Nowhere"]}},
        ]},
    )
    assert report["buildFailureCount"] == 1
    assert any("unrecognised path" in f for f in fatal)


# ---------------------------------------------------------------------------
# Requirements that cannot be satisfied by anything
# ---------------------------------------------------------------------------

def test_asking_for_more_branches_than_exist_stops_the_run():
    """Evaluation is obliged to answer for whatever it is handed, so it reports
    this as impossible with no reason to show the player -- a boon that renders
    unobtainable for everyone, forever. This is the only place that can refuse
    it."""
    _, fatal = check({"A": boon(id="A", prereq={
        "kind": "anyOf", "min": 3, "of": [{"kind": "hasTrait", "trait": "B"}],
    })})
    assert any("wants 3 of 1" in f for f in fatal)


def test_an_arity_that_matches_its_branches_is_fine():
    _, fatal = check({"A": boon(id="A", prereq={
        "kind": "anyOf", "min": 2,
        "of": [{"kind": "hasTrait", "trait": "A"}, {"kind": "hasTrait", "trait": "B"}],
    })})
    assert fatal == []


def test_the_same_arity_rule_covers_the_activation_gate():
    _, fatal = check({"A": boon(id="A", activation={
        "kind": "anyOf", "min": 9, "of": [{"kind": "hasTrait", "trait": "A"}],
    })})
    assert any("activation" in f for f in fatal)


def test_a_requirement_naming_an_id_the_catalog_does_not_have_is_reported():
    report, _ = check({"A": boon(id="A", prereq={"kind": "hasTrait", "trait": "Ghost"})})
    assert report["danglingPrereqReferences"] == {"A": ["Ghost"]}


def test_a_gate_naming_a_keepsake_the_catalog_lacks_is_reported():
    """A keepsake that does not exist is unsatisfiable forever, exactly as a
    dangling trait is. Checking only traits would leave the other free to rot."""
    report, _ = check({"A": boon(id="A", prereq={"kind": "hasKeepsake", "keepsake": "Ghost"})})
    assert report["danglingPrereqReferences"] == {"A": ["Ghost"]}


def test_a_mirror_talent_is_not_expected_to_be_a_catalog_record():
    """Talents are run state chosen outside the run, so there is nothing here
    for them to dangle against."""
    report, _ = check({"A": boon(id="A", prereq={"kind": "hasTalent", "talent": "AmmoMetaUpgrade"})})
    assert report["danglingPrereqReferenceCount"] == 0


def test_a_keepsake_counts_as_present_for_that_check():
    report, _ = check(
        {"A": boon(id="A", prereq={"kind": "hasTrait", "trait": "K"})},
        keepsakes={"K": {}},
    )
    assert report["danglingPrereqReferenceCount"] == 0


# ---------------------------------------------------------------------------
# Negation edges
# ---------------------------------------------------------------------------

def test_a_mutual_exclusion_nobody_names_back_stops_the_run():
    """The classifier only records one when both records name each other, so
    this can no longer find anything in practice -- which is the point. It is
    now a check on the classifier, and nobody checking is exactly how the field
    came to be wrong in two thirds of Hades I's records."""
    _, fatal = check({
        "A": boon(id="A", exclusiveGroup=["A", "B"]),
        "B": boon(id="B", exclusiveGroup=None),
    })
    assert any("does not name back" in f for f in fatal)


def test_a_group_of_one_excludes_nothing_and_stops_the_run():
    _, fatal = check({"A": boon(id="A", exclusiveGroup=["A"])})
    assert any("one-member" in f for f in fatal)


def test_a_block_whose_blocker_is_a_keepsake_stops_the_run():
    """A keepsake swaps out between regions, so the block cannot last the run.
    Reporting it tells a player their build is impossible because of something
    they can simply unequip, which is the most damaging verdict there is."""
    _, fatal = check(
        {"A": boon(id="A", blockedBy=["K"])},
        keepsakes={"K": {}},
    )
    assert any("can shed" in f for f in fatal)


def test_a_block_whose_blocker_is_keepsake_granted_stops_the_run():
    known = sorted(validate.REMOVABLE_BLOCKER_KNOWN)[0]
    _, fatal = check({"A": boon(id="A", blockedBy=[known])})
    assert any("can shed" in f for f in fatal)


def test_a_block_naming_a_weapon_form_stops_the_run():
    """A run never holds an aspect -- it equips one -- so a block naming an
    aspect looks for it among the held traits and never finds it. The
    constraint is real and permanently inert, which reads as the boon being
    reachable. Two thirds of every block edge in the catalog were this."""
    _, fatal = check({"A": boon(id="A", blockedBy=["Asp"])}, aspect_ids={"Asp"})
    assert any("names the aspect Asp in blockedBy" in f for f in fatal)


def test_a_mutual_exclusion_naming_a_weapon_form_stops_the_run_too():
    _, fatal = check(
        {"A": boon(id="A", exclusiveGroup=["A", "Asp"]),
         "Asp": boon(id="Asp", exclusiveGroup=["A", "Asp"])},
        aspect_ids={"Asp"},
    )
    assert any("names the aspect Asp in exclusiveGroup" in f for f in fatal)


def test_a_conflict_filed_as_a_weapon_form_is_fine():
    _, fatal = check({"A": boon(id="A", aspectConflicts=["Asp"])},
                     keepsakes={"Asp": {}}, aspect_ids={"Asp"})
    assert fatal == []


def test_an_aspect_the_catalog_does_not_have_is_reported():
    """A conflict naming a form that does not exist never fires, exactly as a
    dangling prerequisite never resolves."""
    report, _ = check({"A": boon(id="A", aspectConflicts=["Ghost"])})
    assert report["danglingPrereqReferences"] == {"A": ["Ghost"]}


# ---------------------------------------------------------------------------
# Ladder depth
# ---------------------------------------------------------------------------

def test_a_depth_that_disagrees_with_its_prerequisites_stops_the_run():
    """Depth is stored rather than recomputed by the app, so a wrong one is
    wrong everywhere and forever."""
    _, fatal = check({
        "Root": boon(id="Root", god="G", tier=1),
        "Second": boon(id="Second", god="G", tier=1,
                       prereq={"kind": "hasTrait", "trait": "Root"}),
    })
    assert any("Second is tier 1" in f for f in fatal)


def test_a_depth_that_agrees_is_fine():
    _, fatal = check({
        "Root": boon(id="Root", god="G", tier=1),
        "Second": boon(id="Second", god="G", tier=2,
                       prereq={"kind": "hasTrait", "trait": "Root"}),
    }, gods={"G": {}})
    assert fatal == []


def test_another_gods_prerequisite_does_not_raise_the_rung():
    _, fatal = check({
        "Other": boon(id="Other", god="H", tier=1),
        "Mine": boon(id="Mine", god="G", tier=1,
                     prereq={"kind": "hasTrait", "trait": "Other"}),
    }, gods={"G": {}, "H": {}})
    assert fatal == []


# ---------------------------------------------------------------------------
# Attribution and reachability
# ---------------------------------------------------------------------------

def test_a_record_whose_declared_god_contradicts_the_table_offering_it_stops_the_run():
    """Cheap, because the extractor holds both sides -- and it is the check
    that would have caught the two records the overlay corrects by hand."""
    _, fatal = check(
        {"A": boon(id="A", god="Demeter")},
        gods={"Demeter": {}},
        raw_defs={"A": {"God": "Zeus"}},
        loot_membership={"A": "Demeter"},
    )
    assert any("declares Zeus" in f for f in fatal)


def test_the_two_records_the_game_itself_gets_wrong_are_exempted():
    known = sorted(validate.GOD_DISAGREES_WITH_LOOT_TABLE_KNOWN)[0]
    report, fatal = check(
        {known: boon(id=known, god="Demeter")},
        gods={"Demeter": {}},
        raw_defs={known: {"God": "Zeus"}},
        loot_membership={known: "Demeter"},
    )
    assert fatal == []
    assert report["godDisagreesWithOwningLootTable"]


def test_a_named_record_no_source_file_offers_is_listed():
    """A trait definition is not a source. A named record nobody references is
    cut content that kept its text, and a view iterating the catalog would
    render it as a real boon."""
    report, fatal = check(
        {"Live": boon(id="Live", name="Live"), "Cut": boon(id="Cut", name="Cut")},
        raw_defs={"Live": {}, "Cut": {}},
        external_references={"Live"},
    )
    assert report["boonsNotReferencedOutsideTraitData"] == ["Cut"]
    assert fatal == [], "advisory: the answer is a judgement, not a defect"


def test_a_hammer_is_excluded_before_that_test_is_applied():
    """Their pool is derived from the weapon rather than listed anywhere, so
    the test says nothing about them."""
    report, _ = check(
        {"H": boon(id="H", name="Hammer")},
        raw_defs={"H": {"InheritFrom": ["WeaponTrait"]}},
        external_references=set(),
    )
    assert report["boonsNotReferencedOutsideTraitData"] == []


def test_an_unnamed_record_is_not_a_candidate():
    report, _ = check(
        {"T": boon(id="T", name=None)},
        raw_defs={"T": {}},
        external_references=set(),
    )
    assert report["boonsNotReferencedOutsideTraitData"] == []


def test_a_check_that_could_not_run_is_absent_rather_than_empty():
    """The fixtures have no game scripts to scan. A check that could not run
    must not read as one that passed."""
    report, _ = check({"A": boon(id="A", name="A")})
    assert "boonsNotReferencedOutsideTraitData" not in report


# ---------------------------------------------------------------------------
# Element-gated boons
# ---------------------------------------------------------------------------

def test_an_element_gated_boon_with_no_element_threshold_stops_the_run():
    """Its whole cost is the threshold; without one the boon reads as free."""
    _, fatal = check(
        {"I": boon(id="I")},
        raw_defs={"I": {"InheritFrom": ["UnityTrait"]}},
    )
    assert any("no element threshold" in f for f in fatal)


def test_an_element_gated_boon_carrying_an_affinity_of_its_own_stops_the_run():
    _, fatal = check(
        {"I": boon(id="I", elementAffinity="Fire",
                   prereq={"kind": "hasElement", "element": "Fire", "count": 2})},
        raw_defs={"I": {"InheritFrom": ["UnityTrait"]}},
    )
    assert any("affinity of its own" in f for f in fatal)


# ---------------------------------------------------------------------------
# The census of what nothing reads
# ---------------------------------------------------------------------------

def test_a_gate_shaped_key_no_classifier_reads_is_counted():
    """The population of clauses has twice been measured by listing the idioms
    somebody remembered, and been wrong both times. This counts from the other
    direction, so a key introduced by a patch shows up instead of being
    silence."""
    counts = validate.unconsumed_clause_keys({
        "A": {"RequiredSomethingNew": "x", "RequiredTrait": "y"},
    })
    assert counts == {"RequiredSomethingNew": 1}


def test_a_misspelled_gate_key_is_counted_too():
    """The game's own data carries one, which the engine ignores as silently as
    the extractor would."""
    counts = validate.unconsumed_clause_keys({"A": {"RequiresFalseTraits": ["B"]}})
    assert "RequiresFalseTraits" in counts


def test_a_key_somebody_has_read_and_ruled_out_is_not_reported():
    """Every display-side and offer-weighting key matches the census pattern, so
    reporting them left nine standing per game -- and a tenth arriving in a list
    of nine is not something anybody notices."""
    judged = sorted(validate.CLAUSE_KEYS_THAT_ARE_NOT_GATES)[0]
    counts = validate.unconsumed_clause_keys({"A": {judged: True, "RequiredBrandNew": 1}})
    assert counts == {"RequiredBrandNew": 1}


def test_every_ruled_out_key_says_why():
    """The reason is what lets a later reader disagree with the judgement."""
    assert all(isinstance(r, str) and r
               for r in validate.CLAUSE_KEYS_THAT_ARE_NOT_GATES.values())


def test_nested_requirement_tables_are_scanned():
    counts = validate.unconsumed_clause_keys({
        "A": {"GameStateRequirements": [{"WeirdNewRequirements": 1}]},
    })
    assert counts == {"WeirdNewRequirements": 1}


# ---------------------------------------------------------------------------
# Misconfiguration must fail the extraction, not produce a plausible answer
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("script,variable", [
    ("normalize_h1.py", "EXTRACT_SCRIPTS_HADES1"),
    ("normalize_h2.py", "EXTRACT_SCRIPTS_HADES2"),
])
def test_a_scripts_path_that_is_not_the_scripts_directory_stops_the_run(script, variable, tmp_path):
    """Both normalizers used to carry on: a missing file answers "no keys" in
    the same shape a genuinely empty optional file does, so every record failed
    its source lookup, the whole catalog was reclassified as templates, and the
    run wrote nothing over the catalog and reported success."""
    empty = tmp_path / "not-the-scripts-dir"
    empty.mkdir()
    out = tmp_path / "out"
    env = dict(
        os.environ,
        PYTHONPATH=str(TOOL / "src"),
        EXTRACT_RAW=str(TOOL / "fixtures" / "h1-shape" / "raw") + os.sep,
        EXTRACT_OUT=str(out) + os.sep,
        EXTRACT_SCRIPTS_HADES1=str(TOOL / "fixtures" / "h1-shape" / "input") + os.sep,
        EXTRACT_SCRIPTS_HADES2=str(TOOL / "fixtures" / "h2-shape" / "input") + os.sep,
        EXTRACT_TEXT_HADES1=str(TOOL / "fixtures" / "h1-shape" / "input") + os.sep,
        EXTRACT_TEXT_HADES2=str(TOOL / "fixtures" / "h2-shape" / "input") + os.sep,
    )
    env[variable] = str(empty) + os.sep
    result = subprocess.run(
        [sys.executable, str(TOOL / "src" / script)],
        env=env, capture_output=True, text=True,
    )
    assert result.returncode == 1, result.stdout
    assert not list(out.rglob("*.json")), "it wrote output despite failing"


# ---------------------------------------------------------------------------
# The fixtures, end to end
# ---------------------------------------------------------------------------

def run_fixture(shape, script, game, out_root):
    env = dict(
        os.environ,
        PYTHONPATH=str(TOOL / "src"),
        EXTRACT_RAW=str(TOOL / "fixtures" / shape / "raw") + os.sep,
        EXTRACT_OUT=str(out_root) + os.sep,
        EXTRACT_SCRIPTS_HADES1=str(TOOL / "fixtures" / shape / "input") + os.sep,
        EXTRACT_SCRIPTS_HADES2=str(TOOL / "fixtures" / shape / "input") + os.sep,
        EXTRACT_TEXT_HADES1=str(TOOL / "fixtures" / shape / "input") + os.sep,
        EXTRACT_TEXT_HADES2=str(TOOL / "fixtures" / shape / "input") + os.sep,
    )
    result = subprocess.run(
        [sys.executable, str(TOOL / "src" / script)], env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    produced = Path(out_root) / game
    return (
        json.loads((produced / "boons.json").read_text()),
        json.loads((produced / "_clause_report.json").read_text()),
    )


def test_the_malformed_fixture_record_refuses_instead_of_passing_through(tmp_path):
    """This fixture was written to prove the classifier's fail path exists, and
    for as long as it has been committed it proved the opposite: the record was
    emitted with its unrecognised clause passed through verbatim and the run
    exited zero. That outcome is not one the fixture's own pass condition
    listed."""
    boons, report, = run_fixture("h2-shape", "normalize_h2.py", "hades2", tmp_path)
    assert boons["CindraMalformedBoon"]["prereq"] == {"type": requirements.UNCLASSIFIED_MARKER}
    assert [f["id"] for f in report["buildFailures"]] == ["CindraMalformedBoon"]

    _, fatal = validate.validate_game(
        "hades2", boons, {}, {}, clause_report=report,
    )
    assert any("CindraMalformedBoon" in f for f in fatal)


def test_the_dangling_fixture_reference_is_actually_checked(tmp_path):
    """The golden test runs the normalizers and stops, so nothing had ever
    asserted this fixture's dangling reference was reported."""
    boons, report = run_fixture("h2-shape", "normalize_h2.py", "hades2", tmp_path)
    validation, _ = validate.validate_game("hades2", boons, {}, {}, clause_report=report)
    assert validation["danglingPrereqReferences"] == {"VerdanBriarBoon": ["VerdanPhantomBoon"]}


@pytest.mark.parametrize("shape,script,game", [
    ("h1-shape", "normalize_h1.py", "hades1"),
    ("h2-shape", "normalize_h2.py", "hades2"),
])
def test_the_asymmetric_fixture_negation_becomes_a_block_not_an_exclusion(shape, script, game, tmp_path):
    """Recording a one-directional block as a mutual exclusion makes every
    other member unobtainable, which is a false verdict on the trait that was
    never blocked."""
    boons, _ = run_fixture(shape, script, game, tmp_path)
    blocked = {i: r["blockedBy"] for i, r in boons.items() if r["blockedBy"]}
    assert blocked
    for record in boons.values():
        assert not (record["blockedBy"] and record["exclusiveGroup"])


# ---------------------------------------------------------------------------
# The Godsent Hexs: counted, because missing them is silent
# ---------------------------------------------------------------------------

def paired(hex_id, god):
    """A requirement with the paired-Hex shape: hold the Hex AND reach the god."""
    return requirements.all_of([
        requirements.has_trait(hex_id),
        requirements.any_of([
            requirements.has_boon_from(god),
            requirements.has_keepsake("Force%sBoonKeepsake" % god),
        ]),
    ])


def a_catalog_of_pairs(count):
    # Attribution is left off on purpose: the check reads the requirement's
    # shape and nothing else, so naming gods here would only be feeding a
    # different check's vocabulary rule.
    return {
        "Pair%d" % n: boon(id="Pair%d" % n,
                           prereq=paired("Spell%dTrait" % n, "God%d" % n))
        for n in range(count)
    }


def test_the_expected_number_of_pairs_passes():
    _, fatal = check(a_catalog_of_pairs(9), godsent_hexes_expected=9)
    assert fatal == []


def test_a_missing_pair_stops_the_run():
    """The failure this exists for, and it never arrives as an error.

    Deciding a record is one of these is three tests against the raw data, and
    missing on any of them is a `continue`. The record then keeps no god and
    silently loses the half of its requirement that names the Hex, so it renders
    as reachable without the Hex it needs.
    """
    report, fatal = check(a_catalog_of_pairs(8), godsent_hexes_expected=9)
    assert report["godsentHexCount"] == 8
    assert any("expected 9" in f for f in fatal)


def test_none_at_all_stops_the_run_rather_than_reading_as_nothing_to_check():
    """A renamed marker string finds zero, which is the shape of the whole
    detection breaking rather than of a catalog that has no pairs."""
    _, fatal = check({}, godsent_hexes_expected=9)
    assert any("has 0" in f for f in fatal)


def test_a_boon_asking_for_any_of_several_hexes_is_not_counted_as_a_pair():
    """Measured, not assumed: the looser test everyone reaches for first --
    does the requirement mention a Hex -- matches one record more than there
    are pairs. It asks for any of seven Hexes and has no paired-god half at
    all, which is a different mechanic. An assertion written that way fails on
    a correct catalog, which is the kind that gets deleted rather than fixed.
    """
    catalog = a_catalog_of_pairs(9)
    catalog["WhisperedPrayerish"] = boon(
        id="WhisperedPrayerish",
        prereq=requirements.any_of([
            requirements.has_trait("Spell%dTrait" % n) for n in range(7)
        ]),
    )
    report, fatal = check(catalog, godsent_hexes_expected=9)
    assert "WhisperedPrayerish" not in report["godsentHexes"]
    assert fatal == []


def test_a_pair_that_lost_its_hex_half_is_no_longer_a_pair():
    """What the silent failure actually leaves behind: the god half survives
    because it is a written clause, and the derived half is simply gone."""
    catalog = a_catalog_of_pairs(9)
    catalog["Pair0"]["prereq"] = requirements.any_of([
        requirements.has_boon_from("Apollo"),
        requirements.has_keepsake("ForceApolloBoonKeepsake"),
    ])
    report, fatal = check(catalog, godsent_hexes_expected=9)
    assert report["godsentHexCount"] == 8
    assert fatal


def test_the_check_is_skipped_where_no_population_is_expected():
    """The fixtures carry no such records, and a check that cannot run is
    different from one that passed."""
    report, fatal = check(a_catalog_of_pairs(3))
    assert "godsentHexCount" not in report
    assert fatal == []


# ---------------------------------------------------------------------------
# The boons belonging to two gods, counted for the same reason
# ---------------------------------------------------------------------------

def a_catalog_of_duos(count):
    return {
        "Duo%d" % n: boon(id="Duo%d" % n, duoGods=["God%d" % n, "Other%d" % n])
        for n in range(count)
    }


def gods_named_by(catalog):
    """Every god the catalog attributes to, as the god roster.

    Unlike the paired-Hex catalogs above, these cannot leave attribution off --
    the field under test *is* the attribution -- so the invented names have to
    be declared or they trip the separate check that a god a boon names is a
    god the game has.
    """
    return {g: {} for b in catalog.values() for g in (b.get("duoGods") or [])}


def check_duos(catalog, **kw):
    return check(catalog, gods=gods_named_by(catalog), **kw)


def test_the_expected_number_of_duos_passes():
    _, fatal = check_duos(a_catalog_of_duos(28), duo_boons_expected=28)
    assert fatal == []


def test_an_ordinary_boon_that_gained_a_second_owner_stops_the_run():
    """The direction that costs the most. Ownership is decided by arithmetic --
    two loot tables offering a boon is the only statement either game makes
    that one is a Duo -- so a boon that drifts into a second god's table is
    filed as one, and loses its god, its ladder rung and its category together.
    Nothing about the record itself reads as wrong afterwards.
    """
    catalog = a_catalog_of_duos(28)
    catalog["OrdinaryBoon"] = boon(id="OrdinaryBoon", duoGods=["Zeus", "Demeter"])
    report, fatal = check_duos(catalog, duo_boons_expected=28)
    assert report["duoBoonCount"] == 29
    assert any("expected 28" in f for f in fatal)


def test_a_duo_that_lost_an_owner_stops_the_run_too():
    """The other direction, which is quieter: it stops being a Duo, lands on
    one god's ladder, and claims a rung it does not stand on."""
    catalog = a_catalog_of_duos(28)
    catalog["Duo0"]["duoGods"] = None
    catalog["Duo0"]["god"] = "God0"
    report, fatal = check_duos(catalog, duo_boons_expected=28)
    assert report["duoBoonCount"] == 27
    assert any("expected 28" in f for f in fatal)


def test_a_duo_naming_a_number_of_gods_that_is_not_two_stops_the_run():
    """A Duo names two gods by construction. Three is the attribution reaching
    a shape the field cannot mean, and the count alone would not see it."""
    catalog = a_catalog_of_duos(28)
    catalog["Duo0"]["duoGods"] = ["A", "B", "C"]
    report, fatal = check_duos(catalog, duo_boons_expected=28)
    assert report["duoBoonsNotNamingTwoGods"] == ["Duo0"]
    assert any("naming 3 gods" in f for f in fatal)


def test_the_duo_count_is_skipped_where_no_population_is_expected():
    report, fatal = check_duos(a_catalog_of_duos(3))
    assert "duoBoonCount" not in report
    assert fatal == []
