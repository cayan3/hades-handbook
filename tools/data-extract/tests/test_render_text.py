"""Tests for turning a Codex entry's markup into the sentence a card shows.

The games write a description as display markup and the app renders text, so
every construction in between has to be resolved or dropped here. The two that
matter are opposites: a keyword reference must lose its decorative glyph and
keep its word, and an inline icon must lose nothing -- it is the noun.
"""

import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOL / "src"))

from render_text import VALUE, descriptions_for, render_description, render_name  # noqa: E402


KEYWORDS = {
    "Ember": {"displayName": "Ember"},
    "Mana": {"displayName": "{!Icons.Mana} Kindling"},
    "Ammo": {"displayName": "{!Icons.Ammo} Sparks"},
    # Only the stem is an entry, which is the games' own shape: neither
    # `ArmorTotal_NoTooltip` nor `ArmorTotal` exists and the ladder is the only
    # thing that reaches `Armor`.
    "Armor": {"displayName": "Warding"},
    "Deep": {"inheritFrom": "Armor"},
    "Quoting": {"displayName": "{$Keywords.Ember} Ward"},
    "Bullet": {"description": "a list glyph with no name"},
    # An element: the icon key has no entry under any stem of its own, and the
    # word lives on a differently-named keyword entry.
    "AirBoon": {"displayName": "{!Icons.CurseAir} Gust"},
}


def test_a_keyword_becomes_the_word_the_game_shows():
    assert render_description("Your {$Keywords.Ember} burns.", KEYWORDS) == "Your Ember burns."


def test_a_keywords_own_glyph_is_dropped_rather_than_named():
    """A title is written `{!Icons.Mana} Kindling`: the glyph prefixes the word
    rather than standing for it, so substituting it would put the icon's own
    title where the word belongs."""
    assert render_description("Spend {$Keywords.Mana} now.", KEYWORDS) == "Spend Kindling now."


def test_an_inline_icon_becomes_the_noun_it_stands_for():
    """The opposite case, and the one that changes what a sentence claims:
    "Foes drop stuck in them" is a different statement from the original."""
    assert render_description("Foes drop {!Icons.Ammo} faster.", KEYWORDS) == "Foes drop Sparks faster."


def test_an_icon_variant_resolves_by_stripping_one_suffix():
    assert render_description("Gain {!Icons.Armor_NoTooltip}.", KEYWORDS) == "Gain Warding."


def test_a_variant_spelled_with_two_suffixes_strips_both():
    """`ArmorTotal_NoTooltip` is `Armor` two hops down, and neither hop is an
    entry, so nothing but the ladder gets there."""
    assert render_description("Gain {!Icons.ArmorTotal_NoTooltip}.", KEYWORDS) == "Gain Warding."


def test_stripping_stops_at_a_stem_the_bundle_does_not_name():
    """A key whose stem is not an entry resolves to nothing rather than to
    whatever the next strip happens to land on."""
    assert render_description("Gain {!Icons.KindleTotal}.", KEYWORDS) == "Gain."


def test_a_key_the_ladder_cannot_reach_is_aliased_rather_than_guessed():
    """The elements are named on a `<Element>Boon` entry and nothing is named
    `Air`, so stripping alone drops the noun the sentence is about."""
    assert (
        render_description("While you have {!Icons.AirNoTooltip}, you win.", KEYWORDS)
        == "While you have Gust, you win."
    )


def test_an_inherited_name_is_followed_before_any_stripping():
    assert render_description("Gain {!Icons.Deep}.", KEYWORDS) == "Gain Warding."


def test_an_icon_the_bundle_does_not_name_is_dropped():
    """The unnamed ones are punctuation -- a bullet, an arrow -- so a stand-in
    would put a placeholder where the game draws a list marker."""
    assert render_description("{!Icons.Bullet}Ward yourself.", KEYWORDS) == "Ward yourself."


def test_a_runtime_value_is_marked_rather_than_invented():
    """Every number in the game scales with rarity, so there is no single right
    one to bake in."""
    rendered = render_description("Deal {$TooltipData.Damage} damage.", KEYWORDS)
    assert rendered == "Deal %s damage." % VALUE


def test_the_mark_reads_in_the_two_positions_that_chose_it():
    """A signed bonus and a percentage are where the mark sits against another
    glyph rather than against a space, and they are what ruled the dash out."""
    signed = render_description("Gain +{$TooltipData.Armor} Armor.", KEYWORDS)
    assert signed == "Gain +%s Armor." % VALUE
    percent = render_description("Channel {$TooltipData.Speed} % faster.", KEYWORDS)
    assert percent == "Channel %s%% faster." % VALUE


def test_the_stat_table_after_the_first_break_is_dropped():
    raw = (
        "Your Ward is stronger. \\n "
        "{!Icons.Bullet}{#PropertyFormat}Power: \\Column 380 {$TooltipData.Delta1}"
    )
    assert render_description(raw, KEYWORDS) == "Your Ward is stronger."


def test_colour_directives_leave_nothing_behind():
    raw = "{#BoldFormat}Ward {#PreviousFormat}yourself."
    assert render_description(raw, KEYWORDS) == "Ward yourself."


def test_a_title_quoting_another_keyword_still_resolves():
    assert render_description("Gain {$Keywords.Quoting}.", KEYWORDS) == "Gain Ember Ward."


def test_a_name_written_as_markup_becomes_a_word():
    """Thirteen Hades II records write their name as an icon rather than as
    text, which reaches every surface that draws a name."""
    assert render_name("{!Icons.Ammo}", KEYWORDS) == "Sparks"


def test_a_name_with_nothing_resolvable_in_it_is_nothing():
    """Nothing back means the caller falls back to the id, which is at least
    something a player can quote."""
    assert render_name("{!Icons.Bullet}", KEYWORDS) is None


def test_a_plain_name_is_left_alone():
    assert render_name("Ember Ward", KEYWORDS) == "Ember Ward"


def test_only_the_refs_a_record_names_are_rendered():
    """The bundle holds the whole game's help text; carrying the part nothing
    can reach would be somebody else's prose shipped for nothing."""
    bundle = {
        "Wanted": {"description": "Your {$Keywords.Ember} burns."},
        "Unwanted": {"description": "Never referenced."},
    }
    assert descriptions_for(["Wanted"], bundle, KEYWORDS) == {"Wanted": "Your Ember burns."}


def test_a_ref_with_no_text_behind_it_is_absent_rather_than_empty():
    """Roughly a fifth of each game's entries are debug and cut content with no
    description at all, and an empty string on a card is a gap with no reason."""
    assert descriptions_for(["Bare"], {"Bare": {}}, KEYWORDS) == {}
