"""Tests for the numbers a description leaves to the engine.

Everything here is a claim about what the games' own code does with a record,
so the records are written the way the games write them. The pass that matters
most is the one that refuses: a value this cannot reach has to come back as
nothing, because the alternative is a number on a card that nobody can check.
"""

import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOL / "src"))

from resolve_values import Resolver, extracted_for  # noqa: E402


LADDER = {
    "Common": {"Multiplier": 1.0},
    "Rare": {"Multiplier": 1.5},
    "Epic": {"Multiplier": 2.0},
}


def values(defs, trait_id, rarity, game="hades2"):
    _, resolved, why = extracted_for(defs, trait_id, rarity, game)
    return resolved, why


def test_a_wrapped_value_climbs_the_ladder():
    defs = {
        "Boon": {
            "RarityLevels": LADDER,
            "Damage": {"BaseValue": 20},
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Damage"}],
        }
    }
    assert str(values(defs, "Boon", "Common")[0]["Shown"]) == "20"
    assert str(values(defs, "Boon", "Rare")[0]["Shown"]) == "30"
    assert str(values(defs, "Boon", "Epic")[0]["Shown"]) == "40"


def test_a_bare_number_does_not_climb_it():
    # The authors decide what scales by wrapping it. Reading the ladder onto a
    # plain field is how a costume that grants a flat 30 Armor at every rarity
    # comes to claim 45 at Heroic.
    defs = {
        "Boon": {
            "RarityLevels": LADDER,
            "Setup": {"Amount": 30, "ReportValues": {"Reported": "Amount"}},
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Reported"}],
        }
    }
    assert str(values(defs, "Boon", "Common")[0]["Shown"]) == "30"
    assert str(values(defs, "Boon", "Epic")[0]["Shown"]) == "30"


def test_a_rarity_the_game_rolls_inside_comes_back_as_a_band():
    # Hades I gives most of its rarities a pair rather than a multiplier, so
    # there is no single number the game will show for one of them.
    defs = {
        "Boon": {
            "RarityLevels": {"Rare": {"MinMultiplier": 1.3, "MaxMultiplier": 1.5}},
            "Damage": {"BaseValue": 20},
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Damage"}],
        }
    }
    band = values(defs, "Boon", "Rare")[0]["Shown"]
    assert (band.lo, band.hi) == (26, 30)
    assert not band.exact


def test_a_value_with_its_own_range_comes_back_as_a_band():
    defs = {
        "Boon": {
            "Damage": {"BaseMin": 10, "BaseMax": 15},
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Damage"}],
        }
    }
    assert str(values(defs, "Boon", None)[0]["Shown"]) == "10-15"


def test_a_format_is_applied_over_the_whole_band():
    defs = {
        "Boon": {
            "RarityLevels": {"Rare": {"MinMultiplier": 1.0, "MaxMultiplier": 2.0}},
            "Speed": {"BaseValue": 0.6, "SourceIsMultiplier": True},
            "ExtractValues": [
                {"ExtractAs": "Shown", "Format": "NegativePercentDelta", "Key": "Speed"}
            ],
        }
    }
    # A decreasing format swaps the ends rather than reporting them backwards.
    assert str(values(defs, "Boon", "Rare")[0]["Shown"]) == "40-80"


def test_an_extracted_value_is_rounded_to_a_whole_number_by_default():
    # Every branch of the games' formatter falls through to a round at
    # DecimalPlaces, which is zero unless the entry says otherwise.
    defs = {
        "Boon": {
            "Regen": {"BaseValue": 6},
            "RarityLevels": {"Epic": {"Multiplier": 1.67}},
            "ExtractValues": [
                {"ExtractAs": "Whole", "Key": "Regen"},
                {"ExtractAs": "Fine", "DecimalPlaces": 2, "Key": "Regen"},
            ],
        }
    }
    resolved = values(defs, "Boon", "Epic")[0]
    assert str(resolved["Whole"]) == "10"
    assert str(resolved["Fine"]) == "10.02"


