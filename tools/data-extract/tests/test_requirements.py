"""Tests for the clause classifier.

The classifier is where a wrong reading of the game's data turns into a wrong
catalog, and nothing downstream can see it happen (the app believes whatever the
catalog says, and the golden snapshot only proves the output hasn't changed,
never that it was yk correct to begin with/in the first place). These tests
cover the two things the snapshot can't: that a recognised clause becomes the
gate it means, and that an unrecognised one refuses instead of erm disappearing.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import requirements  # noqa: E402


KEEPSAKES = {"ForceApolloBoonKeepsake", "SomeOtherKeepsake"}


def classify(clause):
    return requirements.classify_h2(clause, KEEPSAKES)


# ---------------------------------------------------------------------------
# Building requirement trees
# ---------------------------------------------------------------------------

def test_a_single_part_needs_no_wrapper():
    assert requirements.all_of([requirements.has_trait("A")]) == {"kind": "hasTrait", "trait": "A"}
    assert requirements.any_of([requirements.has_trait("A")]) == {"kind": "hasTrait", "trait": "A"}


def test_no_parts_is_no_gate():
    assert requirements.all_of([]) is None
    assert requirements.any_of([]) is None


def test_nested_alls_are_flattened():
    inner = requirements.all_of([requirements.has_trait("A"), requirements.has_trait("B")])
    assert requirements.all_of([inner, requirements.has_trait("C")]) == {
        "kind": "all",
        "of": [{"kind": "hasTrait", "trait": "A"},
               {"kind": "hasTrait", "trait": "B"},
               {"kind": "hasTrait", "trait": "C"}],
    }


def test_identical_siblings_are_stated_once():
    """Merging a record's two halves regularly produces the same demand twice."""
    assert requirements.all_of([requirements.has_trait("A"), requirements.has_trait("A")]) == {
        "kind": "hasTrait", "trait": "A",
    }


def test_an_anyOf_keeps_its_min_even_with_one_branch():
    assert requirements.any_of([requirements.has_trait("A")], minimum=2) == {
        "kind": "anyOf", "min": 2, "of": [{"kind": "hasTrait", "trait": "A"}],
    }


# ---------------------------------------------------------------------------
# Hades II clauses
# ---------------------------------------------------------------------------

def test_one_of_becomes_a_disjunction():
    out = classify({"OneOf": ["A", "B"]})
    assert out.requirement() == {
        "kind": "anyOf", "min": 1,
        "of": [{"kind": "hasTrait", "trait": "A"}, {"kind": "hasTrait", "trait": "B"}],
    }


def test_one_from_each_set_becomes_a_conjunction_of_disjunctions():
    out = classify({"OneFromEachSet": [["A", "B"], ["C"]]})
    assert out.requirement() == {
        "kind": "all",
        "of": [
            {"kind": "anyOf", "min": 1,
             "of": [{"kind": "hasTrait", "trait": "A"}, {"kind": "hasTrait", "trait": "B"}]},
            {"kind": "hasTrait", "trait": "C"},
        ],
    }


def test_a_met_god_is_a_boon_of_that_god_and_loses_the_table_suffix():
    """The path names the god's loot table, while every god record is keyed on
    the bare name. A god id that does not exist fails silently everywhere
    downstream, since the member lookup just answers with an empty list."""
    out = classify({"PathTrue": ["CurrentRun", "Hero", "MetGods", "ApolloUpgrade"]})
    assert out.requirement() == {"kind": "hasBoonFrom", "god": "Apollo"}


def test_a_named_trait_that_is_a_keepsake_becomes_a_keepsake_atom():
    out = classify({"PathTrue": ["CurrentRun", "Hero", "TraitDictionary", "ForceApolloBoonKeepsake"]})
    assert out.requirement() == {"kind": "hasKeepsake", "keepsake": "ForceApolloBoonKeepsake"}


def test_a_named_trait_that_is_not_a_keepsake_becomes_a_trait_atom():
    out = classify({"PathTrue": ["CurrentRun", "Hero", "TraitDictionary", "ApolloExCastBoon"]})
    assert out.requirement() == {"kind": "hasTrait", "trait": "ApolloExCastBoon"}


