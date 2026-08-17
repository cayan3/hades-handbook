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


def test_every_field_takes_the_punctuation_the_id_line_takes(tmp_path):
    """The Id line learned the comma and the value lines did not, which moved
    the same silence one field over instead of ending it.

    An entry punctuated the way twenty-three of Hades I's Id lines already are
    parses its own boundary correctly and then loses everything inside it: the
    name, the description, and -- worst of the three -- the InheritFrom, which
    is what would otherwise have recovered the name a hop up. So both of the
    ways this file has of naming an entry fail at once, and the record reaches
    the catalog nameless with nothing raised.
    """
    entries = bundle_file(tmp_path, '''
{
  Id = "Parent"
  DisplayName = "Ember Ward"
}
{
  Id = "Comma'd",
  DisplayName = "Root Ward",
  Description = "every line punctuated the same way",
  InheritFrom = "Parent",
}
''')
    assert entries["Comma'd"]["displayName"] == "Root Ward"
    assert entries["Comma'd"]["description"] == "every line punctuated the same way"
    assert entries["Comma'd"]["inheritFrom"] == "Parent"


def test_a_comma_does_not_cost_an_entry_the_name_it_inherits(tmp_path):
    """The two fixes together: an entry with no name of its own, whose only
    route to one is an InheritFrom line carrying the comma."""
    entries = bundle_file(tmp_path, '''
{
  Id = "Parent"
  DisplayName = "Ember Ward"
}
{
  Id = "Child",
  InheritFrom = "Parent",
}
''')
    assert resolve_display_name(entries, "Child") == "Ember Ward"


def test_a_bare_line_is_still_read_now_that_the_comma_is_allowed(tmp_path):
    """The other direction, which is how nearly every entry in both games is
    written -- loosening the grammar must not cost the common case."""
    entries = bundle_file(tmp_path, '''
{
  Id = "Plain"
  DisplayName = "Ember Ward"
  Description = "no commas anywhere"
  InheritFrom = "Elsewhere"
}
''')
    assert entries["Plain"]["displayName"] == "Ember Ward"
    assert entries["Plain"]["description"] == "no commas anywhere"
    assert entries["Plain"]["inheritFrom"] == "Elsewhere"


def test_a_value_may_be_followed_by_a_block_comment(tmp_path):
    """The next punctuation the file invented, on thirteen Hades I lines and
    every one of them a DisplayName. They are the B-side Mirror talents, each
    annotated with the talent it is paired against -- so the names a Mirror gate
    has to be able to say were the exact ones being dropped."""
    entries = bundle_file(tmp_path, '''
{
  Id = "Annotated"
  DisplayName = "Ember Ward" /* Paired with RootWard "Root Ward" */
}
''')
    assert entries["Annotated"]["displayName"] == "Ember Ward"


def test_a_value_that_is_not_alone_on_its_line_is_still_refused(tmp_path):
    """The comma is optional; the rest of the anchoring is not. A line with a
    second field after the comma is a shape nobody has read against the game,
    and reading it as a name would be guessing at a grammar rather than
    following one.
    """
    entries = bundle_file(tmp_path, '''
{
  Id = "Packed"
  DisplayName = "Ember Ward", Description = "and more"
}
''')
    assert entries["Packed"].get("displayName") is None
