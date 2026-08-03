"""Tests for which god a Hades I boon belongs to.

Hades I states ownership in four places that do not always agree, and for a
long time this code read only two of them -- the trait's own `God` field and
the god's menu lists. Everything a god sells behind a prerequisite is in
neither: it is listed under the god who gates it, in `LinkedUpgrades`. So every
Duo and every gated boon came out belonging to nobody, which then took its
ladder depth and its category down with it.

The gods here are the fixture's invented ones. That is the point -- the table
of god names used to be written out longhand, so no test could reach this code
at all without putting real game content into the repository.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent


def run_h1(out_root):
    env = dict(
        os.environ,
        PYTHONPATH=str(TOOL / "src"),
        EXTRACT_RAW=str(TOOL / "fixtures" / "h1-shape" / "raw") + os.sep,
        EXTRACT_OUT=str(out_root) + os.sep,
        EXTRACT_SCRIPTS_HADES1=str(TOOL / "fixtures" / "h1-shape" / "input") + os.sep,
        EXTRACT_TEXT_HADES1=str(TOOL / "fixtures" / "h1-shape" / "input") + os.sep,
    )
    result = subprocess.run(
        [sys.executable, str(TOOL / "src" / "normalize_h1.py")],
        env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    produced = Path(out_root) / "hades1"
    return (
        json.loads((produced / "boons.json").read_text()),
        json.loads((produced / "gods.json").read_text()),
    )


# ---------------------------------------------------------------------------
# Which loot tables are gods
# ---------------------------------------------------------------------------

def test_a_god_is_found_by_its_shape_rather_than_by_its_name(tmp_path):
    """The fixture's gods are invented, so a name-matched table finds none of
    them -- and used to, which ran this whole half of the file as a no-op."""
    _, gods = run_h1(tmp_path)
    assert set(gods) == {"Sable", "Auric", "Fennick"}


def test_a_god_who_gives_up_the_pool_flag_is_still_a_god(tmp_path):
    """The one real case is Hermes, who hands out boons without being part of
    the pool the player picks from. Nothing distinguishes that table from the
    hammer's except that somebody does the offering."""
    _, gods = run_h1(tmp_path)
    assert gods["Fennick"]["kind"] == "NonPoolSlot"
    assert gods["Sable"]["kind"] == "PoolSlot"


def test_the_mechanical_slots_are_not_mistaken_for_gods(tmp_path):
    """The hammer's table inherits the same base a god's does, so inheritance
    alone would sweep it in and invent a god called Weapon."""
    _, gods = run_h1(tmp_path)
    assert not any(name.startswith("__mechanic") for name in gods)
    assert "Weapon" not in gods and "Stack" not in gods


# ---------------------------------------------------------------------------
# Who grants a boon
# ---------------------------------------------------------------------------

def test_a_boon_two_tables_offer_belongs_to_both(tmp_path):
    """This is the whole of what a Hades I Duo is. There is no separate Duo id
    space and no field saying so -- being gated by two gods is the statement.
    Read as one god's, it lands on that god's ladder and claims a rung it does
    not have; read as nobody's, it disappears out of both gods' lists."""
    boons, _ = run_h1(tmp_path)
    pyre = boons["SablePyreTrait"]
    assert pyre["duoGods"] == ["Auric", "Sable"]
    assert pyre["god"] is None


def test_a_duo_stands_on_neither_gods_ladder(tmp_path):
    boons, _ = run_h1(tmp_path)
    assert boons["SablePyreTrait"]["tier"] is None


def test_a_duo_is_still_the_pantheons_content(tmp_path):
    """Both of its gods are in the pool, so dropping it out of the standard
    category would hide it from every view that filters on one."""
    boons, _ = run_h1(tmp_path)
    assert boons["SablePyreTrait"]["boonCategory"] == "StandardOlympian"


def test_two_tables_outrank_a_declared_god(tmp_path):
    """`SablePyreTrait` declares one god and is offered by two. The declared
    field is the game's own reader collapsing a pair to whichever it saw
    first, which is an artifact of how it looks the answer up rather than a
    claim about who grants the boon."""
    raw = json.loads(
        (TOOL / "fixtures" / "h1-shape" / "raw" / "h1_TraitData.json").read_text()
    )
    assert raw["SablePyreTrait"]["God"] == "Sable", "fixture no longer states the conflict"
    boons, _ = run_h1(tmp_path)
    assert boons["SablePyreTrait"]["god"] is None


def test_a_boon_only_its_gate_names_still_finds_its_god(tmp_path):
    """A gated boon carries no `God` field and is in none of the menu lists;
    the god who gates it is the only thing that says whose it is."""
    boons, _ = run_h1(tmp_path)
    combo = boons["SableEmberComboTrait"]
    assert combo["god"] == "Sable"
    assert combo["duoGods"] is None
    assert combo["tier"] == 2, "a gated boon stands a rung above what gates it"


def test_a_god_a_single_table_offers_makes_it_pantheon_content(tmp_path):
    boons, _ = run_h1(tmp_path)
    assert boons["SableEmberComboTrait"]["boonCategory"] == "StandardOlympian"
    assert boons["SableEmberComboTrait"]["godKind"] == "PoolSlot"


def test_a_boon_that_names_its_own_source_finds_its_god(tmp_path):
    """Six real Hades I traits are listed in no god's block and say whose they
    are on themselves instead. Without reading that they belong to nobody --
    including Deathless Stand, which is an ordinary Athena boon."""
    boons, _ = run_h1(tmp_path)
    tide = boons["SableTideTrait"]
    assert tide["god"] == "Sable"
    assert tide["duoGods"] is None


def test_naming_a_source_does_not_make_a_boon_a_duo(tmp_path):
    """It states the same thing a loot table does, so a trait that is both
    listed and self-declared has one god, not two."""
    boons, _ = run_h1(tmp_path)
    assert boons["SableTideTrait"]["duoGods"] is None
    duos = {i for i, r in boons.items() if r["duoGods"]}
    assert duos == {"SablePyreTrait"}


def test_a_boon_no_table_offers_belongs_to_nobody(tmp_path):
    """Not every trait is somebody's. Guessing a god for one that no table
    claims is how cut content ends up rendered as a real boon."""
    boons, _ = run_h1(tmp_path)
    bloom = boons["SableAuricBloomTrait"]
    assert bloom["god"] is None
    assert bloom["duoGods"] is None