def test_alternatives_become_one_anyOf():
    out = classify({
        "NamedRequirements": ["SeleneDuosUnlocked"],
        "OrRequirements": [
            [{"PathTrue": ["CurrentRun", "Hero", "MetGods", "ApolloUpgrade"]}],
            [{"PathTrue": ["CurrentRun", "Hero", "TraitDictionary", "ForceApolloBoonKeepsake"]}],
        ],
    })
    assert out.requirement() == {
        "kind": "anyOf", "min": 1,
        "of": [{"kind": "hasBoonFrom", "god": "Apollo"},
               {"kind": "hasKeepsake", "keepsake": "ForceApolloBoonKeepsake"}],
    }
    assert not out.unclassified
    # The sibling key is dropped and recorded, not skipped. Every record with an
    # alternation has one, so returning early hid nine of these o_0.
    assert [d["reason"] for d in out.discarded] == [
        "a save-file unlock, which is assumed granted"]


def test_a_key_beside_an_alternation_still_has_to_classify():
    """The bottom of the classifier is what makes the table closed. An early
    return would exempt any clause carrying an alternation from it, so the same
    key would stop the run alone and vanish here."""
    alone = classify({"SomeNewGateKey": ["A"]})
    beside = classify({
        "SomeNewGateKey": ["A"],
        "OrRequirements": [[{"PathTrue": ["CurrentRun", "Hero", "MetGods", "HeraUpgrade"]}]],
    })
    assert alone.unclassified and beside.unclassified
    assert beside.requirement() == {"kind": "hasBoonFrom", "god": "Hera"}


def test_a_named_requirement_is_read_by_value_not_dropped_by_key():
    """Which name it is decides whether it constrains a build: a save-file
    unlock is assumed granted, while a run's death defiances move during the
    run. One blanket reason covered both and would cover a third that is
    neither."""
    unlock = classify({"NamedRequirements": ["SeleneDuosUnlocked"]})
    transient = classify({"NamedRequirements": ["MissingLastStand"]})
    assert [d["reason"] for d in unlock.discarded] == [
        "a save-file unlock, which is assumed granted"]
    assert [d["reason"] for d in transient.discarded] == [
        "the run's death defiances, which it can regain"]
    assert not unlock.unclassified and not transient.unclassified


def test_a_named_requirement_nobody_has_classified_refuses():
    out = classify({"NamedRequirements": ["SomethingBrandNew"]})
    assert out.unclassified
    assert out.unclassified[0]["reason"] == "a named requirement nobody has classified"


def test_an_element_threshold_becomes_an_element_atom():
    out = classify({"Path": ["CurrentRun", "Hero", "Elements", "Fire"], "Comparison": ">=", "Value": 2})
    assert out.requirement() == {"kind": "hasElement", "element": "Fire", "count": 2}


def test_a_threshold_that_is_not_a_lower_bound_refuses():
    out = classify({"Path": ["CurrentRun", "Hero", "Elements", "Fire"], "Comparison": "<=", "Value": 2})
    assert out.unclassified


def test_the_highest_element_count_desugars_over_the_base_elements():
    """"the largest single element is at least N" is "some element is at least
    N", and the field counts base elements, so Aether is not one of them."""
    out = classify({"Path": ["CurrentRun", "Hero", "HighestBaseElementCount"],
                    "Comparison": ">=", "Value": 4})
    assert out.requirement() == {
        "kind": "anyOf", "min": 1,
        "of": [{"kind": "hasElement", "element": e, "count": 4}
               for e in ("Air", "Water", "Earth", "Fire")],
    }


def test_holding_none_of_a_list_is_a_negation_not_a_requirement():
    out = classify({"HasNone": ["A", "B"], "Path": ["CurrentRun", "Hero", "TraitDictionary"]})
    assert out.negations == ["A", "B"]
    assert out.requirement() is None


def test_the_same_primitive_against_the_room_is_not_a_trait_reference():
    """`HasNone` means whatever its path means, and against the current room it
    names reward flags rather than traits."""
    out = classify({"HasNone": ["BlockGiftBoons"], "Path": ["CurrentRun", "CurrentRoom"]})
    assert out.negations == []
    assert out.discarded and not out.unclassified