def test_a_value_read_from_outside_the_record_is_refused():
    defs = {
        "Boon": {
            "ExtractValues": [
                {
                    "ExtractAs": "Shown",
                    "External": True,
                    "BaseType": "EffectData",
                    "BaseName": "WeakEffect",
                    "BaseProperty": "Duration",
                }
            ]
        }
    }
    resolved, why = values(defs, "Boon", None)
    assert "Shown" not in resolved
    assert why["Shown"].startswith("external")


def test_a_later_entry_that_cannot_resolve_drops_the_earlier_one():
    # The game overwrites by name, so an earlier value is not this name's
    # answer once a later entry claims it -- keeping it prints the number the
    # game replaced.
    defs = {
        "Boon": {
            "Duration": 5,
            "ExtractValues": [
                {"ExtractAs": "Shown", "Key": "Duration"},
                {
                    "ExtractAs": "Shown",
                    "External": True,
                    "BaseType": "EffectData",
                    "BaseName": "ClearCast",
                    "BaseProperty": "Duration",
                },
            ],
        }
    }
    resolved, why = values(defs, "Boon", None)
    assert "Shown" not in resolved
    assert why["Shown"].startswith("external")


def test_a_nested_value_is_reported_up_to_the_top_of_the_record():
    defs = {
        "Boon": {
            "Setup": {
                "Args": {
                    "Charge": {"BaseValue": 2},
                    "ReportValues": {"Reported": "Charge"},
                }
            },
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Reported"}],
        }
    }
    assert str(values(defs, "Boon", None)[0]["Shown"]) == "2"


def test_a_field_the_record_inherits_is_read():
    defs = {
        "Base": {"Damage": {"BaseValue": 12}},
        "Boon": {
            "InheritFrom": ["Base"],
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Damage"}],
        },
    }
    assert str(values(defs, "Boon", None)[0]["Shown"]) == "12"


def test_a_base_written_as_a_string_is_read_as_a_number():
    # Lua coerces it in the arithmetic, and three shipped records rely on that.
    defs = {
        "Boon": {
            "RarityLevels": {"Legendary": {"Multiplier": 2}},
            "PropertyChanges": [
                {
                    "BaseValue": "300",
                    "ReportValues": {"Reported": "ChangeValue"},
                }
            ],
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Reported"}],
        }
    }
    assert str(values(defs, "Boon", "Legendary")[0]["Shown"]) == "600"


def test_hades_one_reads_an_entry_from_the_table_it_sits_in():
    # There is no report step in Hades I: an entry reads its own table and the
    # result merges back over the record, so a bare name finds it.
    defs = {
        "Boon": {
            "PropertyChanges": [
                {
                    "BaseMin": 70,
                    "BaseMax": 70,
                    "ExtractValue": {"ExtractAs": "TooltipDamage"},
                }
            ],
        }
    }
    resolver = Resolver(defs, "hades1")
    assert resolver.value("Boon", None, "TooltipData.TooltipDamage") == "70"


def test_a_percent_suffix_is_the_engines_sign_rather_than_the_values():
    defs = {
        "Boon": {
            "Chance": {"BaseValue": 0.1},
            "ExtractValues": [
                {"ExtractAs": "Shown", "Format": "Percent", "Key": "Chance"}
            ],
        }
    }
    resolver = Resolver(defs, "hades2")
    assert resolver.value("Boon", None, "TooltipData.ExtractData.Shown") == "10"
    assert resolver.value("Boon", None, "TooltipData.ExtractData.Shown:P") == "10%"


def test_a_path_into_another_records_table_is_followed():
    defs = {
        "Other": {"DamagePercent": 200},
        "Boon": {},
    }
    resolver = Resolver(defs, "hades2")
    assert resolver.value("Boon", None, "TraitData.Other.DamagePercent") == "200"


def test_a_path_indexes_a_list_from_one():
    defs = {
        "Other": {"Changes": [{"Count": 3}, {"Count": 7}]},
        "Boon": {},
    }
    resolver = Resolver(defs, "hades2")
    assert resolver.value("Boon", None, "TraitData.Other.Changes.[2].Count") == "7"
    assert resolver.value("Boon", None, "TraitData.Other.Changes.2.Count") == "7"


def test_a_spec_naming_nothing_answers_nothing():
    resolver = Resolver({"Boon": {}}, "hades2")
    assert resolver.value("Boon", None, "TooltipData.ExtractData.Missing") is None
    assert resolver.value("Boon", None, "GameState.CauseOfDeathDisplay") is None


