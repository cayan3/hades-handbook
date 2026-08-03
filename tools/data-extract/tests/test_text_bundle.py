"""Tests for reading Supergiant's semi-JSON text bundles.

The bundle is where every display name comes from, and it is somebody else's
hand-maintained file: it punctuates itself inconsistently and lets an entry
borrow its name from another. Both of those went unread for as long as this
tool has existed, and one of them did not fail quietly -- it reported a real
name against the wrong trait.
"""

import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOL / "src"))

from parse_text_bundle import parse_sjson_text_bundle, resolve_display_name  # noqa: E402


def bundle_file(tmp_path, body):
    path = tmp_path / "Text.en.sjson"
    path.write_text(body, encoding="utf-8")
    return parse_sjson_text_bundle(str(path))


# ---------------------------------------------------------------------------
# What it is called
# ---------------------------------------------------------------------------


def test_a_name_is_followed_through_the_bundles_own_inheritance():
    bundle = {
        "Child": {"inheritFrom": "Parent"},
        "Parent": {"displayName": "Ember Ward"},
    }
    assert resolve_display_name(bundle, "Child") == "Ember Ward"


def test_an_entrys_own_name_wins_over_the_one_it_inherits():
    bundle = {
        "Child": {"displayName": "Ember Ward", "inheritFrom": "Parent"},
        "Parent": {"displayName": "Something Else"},
    }
    assert resolve_display_name(bundle, "Child") == "Ember Ward"


def test_a_name_several_hops_up_is_still_found():
    bundle = {
        "A": {"inheritFrom": "B"},
        "B": {"inheritFrom": "C"},
        "C": {"displayName": "Ember Ward"},
    }
    assert resolve_display_name(bundle, "A") == "Ember Ward"


def test_an_id_the_bundle_does_not_have_is_nameless_rather_than_an_error():
    assert resolve_display_name({}, "Absent") is None


def test_a_chain_that_names_nobody_is_nameless():
    bundle = {"A": {"inheritFrom": "B"}, "B": {}}
    assert resolve_display_name(bundle, "A") is None


def test_two_entries_pointing_at_each_other_do_not_hang():
    """Nothing in the format prevents it, and the bundle is somebody else's
    file, so this has to terminate rather than be assumed well-formed."""
    bundle = {"A": {"inheritFrom": "B"}, "B": {"inheritFrom": "A"}}
    assert resolve_display_name(bundle, "A") is None


# ---------------------------------------------------------------------------
# Reading the bundle at all
# ---------------------------------------------------------------------------

def test_an_id_line_may_end_in_a_comma(tmp_path):
    """The file is hand-maintained and punctuates itself inconsistently: most
    entries end the Id line bare, and twenty-three of Hades I's put a comma
    after it. Anchoring to the end of the line drops exactly those."""
    entries = bundle_file(tmp_path, '''
{
  Id = "Plain"
  DisplayName = "Ember Ward"
}
{
  Id = "Trailing",
  DisplayName = "Root Ward"
}
''')
    assert set(entries) == {"Plain", "Trailing"}
    assert entries["Trailing"]["displayName"] == "Root Ward"


def test_a_skipped_entry_does_not_hand_its_name_to_the_one_before_it(tmp_path):
    """The worse half of the same bug, and the one that reaches the catalog as
    a wrong answer rather than a missing one. An unreadable Id line does not
    start a new entry, so its fields land inside the previous entry -- and if
    that entry had no name of its own it takes this one's."""
    entries = bundle_file(tmp_path, '''
{
  Id = "Nameless"
  Description = "no name of its own"
}
{
  Id = "Named",
  DisplayName = "Root Ward"
}
''')
    assert entries["Nameless"].get("displayName") is None
    assert entries["Named"]["displayName"] == "Root Ward"
