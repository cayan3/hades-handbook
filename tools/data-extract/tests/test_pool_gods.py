"""Tests for which Hades II loot tables are gods, and which gods are in the pool.

The section names here are the fixture's invented ones, which is the point. The
map from a section to its offering table used to be the ten real gods written
out, so the fixture matched none of them: `gods.json` came out empty, and with
it `pool_god_names`, and with that every boon in the fixture was filed
`NonPoolSlot` / `NonStandard`. Against the installed game that pairing is the
minority answer, so the golden was freezing the least representative result
this code can produce, and freezing it for a reason no test stated.

Nothing here asserts a name. What each test states is the shape the game uses
to say the same thing: a table inherits the loot base, and either keeps the
pool flag or has somebody to do the offering.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent


def run_h2(out_root):
    env = dict(
        os.environ,
        PYTHONPATH=str(TOOL / "src"),
        EXTRACT_RAW=str(TOOL / "fixtures" / "h2-shape" / "raw") + os.sep,
        EXTRACT_OUT=str(out_root) + os.sep,
        EXTRACT_SCRIPTS_HADES2=str(TOOL / "fixtures" / "h2-shape" / "input") + os.sep,
        EXTRACT_TEXT_HADES2=str(TOOL / "fixtures" / "h2-shape" / "input") + os.sep,
    )
    result = subprocess.run(
        [sys.executable, str(TOOL / "src" / "normalize_h2.py")],
        env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    produced = Path(out_root) / "hades2"
    return (
        json.loads((produced / "boons.json").read_text()),
        json.loads((produced / "gods.json").read_text()),
    )


def raw_loot():
    return json.loads(
        (TOOL / "fixtures" / "h2-shape" / "raw" / "h2_LootSetData.json").read_text()
    )


# ---------------------------------------------------------------------------
# Which loot tables are gods
# ---------------------------------------------------------------------------

def test_a_god_is_found_by_its_shape_rather_than_by_its_name(tmp_path):
    _, gods = run_h2(tmp_path)
    assert {name for name in gods if not name.startswith("__")} == {
        "Cindra", "Verdan", "Thren",
    }


def test_a_god_who_declares_the_pool_flag_is_in_the_pool(tmp_path):
    _, gods = run_h2(tmp_path)
    assert gods["Verdan"]["kind"] == "PoolSlot"


def test_a_god_who_declares_no_pool_flag_inherits_one(tmp_path):
    """Cindra says nothing about the pool anywhere on her own table -- she is in
    it through the base every offering table inherits. Two of the installed
    game's Olympians are in exactly that position, so a reader that took the
    field off the table would answer nothing for them and drop them out of the
    pool. Verdan is the same fact declared rather than inherited, and the pair
    is what separates a resolver from a lookup that got lucky."""
    assert "GodLoot" not in raw_loot()["Cindra"]["CindraUpgrade"], (
        "fixture no longer states the case: Cindra now declares her own flag"
    )
    _, gods = run_h2(tmp_path)
    assert gods["Cindra"]["kind"] == "PoolSlot"


def test_a_god_who_gives_up_the_pool_flag_is_still_a_god(tmp_path):
    """Thren hands boons out without taking a pool slot. Nothing separates his
    table from the weapon upgrade's except that somebody does the offering."""
    _, gods = run_h2(tmp_path)
    assert gods["Thren"]["kind"] == "NonPoolSlot"


def test_the_mechanical_slots_are_not_mistaken_for_gods(tmp_path):
    """They inherit the same base a god's table does, and one of them gives up
    the pool flag exactly as Thren does, so neither test on its own keeps them
    out -- inheritance alone would invent a god called Weapon."""
    _, gods = run_h2(tmp_path)
    assert "Weapon" not in gods and "Stack" not in gods
    assert gods["__mechanic_WeaponUpgrade"]["kind"] == "NonPoolSlot"


def test_a_god_is_named_by_its_section_and_not_by_its_table(tmp_path):
    """One god in the installed game hands boons out through a table named for
    the mechanic rather than for him. Read from the table id, that god drops
    out of the emitted records entirely -- and a god who was never read looks
    exactly like a god the game does not have."""
    assert "ThrenUpgrade" not in raw_loot()["Thren"], (
        "fixture no longer states the case: Thren's table now matches his name"
    )
    _, gods = run_h2(tmp_path)
    assert gods["Thren"]["id"] == "WanderUpgrade"


# ---------------------------------------------------------------------------
# What being in the pool decides
# ---------------------------------------------------------------------------

def test_a_pool_gods_boons_are_the_pantheons_standard_content(tmp_path):
    """Both fields follow from the god's table rather than from anything on the
    boon, so a god the extractor failed to recognise takes every one of her
    boons out of the standard category with her."""
    boons, _ = run_h2(tmp_path)
    strike = boons["CindraStrikeBoon"]
    assert strike["godKind"] == "PoolSlot"
    assert strike["boonCategory"] == "StandardOlympian"


def test_a_cameo_gods_boons_are_not_standard_content(tmp_path):
    """The same two fields taking the other branch. Orithia is not in the loot
    data at all; her boon is marked a cameo by what it inherits, which is the
    other of the two signals the game uses to keep a god out of the pool. Both
    assertions held before any god was recognised, when every record in this
    fixture answered this way -- they only say something now that some other
    god takes the opposite branch."""
    boons, gods = run_h2(tmp_path)
    assert "Orithia" not in gods
    assert boons["OrithiaBlessBoon"]["godKind"] == "NonPoolSlot"
    assert boons["OrithiaBlessBoon"]["boonCategory"] == "NonStandard"
