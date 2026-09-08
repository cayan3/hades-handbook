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
    # The exception to the rule above: the glyph is the difference between two
    # moves, so a title carrying one keeps it. Written as the game writes it,
    # with the variant suffix the ladder has to strip.
    "AttackEX": {"displayName": "{!Icons.Omega_NoTooltip} Attack"},
    "Omega": {"displayName": "{!Icons.Omega} Moves"},
}


def test_a_keyword_becomes_the_word_the_game_shows():
    assert render_description("Your {$Keywords.Ember} burns.", KEYWORDS) == "Your Ember burns."


def test_a_keywords_own_glyph_is_dropped_rather_than_named():
    """A title is written `{!Icons.Mana} Kindling`: the glyph prefixes the word
    rather than standing for it, so substituting it would put the icon's own
    title where the word belongs."""
    assert render_description("Spend {$Keywords.Mana} now.", KEYWORDS) == "Spend Kindling now."


def test_a_glyph_that_names_the_move_survives_the_title():
    """Attack and Omega Attack are two different moves, so this glyph is not
    decoration on a word — it is half of which move the sentence is about. 66
    Hades II descriptions named the wrong one while it was being dropped."""
    assert render_description("Your {$Keywords.AttackEX} hits.", KEYWORDS) == "Your \u03a9 Attack hits."


def test_the_same_glyph_inline_is_the_character_and_not_its_title():
    """`Omega`'s own entry is "{!Icons.Omega} Moves", so reading it the way an
    ordinary icon is read would put a whole phrase where a symbol belongs."""
    assert render_description("Hold for {!Icons.Omega}.", KEYWORDS) == "Hold for \u03a9."


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


# ---------------------------------------------------------------------------
# The numbers, where the resolver could recover them
# ---------------------------------------------------------------------------
# A recovered entry is a sentence with a `{n}` per slot plus a row of values per
# rarity, so what these pin is the split: which sentences gain one, which stay
# strings, and that a slot nobody could answer keeps the mark beside one that
# somebody could.

DEFS = {
    "Scaling": {
        "RarityLevels": {"Common": {"Multiplier": 1.0}, "Epic": {"Multiplier": 2.0}},
        "Amount": 30,
        "Speed": {"BaseValue": 0.6, "SourceIsMultiplier": True},
        "ExtractValues": [
            {"ExtractAs": "Flat", "Key": "Amount"},
            {"ExtractAs": "Faster", "Format": "NegativePercentDelta", "Key": "Speed"},
        ],
    },
    "Partly": {
        "Amount": 30,
        "ExtractValues": [
            {"ExtractAs": "Known", "Key": "Amount"},
            {
                "ExtractAs": "Unknown",
                "External": True,
                "BaseType": "EffectData",
                "BaseName": "WeakEffect",
                "BaseProperty": "Duration",
            },
        ],
    },
}


def resolver():
    from resolve_values import Resolver

    return Resolver(DEFS, "hades2")


def test_a_sentence_whose_numbers_resolve_becomes_a_template_and_its_values():
    bundle = {
        "Scaling": {
            "description": "Gain +{$TooltipData.ExtractData.Flat} Armor and move"
            " {$TooltipData.ExtractData.Faster}% faster."
        }
    }
    out = descriptions_for(["Scaling"], bundle, KEYWORDS, resolver(), {"Scaling": ["Common", "Epic"]})
    assert out["Scaling"]["text"] == "Gain +{0} Armor and move {1}% faster."
    assert out["Scaling"]["values"] == {"default": ["30", "40"], "Epic": ["30", "80"]}


def test_a_rarity_whose_row_matches_the_floor_is_not_written_out():
    """Most values do not move with the rarity, so a row per rarity would be the
    same row four times in the file every reader downloads."""
    bundle = {"Scaling": {"description": "Gain +{$TooltipData.ExtractData.Flat} Armor."}}
    out = descriptions_for(["Scaling"], bundle, KEYWORDS, resolver(), {"Scaling": ["Common", "Epic"]})
    assert out["Scaling"]["values"] == {"default": ["30"]}


def test_a_slot_nobody_could_answer_keeps_the_mark_beside_one_that_could():
    bundle = {
        "Partly": {
            "description": "Gain +{$TooltipData.ExtractData.Known} Armor for"
            " {$TooltipData.ExtractData.Unknown} Sec."
        }
    }
    out = descriptions_for(["Partly"], bundle, KEYWORDS, resolver(), {"Partly": []})
    assert out["Partly"]["text"] == "Gain +{0} Armor for %s Sec." % VALUE
    assert out["Partly"]["values"] == {"default": ["30"]}


def test_a_sentence_with_nothing_to_recover_stays_a_string():
    """The bundle only grows where it gained something, so an entry that
    recovered nothing reads exactly as it did before any of this."""
    bundle = {"Partly": {"description": "Lasts {$TooltipData.ExtractData.Unknown} Sec."}}
    out = descriptions_for(["Partly"], bundle, KEYWORDS, resolver(), {"Partly": []})
    assert out["Partly"] == "Lasts %s Sec." % VALUE


def test_no_resolver_marks_every_substitution():
    bundle = {"Scaling": {"description": "Gain +{$TooltipData.ExtractData.Flat} Armor."}}
    assert descriptions_for(["Scaling"], bundle, KEYWORDS) == {"Scaling": "Gain +%s Armor." % VALUE}