def test_a_ramped_value_is_rounded_before_a_dotted_path_reads_it():
    # Both games round every ramped value to two places on the way out, before
    # anything reads it. An extract entry rounds again on its own tail, so the
    # only reading that shows this one is a path straight into the record --
    # and one shipped value moves without it: a Chaos blessing reads 25-37
    # rather than 25-38.
    defs = {
        "Boon": {
            "RarityLevels": {"Rare": {"Multiplier": 1.0}},
            "Speed": {"BaseMin": 0.3333, "BaseMax": 0.6667},
        }
    }
    resolver = Resolver(defs, "hades2")
    assert resolver.value("Boon", "Rare", "TooltipData.Speed") == "0.33-0.67"


def test_a_format_that_reads_the_run_is_refused():
    # The list of them is the guard, and it is the only guard once a format is
    # answerable at all: `Rarity` sat on this list for being run-dependent and
    # is not, so what is left here has to be checked rather than assumed.
    defs = {
        "Boon": {
            "Taken": 4,
            "ExtractValues": [
                {"ExtractAs": "Shown", "Format": "TotalDamageTaken", "Key": "Taken"}
            ],
        }
    }
    resolved, why = values(defs, "Boon", None)
    assert "Shown" not in resolved
    assert why["Shown"] == "run-format:TotalDamageTaken"


def test_a_child_field_wins_over_the_one_it_would_inherit():
    # Child-first is what the games' own loader does, and it decides 221 of the
    # shipped values -- a parent's damage standing in for a child's is a number
    # that looks entirely reasonable.
    defs = {
        "Base": {"Damage": {"BaseValue": 12}},
        "Boon": {
            "InheritFrom": ["Base"],
            "Damage": {"BaseValue": 30},
            "ExtractValues": [{"ExtractAs": "Shown", "Key": "Damage"}],
        },
    }
    assert str(values(defs, "Boon", None)[0]["Shown"]) == "30"


def test_a_stat_line_counts_only_the_entries_the_tooltip_lists():
    # StatDisplayN is the Nth line the tooltip draws automatically, so an entry
    # marked SkipAutoExtract is not one of them and must not be counted.
    defs = {
        "Boon": {
            "Hidden": 5,
            "Listed": 9,
            "ExtractValues": [
                {"ExtractAs": "First", "Key": "Hidden", "SkipAutoExtract": True},
                {"ExtractAs": "Second", "Key": "Listed"},
            ],
        }
    }
    resolver = Resolver(defs, "hades2")
    assert resolver.value("Boon", None, "TooltipData.StatDisplay1") == "9"


# ---------------------------------------------------------------------------
# The one format that answers a word
# ---------------------------------------------------------------------------

# The shape the Rarify keepsakes use, and a demonstration of the wrapped/bare
# rule in one record: the rarity index is on the ladder and the use count is
# not, so the keepsake reaches Rare while still granting one use.
RARIFY = {
    "Keepsake": {
        "RarityLevels": {"Common": {"Multiplier": 1.0}, "Rare": {"Multiplier": 2.0}},
        "Upgrade": {
            "MaxRarity": {"BaseValue": 1},
            "Uses": 1,
            "ReportValues": {"Reported": "MaxRarity", "ReportedUses": "Uses"},
        },
        "ExtractValues": [
            {"ExtractAs": "Level", "Format": "Rarity", "Key": "Reported"},
            {"ExtractAs": "Uses", "Key": "ReportedUses"},
        ],
    }
}


def test_the_rarity_format_answers_the_keyword_the_game_answers():
    # `GetRarityKey` indexes a table of rarity names, which is record data and
    # not the run -- and the game hands back the keyword reference rather than
    # the word, leaving its text engine to resolve it. So does this.
    resolver = Resolver(RARIFY, "hades2")
    assert resolver.value("Keepsake", "Common", "TooltipData.ExtractData.Level") == \
        "{$Keywords.Common}"
    assert resolver.value("Keepsake", "Rare", "TooltipData.ExtractData.Level") == \
        "{$Keywords.Rare}"
    # And the use count beside it stays where it was written.
    assert resolver.value("Keepsake", "Rare", "TooltipData.ExtractData.Uses") == "1"