def test_a_rarity_count_is_dropped_because_a_run_can_always_change_it():
    out = classify({"Path": ["CurrentRun", "Hero", "GodBoonRarities", "Common"],
                    "Comparison": "<=", "Value": 0})
    assert out.requirement() is None
    assert out.discarded and not out.unclassified


def test_a_weapon_gate_is_dropped():
    out = classify({"HasAll": ["WeaponAxe"], "Path": ["CurrentRun", "Hero", "Weapons"]})
    assert out.requirement() is None
    assert out.discarded and not out.unclassified


def test_an_unrecognised_path_refuses_rather_than_vanishing():
    out = classify({"HasNone": ["A"], "Path": ["CurrentRun", "Hero", "EquippedRelic"]})
    assert out.unclassified
    assert out.requirement() is None


def test_an_unrecognised_key_refuses():
    out = classify({"SomeNewGateKey": ["A"]})
    assert out.unclassified


def test_a_clause_whose_members_never_resolved_refuses():
    """A member list that came back as a dumper placeholder has lost its whole
    clause. Normalizing it away would take the evidence with it and leave a
    record that reads as ungated."""
    out = classify({"OneOf": "<unresolved:G.LootData.Something>"})
    assert out.unclassified
    assert out.unclassified[0]["reason"] == requirements.UNRESOLVED_REASON


def test_an_array_entry_of_a_mixed_table_is_read_as_a_nested_clause():
    """A Lua table with both an array part and named keys dumps the array
    entries under their numeric index."""
    out = classify({"1": {"PathTrue": ["CurrentRun", "Hero", "MetGods", "HeraUpgrade"]},
                    "NamedRequirements": ["MissingLastStand"]})
    assert out.requirement() == {"kind": "hasBoonFrom", "god": "Hera"}
    assert not out.unclassified


def test_an_inline_table_is_read_as_well_as_a_list_of_clauses():
    """A dozen records write their gate as a bare table rather than a list of
    them, and reading only the list form dropped every one."""
    listed = classify([{"OneOf": ["A"]}])
    bare = classify({"OneOf": ["A"]})
    assert listed.requirement() == bare.requirement() == {"kind": "hasTrait", "trait": "A"}


# ---------------------------------------------------------------------------
# Hades I clauses
# ---------------------------------------------------------------------------

SLOTS = {"Shout": ["AresShoutTrait", "ZeusShoutTrait"]}


def classify_h1(data):
    out = requirements.Classified()
    requirements.classify_h1_inline(data, out, SLOTS)
    return out


def test_a_required_trait_becomes_a_trait_atom():
    assert classify_h1({"RequiredTrait": "A"}).requirement() == {"kind": "hasTrait", "trait": "A"}


def test_required_one_of_becomes_a_disjunction():
    assert classify_h1({"RequiredOneOfTraits": ["A", "B"]}).requirement() == {
        "kind": "anyOf", "min": 1,
        "of": [{"kind": "hasTrait", "trait": "A"}, {"kind": "hasTrait", "trait": "B"}],
    }


def test_a_slot_gate_expands_into_what_can_fill_the_slot():
    """The clause names a slot rather than a trait, and there is no atom for
    "anything in slot X". So it becomes the disjunction it means, built from the
    slot's own members rather than from a list somebody maintains."""
    assert classify_h1({"RequiredSlottedTrait": "Shout"}).requirement() == {
        "kind": "anyOf", "min": 1,
        "of": [{"kind": "hasTrait", "trait": "AresShoutTrait"},
               {"kind": "hasTrait", "trait": "ZeusShoutTrait"}],
    }


def test_a_slot_gate_with_nothing_to_expand_into_refuses():
    assert classify_h1({"RequiredSlottedTrait": "NoSuchSlot"}).unclassified


def test_a_mirror_selection_becomes_a_talent_atom():
    """Which talent is selected is fixed before the run and cannot change
    during it. Which talents are unlocked is a different fact and out of
    scope."""
    assert classify_h1({"RequiredMetaUpgradeSelected": "AmmoMetaUpgrade"}).requirement() == {
        "kind": "hasTalent", "talent": "AmmoMetaUpgrade",
    }


def test_required_false_traits_are_negations_in_both_spellings():
    assert classify_h1({"RequiredFalseTrait": "A"}).negations == ["A"]
    assert classify_h1({"RequiredFalseTraits": ["A", "B"]}).negations == ["A", "B"]