SPLITTING = {
    # One rarity drives the value to zero, which is the only thing a format can
    # divide by. Every other reason a value cannot be reached is structural and
    # so holds at every rarity, which is why this is the shape that tests the
    # rule rather than a more ordinary record.
    "Splitting": {
        "RarityLevels": {"Common": {"Multiplier": 1.0}, "Epic": {"Multiplier": 4.0}},
        "Rate": {"BaseValue": 0.5, "SourceIsNegativeMultiplier": True},
        "ExtractValues": [
            {"ExtractAs": "Shown", "Format": "PercentReciprocalDelta", "Key": "Rate"}
        ],
    }
}


def test_a_slot_only_some_rarities_can_answer_keeps_the_mark_at_all_of_them():
    """A sentence reading `?` at one rarity and a number at another would look
    like the boon does nothing there, so the slot is not written out at all."""
    from resolve_values import Resolver

    bundle = {"Splitting": {"description": "Recharge {$TooltipData.ExtractData.Shown}% faster."}}
    resolver = Resolver(SPLITTING, "hades2")
    assert resolver.value("Splitting", "Common", "TooltipData.ExtractData.Shown") is not None
    assert resolver.value("Splitting", "Epic", "TooltipData.ExtractData.Shown") is None

    out = descriptions_for(
        ["Splitting"], bundle, KEYWORDS, resolver, {"Splitting": ["Common", "Epic"]}
    )
    assert out["Splitting"] == "Recharge %s%% faster." % VALUE


# ---------------------------------------------------------------------------
# Words rather than numbers, and the space a stripped glyph carried
# ---------------------------------------------------------------------------

SEPARATOR_KEYWORDS = {
    # Two titles written to sit after a number. The first opens with a glyph
    # that is dropped and the second with the Omega, which stays.
    "PomLevel": {"displayName": "{!Icons.PomLevel_NoTooltip} Lv."},
    "AttackEX": {"displayName": "{!Icons.Omega_NoTooltip} Attack"},
    "Omega": {"displayName": "{!Icons.Omega} Moves"},
}


def test_a_dropped_glyph_leaves_the_space_it_was_carrying():
    """`{!Icons.PomLevel_NoTooltip} Lv.` follows a number, so dropping the glyph
    without its separator gave "+3Lv." on five shipped sentences."""
    bundle = {"Boon": {"description": "Your Attack Boon gains +3{$Keywords.PomLevel},"
                                      " but you Prime 35 Magick."}}
    out = descriptions_for(["Boon"], bundle, SEPARATOR_KEYWORDS)
    assert out["Boon"] == "Your Attack Boon gains +3 Lv., but you Prime 35 Magick."


def test_a_glyph_that_stays_does_not_gain_a_second_space():
    """The Omega is the word rather than decoration on it, so it separates the
    two itself and adding a space as well would double it."""
    bundle = {"Boon": {"description": "Empowers your {$Keywords.AttackEX}."}}
    out = descriptions_for(["Boon"], bundle, SEPARATOR_KEYWORDS)
    assert out["Boon"] == "Empowers your Ω Attack."


NAMED = {
    "Other": {"displayName": "Ocean Swell"},
    "Boon": {"description": "Your effects from {$TraitData.Other.Name} fire twice."},
    "Missing": {"description": "You start with {$TraitData.Nowhere.Name}, a Hex."},
}


def test_a_substitution_naming_another_record_reads_its_display_name():
    """The record carries no name -- the game's text engine looks one up -- so
    a mark here reads as a hole in the sentence rather than a missing number."""
    out = descriptions_for(["Boon"], NAMED, KEYWORDS, resolver(), {"Boon": []})
    assert out["Boon"]["text"] == "Your effects from {0} fire twice."
    assert out["Boon"]["values"] == {"default": ["Ocean Swell"]}


def test_a_name_the_bundle_does_not_carry_keeps_the_mark():
    out = descriptions_for(["Missing"], NAMED, KEYWORDS, resolver(), {"Missing": []})
    assert out["Missing"] == "You start with %s, a Hex." % VALUE


RARIFY = {
    "Keepsake": {
        "RarityLevels": {"Common": {"Multiplier": 1.0}, "Rare": {"Multiplier": 2.0}},
        "Upgrade": {
            "MaxRarity": {"BaseValue": 1},
            "ReportValues": {"Reported": "MaxRarity"},
        },
        "ExtractValues": [
            {"ExtractAs": "Level", "Format": "Rarity", "Key": "Reported"}
        ],
    }
}

RARITY_WORDS = {"Common": {"displayName": "Common"},
                "Rare": {"displayName": "{#RareFormat}Rare{#Prev}"}}


def test_a_value_the_game_answers_as_markup_is_resolved_before_it_ships():
    """The Rarity format answers `{$Keywords.Rare}`, which is the game's own
    answer -- so the row carries the word, and the colour directive around it
    goes the way every other one does."""
    from resolve_values import Resolver

    bundle = {"Keepsake": {"description": "You can Rarify her {$TooltipData.ExtractData"
                                          ".Level} blessings."}}
    out = descriptions_for(["Keepsake"], bundle, RARITY_WORDS,
                           Resolver(RARIFY, "hades2"), {"Keepsake": ["Common", "Rare"]})
    assert out["Keepsake"]["text"] == "You can Rarify her {0} blessings."
    assert out["Keepsake"]["values"] == {"default": ["Common"], "Rare": ["Rare"]}