def test_a_rarity_index_past_the_ladder_answers_nothing():
    defs = {
        "Keepsake": {
            "Reported": 9,
            "ExtractValues": [
                {"ExtractAs": "Level", "Format": "Rarity", "Key": "Reported"}
            ],
        }
    }
    resolved, why = values(defs, "Keepsake", None)
    assert "Level" not in resolved
    assert why["Level"] == "rarity-index:9"


def test_a_rarity_the_game_rolls_between_answers_nothing():
    """Two rarities is two different words, and there is no band of a word."""
    defs = {
        "Keepsake": {
            "RarityLevels": {"Rare": {"MinMultiplier": 1.0, "MaxMultiplier": 2.0}},
            "Reported": {"BaseValue": 1},
            "ExtractValues": [
                {"ExtractAs": "Level", "Format": "Rarity", "Key": "Reported"}
            ],
        }
    }
    resolved, why = values(defs, "Keepsake", "Rare")
    assert "Level" not in resolved
    assert why["Level"] == "rarity-band"


# --- a spell's Magick cost --------------------------------------------------
# The game's branch forks on whether it is drawing a boon-info panel. That arm
# reads the weapon table and the record; the other sums modifiers over the
# traits a run holds, which is why the pair was filed as run-dependent.

HEX = {
    "SpellLaserTrait": {
        "ExtractValues": [
            {"ExtractAs": "ManaCost", "Format": "ManaSpendCost",
             "WeaponName": "WeaponSpellLaser"}
        ]
    },
    "Aspect": {
        "RarityLevels": {"Common": {"Multiplier": 0}, "Rare": {"Multiplier": 1}},
        "ManaSpendCostModifiers": {"Add": {"BaseValue": -10}},
    },
}

WEAPONS = {
    "WeaponSpellLaser": {"ManaSpendCost": 30},
    "WeaponSpellMoonBeam": {"ManaSpendCost": 100,
                            "LinkedTraitManaSpendAdjustment": "Aspect"},
}


def _cost(defs, trait_id, weapons=WEAPONS, rarity=None):
    _, resolved, why = extracted_for(defs, trait_id, rarity, "hades2", weapons)
    return resolved, why


def test_a_spell_cost_is_read_off_the_weapon_rather_than_the_run():
    resolved, _ = _cost(HEX, "SpellLaserTrait")
    assert str(resolved["ManaCost"]) == "30"


def test_the_linked_aspect_adjustment_is_computed_rather_than_assumed_zero():
    """It is zero on the shipped data -- the only aspect declaring one
    multiplies it by its un-upgraded rank, which is 0 -- but that is a number in
    the game's data rather than a property of the mechanic."""
    defs = dict(HEX)
    defs["Beam"] = {"ExtractValues": [
        {"ExtractAs": "ManaCost", "Format": "ManaSpendCost",
         "WeaponName": "WeaponSpellMoonBeam"}
    ]}
    assert str(_cost(defs, "Beam")[0]["ManaCost"]) == "100"

    # Move the un-upgraded rank's multiplier and the adjustment lands.
    moved = dict(defs)
    moved["Aspect"] = dict(defs["Aspect"],
                           RarityLevels={"Common": {"Multiplier": 1}})
    assert str(_cost(moved, "Beam")[0]["ManaCost"]) == "90"


def test_an_aspect_adds_its_own_reported_adjustment_to_the_weapon_base():
    defs = {"Aspect": {
        "ManaSpendCostModifiers": {"Add": {"BaseValue": -10},
                                   "ReportValues": {"Reported": "Add"}},
        "ExtractValues": [
            {"ExtractAs": "ManaCost", "Format": "AdjustedBaseManaSpendCost",
             "Key": "Reported", "WeaponName": "WeaponSpellMoonBeam"}
        ],
    }}
    assert str(_cost(defs, "Aspect")[0]["ManaCost"]) == "90"


def test_a_cost_with_no_weapon_table_stays_external_rather_than_guessing():
    """An older raw dump has no weapon table, and the Hexes stay marked."""
    resolved, why = _cost(HEX, "SpellLaserTrait", weapons={})
    assert "ManaCost" not in resolved
    assert why["ManaCost"] == "external:WeaponData"