def test_a_weapon_gate_is_dropped_in_hades_one_too():
    out = classify_h1({"RequiredWeapon": "SwordWeapon"})
    assert out.requirement() is None
    assert out.discarded and not out.unclassified


def test_clauses_on_one_record_are_all_required_together():
    out = classify_h1({"RequiredTrait": "A", "RequiredMetaUpgradeSelected": "T"})
    assert out.requirement() == {
        "kind": "all",
        "of": [{"kind": "hasTrait", "trait": "A"}, {"kind": "hasTalent", "talent": "T"}],
    }


# ---------------------------------------------------------------------------
# What a negation turns out to be
# ---------------------------------------------------------------------------

def resolve(declared, **kw):
    return requirements.resolve_negations(
        declared,
        removable=kw.get("removable", set()),
        is_out_of_scope=kw.get("is_out_of_scope", lambda t: False),
        is_aspect=kw.get("is_aspect", lambda t: False),
    )


def test_naming_yourself_is_a_no_duplicate_gate_not_an_exclusion():
    groups, blocked, aspects, dropped, self_gates = resolve({"A": ["A"]})
    assert (groups, blocked, aspects, dropped) == ({}, {}, {}, [])
    assert self_gates == ["A"]


def test_naming_each_other_is_a_mutual_exclusion():
    groups, blocked, _, _, _ = resolve({"A": ["B"], "B": ["A"]})
    assert groups == {"A": ["A", "B"], "B": ["A", "B"]}
    assert blocked == {}


def test_a_one_directional_block_is_not_recorded_as_mutual():
    """Order matters: taking the blocked trait first leaves both held, which a
    mutual exclusion would deny."""
    groups, blocked, _, _, _ = resolve({"A": ["B"]})
    assert groups == {}
    assert blocked == {"A": ["B"]}


def test_a_blocker_the_run_can_shed_is_dropped():
    """Reporting it would tell a player their build is impossible because of a
    keepsake they can swap out next region."""
    groups, blocked, _, dropped, _ = resolve({"A": ["B"]}, removable={"B"})
    assert blocked == {}
    assert dropped and dropped[0]["blocker"] == "B"


def test_out_of_scope_content_is_dropped_whichever_way_the_edge_runs():
    """Testing symmetry first would let the same content back in through the
    exclusive-group half."""
    groups, blocked, _, dropped, _ = resolve(
        {"A": ["B"], "B": ["A"]}, is_out_of_scope=lambda t: t == "B")
    assert dropped
    assert groups == {} and blocked == {}


def test_a_removable_member_stops_a_pair_becoming_a_mutual_exclusion():
    """A group claims at most one is ever held, which is false when one of them
    can be shed: swap the keepsake and take the other. The tripwire for this
    reads only the one-directional field, so a group would carry the false
    Impossible past every check there is."""
    groups, blocked, _, dropped, _ = resolve({"A": ["B"], "B": ["A"]}, removable={"B"})
    assert groups == {}
    # The two directions stop agreeing, which is the finding instead of like a
    # loss since holding A really does rule out B for the rest of the run, while
    # holding B rules out nothing once it's swapped away :starry_eyed: :starry_eyed:.
    assert blocked == {"B": ["A"]}
    assert [(d["holder"], d["blocker"]) for d in dropped] == [("A", "B")]


def test_a_weapon_form_is_not_a_blocker_it_is_its_own_conflict():
    """An aspect is equipped rather than picked up, so a block naming one would
    hunt for it among the held traits and never find it there, leaving the
    constraint real and permanently inert."""
    groups, blocked, aspects, _, _ = resolve({"A": ["B"]}, is_aspect=lambda t: t == "B")
    assert blocked == {} and groups == {}
    assert aspects == {"A": ["B"]}


def test_a_weapon_form_is_kept_out_of_a_mutual_exclusion_too():
    """Decided before symmetry, and this is the case that forces it: without it
    the reverse edge pairs back up and produces a group naming the aspect, which
    is the same category error the routing exists to prevent."""
    groups, blocked, aspects, dropped, _ = resolve(
        {"A": ["B"], "B": ["A"]}, is_aspect=lambda t: t == "B")
    assert groups == {} and blocked == {}
    assert aspects == {"A": ["B"]}
    assert [d["reason"] for d in dropped] == ["a weapon form, which is chosen before anything is held"]


def test_two_weapon_forms_are_not_a_conflict_with_each_other():
    """A run has exactly one aspect, so an edge between two says nothing the
    model does not already know."""
    _, blocked, aspects, dropped, _ = resolve({"A": ["B"]}, is_aspect=lambda t: True)
    assert aspects == {} and blocked == {}
    assert dropped and "a run has one" in dropped[0]["reason"]


# ---------------------------------------------------------------------------
# Ladder depth
# ---------------------------------------------------------------------------

def test_depth_counts_only_prerequisites_of_the_same_god():
    """A boon needing another god's boon is not one rung higher, it is off the
    ladder that god's page draws."""
    prereqs = {
        "Root": None,
        "Second": requirements.has_trait("Root"),
        "CrossGod": requirements.has_trait("Other"),
    }
    gods = {"Root": "A", "Second": "A", "CrossGod": "A", "Other": "B"}
    depths, cycles = requirements.compute_tiers(prereqs, gods, set(prereqs))
    assert depths == {"Root": 1, "Second": 2, "CrossGod": 1}
    assert cycles == []


def test_needing_everything_costs_the_dearest_of_them():
    prereqs = {
        "Root": None, "Mid": requirements.has_trait("Root"),
        "Top": requirements.all_of([requirements.has_trait("Root"), requirements.has_trait("Mid")]),
    }
    gods = dict.fromkeys(prereqs, "A")
    depths, _ = requirements.compute_tiers(prereqs, gods, set(prereqs))
    assert depths["Top"] == 3


def test_needing_any_one_costs_the_cheapest_of_them():
    """A rung means "reaching this needs a boon of the rung below". Measuring a
    disjunction by its deepest branch would claim a prerequisite the boon does
    not have, and draw it several rows below where it becomes available."""
    prereqs = {
        "Shallow": None,
        "Mid": requirements.has_trait("Shallow"),
        "Deep": requirements.has_trait("Mid"),
        "Top": requirements.any_of([requirements.has_trait("Shallow"),
                                    requirements.has_trait("Mid"),
                                    requirements.has_trait("Deep")]),
    }
    gods = dict.fromkeys(prereqs, "A")
    depths, _ = requirements.compute_tiers(prereqs, gods, set(prereqs))
    assert (depths["Shallow"], depths["Deep"]) == (1, 3)
    assert depths["Top"] == 2


def test_needing_several_of_them_costs_the_last_of_the_cheapest_few():
    prereqs = {
        "A1": None, "B2": requirements.has_trait("A1"), "C3": requirements.has_trait("B2"),
        "Top": requirements.any_of([requirements.has_trait("A1"),
                                    requirements.has_trait("B2"),
                                    requirements.has_trait("C3")], minimum=2),
    }
    gods = dict.fromkeys(prereqs, "A")
    depths, _ = requirements.compute_tiers(prereqs, gods, set(prereqs))
    assert depths["Top"] == 3


def test_a_branch_another_god_can_satisfy_costs_this_ladder_nothing():
    """"hold a Cast from anyone" is not a rung of any one god's ladder."""
    prereqs = {
        "Mine": None,
        "Theirs": None,
        "Top": requirements.any_of([requirements.has_trait("Mine"),
                                    requirements.has_trait("Theirs")]),
    }
    gods = {"Mine": "A", "Theirs": "B", "Top": "A"}
    depths, _ = requirements.compute_tiers(prereqs, gods, {"Mine", "Top"})
    assert depths["Top"] == 1


def test_any_boon_of_this_god_is_the_first_rung():
    prereqs = {"Top": requirements.has_boon_from("A")}
    depths, _ = requirements.compute_tiers(prereqs, {"Top": "A"}, {"Top"})
    assert depths["Top"] == 2


def test_a_cycle_is_reported_rather_than_resolved():
    prereqs = {"A": requirements.has_trait("B"), "B": requirements.has_trait("A")}
    gods = dict.fromkeys(prereqs, "G")
    _, cycles = requirements.compute_tiers(prereqs, gods, set(prereqs))
    assert cycles
