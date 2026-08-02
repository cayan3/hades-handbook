"""Everything that must be true of an extraction before it is allowed to ship.

This runs at the end of an extraction, which is the only moment that can
refuse. Nothing downstream can audit this output: the app reads whatever the
catalog says, and the drift check compares this code's output against this
code's previous output, so a defect that is *stable* reproduces perfectly. The
checks here are the last place a wrong catalog can be caught.

Two kinds of finding live side by side and the difference matters:

  * **advisory** -- a description of the catalog that a human reads and judges.
    Which rarities nobody uses, which boons no source file offers, which clause
    keys nothing consumes. These do not fail the run, because the right answer
    is often "yes, that's correct".
  * **fatal** -- a statement that some field holds a value that is not data, or
    that some invariant the app relies on is broken. A clause nobody
    classified, a requirement that asks for more branches than it has, a god
    nobody has heard of, an unresolved dumper placeholder. These exit non-zero,
    so a run that produced one cannot be mistaken for a clean run.

Splitting them that way is what lets the fatal list stay short enough to read.
"""

import glob, json, os, re

import requirements
from config import out_dir, raw_dir, scripts_dir

UNRESOLVED_PREFIX = "<unresolved:"

# Records already known to ship an unresolved sentinel, exempted from the leak
# check so that a genuinely new one is not lost in the noise of an old one.
# Both are Chaos boons whose prereq reaches `G.LootData.TrialUpgrade
# .PermanentTraits`: Hades II keeps its loot tables in LootSetData, so the
# global LootData that TraitData.lua reaches for is never populated and the
# reference falls through to the dumper's proxy. The data is present in the
# LootSetData dump, so this is a load-order defect and not a gap in the game's
# own files. It is recorded rather than repaired because Chaos boons are out of
# scope for the first release; anything appearing here that is NOT on this list
# is a new leak and fails the run.
UNRESOLVED_SENTINEL_KNOWN = {
    "ChaosLastStandBlessing",
    "ChaosMetaUpgradeCurse",
}

# Gods who appear as a boon's attributed god but own no <God>Upgrade loot table
# and therefore get no record in gods.json -- the other game's Olympians making
# a cameo appearance. A name outside the union of these and the emitted god
# records is not an attribution, it is a parse accident.
CAMEO_GOD_NAMES = {"Artemis", "Athena", "Dionysus", "Hades"}

# Two Hades I records name the wrong god in the game's own files: both are
# Demeter's and both declare Zeus, almost certainly cloned from Electric Shot
# and never corrected. The extraction is faithful and the overlay carries the
# correction, so they are exempted here rather than repaired -- what the rule
# is for is the *third* one, which nobody would otherwise notice.
GOD_DISAGREES_WITH_LOOT_TABLE_KNOWN = {
    "DemeterRangedTrait",
    "ShieldLoadAmmo_DemeterRangedTrait",
}

# Hades I grants exactly one trait through another trait's SetupFunction, and
# the granting trait is a keepsake -- so the block it declares can be undone by
# swapping keepsakes and must not be reported as permanent. The edge is dropped
# during normalization; this list is what makes a second one visible instead of
# silently joining it.
REMOVABLE_BLOCKER_KNOWN = {
    "HadesShoutTrait",
}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def find_unresolved(node, _path=""):
    """Yield (dotted path, value) for every string anywhere in an emitted
    record that is still a dumper placeholder. Walks the whole tree rather
    than checking named fields, because the fields worth protecting are the
    ones nobody thought to guard."""
    if isinstance(node, str):
        if node.startswith(UNRESOLVED_PREFIX):
            yield _path or "(root)", node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from find_unresolved(v, "%s.%s" % (_path, k) if _path else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from find_unresolved(v, "%s[%d]" % (_path, i))


def inherit_chain(defs, trait_id, _visited=None, _depth=0):
    if _depth > 8 or trait_id in (_visited or set()):
        return []
    _visited = set(_visited or set())
    _visited.add(trait_id)
    data = defs.get(trait_id)
    if not isinstance(data, dict):
        return []
    parents = [p for p in data.get("InheritFrom") or [] if isinstance(p, str)]
    chain = list(parents)
    for p in parents:
        chain.extend(inherit_chain(defs, p, _visited, _depth + 1))
    return chain


def validate_game(game_key, boons, gods, keepsakes, clause_report=None,
                  raw_defs=None, loot_membership=None, external_references=None):
    """Check one game's emitted catalog. Returns (report, fatal messages).

    The four trailing arguments are the inputs a check needs that the emitted
    catalog does not carry. Each is optional, and the checks that need it are
    skipped when it is absent -- the fixtures do not have a whole game's
    scripts to scan, and a check that cannot run is different from one that
    passed.
    """
    all_ids = set(boons.keys()) | set(keepsakes.keys())
    report = {
        "totalBoonRecords": len(boons),
        "totalKeepsakeRecords": len(keepsakes),
        "totalGodRecords": len(gods),
        "boonsWithNoDescriptionRef": sorted(bid for bid, b in boons.items() if b.get("descriptionRef") is None),
        "boonsWithNoName": sorted(bid for bid, b in boons.items() if b.get("name") is None),
    }
    report["boonsWithNoDescriptionRefCount"] = len(report["boonsWithNoDescriptionRef"])
    report["boonsWithNoNameCount"] = len(report["boonsWithNoName"])
    fatal = []

    # 1. dangling references: an id named by a requirement, an exclusion or a
    # block that is not in the catalog. A requirement pointing at nothing can
    # never be satisfied, so it renders the boon impossible for every player.
    dangling = {}
    for bid, b in sorted(boons.items()):
        referenced = requirements.referenced_trait_ids(b.get("prereq"))
        referenced |= requirements.referenced_trait_ids(b.get("activation"))
        referenced |= set(b.get("exclusiveGroup") or [])
        referenced |= set(b.get("blockedBy") or [])
        missing = sorted(r for r in referenced if r not in all_ids)
        if missing:
            dangling[bid] = missing
    report["danglingPrereqReferences"] = dangling
    report["danglingPrereqReferenceCount"] = sum(len(v) for v in dangling.values())

    # 2. boons with no prereq at all (expected for core/starter boons, but
    # worth surfacing the full list so it can be sanity-checked)
    no_prereq = sorted(bid for bid, b in boons.items() if not b.get("prereq"))
    report["boonsWithNoPrereq"] = no_prereq
    report["boonsWithNoPrereqCount"] = len(no_prereq)

    # 3. rarities with no consumer: rarity levels that appear in NO boon's
    # `rarity` list at all (declared somewhere as a concept, never used)
    all_rarities_seen = set()
    for b in boons.values():
        all_rarities_seen.update(b.get("rarity") or [])
    known_rarity_universe = {"Common", "Rare", "Epic", "Heroic", "Legendary", "Duo"}
    if game_key == "hades2":
        known_rarity_universe |= {"Perfect", "Elemental", "Legacy"}
    report["raritiesNeverUsedByAnyBoon"] = sorted(known_rarity_universe - all_rarities_seen)
    report["raritiesSeenInData"] = sorted(all_rarities_seen)

    # 4. exclusiveGroup symmetry. The classifier only records a mutual
    # exclusion when both records name each other, so this can no longer find
    # anything -- which is exactly why it stays, and why it is fatal. It is now
    # a check on the classifier rather than on the game's data, and the whole
    # reason the field was wrong before was that nobody was checking.
    asymmetric = []
    for bid, b in sorted(boons.items()):
        grp = b.get("exclusiveGroup")
        if not grp:
            continue
        if bid not in grp:
            asymmetric.append({"from": bid, "expectedBackReferenceIn": bid, "otherGroup": grp})
        if len(grp) < 2:
            fatal.append("%s %s has a one-member exclusive group, which excludes nothing" % (game_key, bid))
        for other in grp:
            if other == bid:
                continue
            other_grp = (boons.get(other) or {}).get("exclusiveGroup") or []
            if bid not in other_grp:
                asymmetric.append({"from": bid, "expectedBackReferenceIn": other, "otherGroup": other_grp})
    report["asymmetricExclusiveGroups"] = asymmetric
    for entry in asymmetric:
        fatal.append("%s %s claims a mutual exclusion %s does not name back"
                     % (game_key, entry["from"], entry["expectedBackReferenceIn"]))

    # 5. unresolved-sentinel leaks. The dumper writes "<unresolved:X>" wherever
    # a Lua table reached for a global that had not been loaded yet, and those
    # markers are expected in the raw dumps. What must never happen is one
    # surviving into a normalized field, because there it is a *value*: a
    # `prereq` whose member list is the string "<unresolved:...>" instead of a
    # list of trait ids has lost its whole clause, and it does so invisibly.
    # Normalization now refuses such a clause rather than passing it through,
    # so the evidence arrives as a build failure instead of as a leak -- and
    # both count as carrying, otherwise normalizing the value away would look
    # like the defect being fixed.
    leaks = []
    for scope, records in (("boon", boons), ("god", gods), ("keepsake", keepsakes)):
        for rid, rec in sorted(records.items()):
            for path, value in find_unresolved(rec):
                leaks.append({"scope": scope, "id": rid, "field": path, "value": value})
    report["unresolvedSentinelLeaks"] = [l for l in leaks if l["id"] not in UNRESOLVED_SENTINEL_KNOWN]
    report["unresolvedSentinelLeakCount"] = len(report["unresolvedSentinelLeaks"])
    report["unresolvedSentinelKnown"] = [l for l in leaks if l["id"] in UNRESOLVED_SENTINEL_KNOWN]
    for leak in report["unresolvedSentinelLeaks"]:
        fatal.append("%s %s %s.%s = %s" % (game_key, leak["scope"], leak["id"], leak["field"], leak["value"]))

    # 6. inferred gods that are not gods. Attribution from a source comment is
    # a guess by construction; this asserts the guess landed inside the known
    # vocabulary rather than on an arbitrary capitalised word.
    known_gods = {g for g in gods if not g.startswith("__")} | CAMEO_GOD_NAMES
    attributed = {b["god"] for b in boons.values() if b.get("god") is not None}
    attributed |= {g for b in boons.values() for g in (b.get("duoGods") or [])}
    report["godNamesOutsideKnownVocabulary"] = sorted(attributed - known_gods)
    for name in report["godNamesOutsideKnownVocabulary"]:
        fatal.append("%s attributes a boon to %r, which is not a known god" % (game_key, name))

    # 7. clauses that did not classify. The requirement grammar is only safe to
    # model without negation because anything that does not fit the model is
    # supposed to stop the build -- otherwise an unrecognised gate is silently
    # kept as something it is not, or silently dropped, and a boon that needs
    # something appears free.
    failures = (clause_report or {}).get("buildFailures") or []
    report["buildFailures"] = failures
    report["buildFailureCount"] = len(failures)
    for failure in failures:
        if failure.get("id") in UNRESOLVED_SENTINEL_KNOWN:
            continue
        fatal.append("%s %s: %s (%s)" % (game_key, failure.get("id"), failure.get("reason"),
                                         json.dumps(failure.get("clause"))))

    # A known carrier that stopped carrying means the exemption outlived the
    # defect and should be deleted rather than quietly kept. Only records this
    # game actually has can say anything about it -- the exemption list spans
    # both games, and an id absent from this catalog is simply the other game's.
    present_here = set(boons) | set(gods) | set(keepsakes)
    still_carrying = {l["id"] for l in leaks} | {f.get("id") for f in failures}
    report["unresolvedSentinelKnownNoLongerPresent"] = sorted(
        (UNRESOLVED_SENTINEL_KNOWN & present_here) - still_carrying
    )

    # 8. requirement arity. An `anyOf` asking for more branches than it has can
    # never be satisfied by anything the run does, and evaluation is obliged to
    # answer for whatever it is handed -- so it reports "impossible" with no
    # reason to show the player. That is an authoring error, and this is the
    # only place that can refuse it.
    over_arity = []
    for bid, b in sorted(boons.items()):
        for field in ("prereq", "activation"):
            for node in requirements.walk(b.get(field)):
                if node.get("kind") == "anyOf" and node.get("min", 0) > len(node.get("of") or []):
                    over_arity.append({"id": bid, "field": field,
                                       "min": node["min"], "branches": len(node.get("of") or [])})
    report["requirementsAskingForMoreThanExists"] = over_arity
    for entry in over_arity:
        fatal.append("%s %s's %s wants %d of %d branches"
                     % (game_key, entry["id"], entry["field"], entry["min"], entry["branches"]))

    # 9. ladder depth agrees with the prerequisites it was derived from. Depth
    # is stored rather than recomputed by the app, so a wrong one is wrong
    # everywhere and forever; it is cheap to check it here against the same
    # prereqs the view will read.
    god_of = {bid: b.get("god") for bid, b in boons.items()}
    inconsistent = []
    for bid, b in sorted(boons.items()):
        tier = b.get("tier")
        if tier is None:
            continue
        parents = [t for t in requirements.referenced_trait_ids(b.get("prereq"))
                   if t != bid and god_of.get(t) is not None and god_of.get(t) == god_of.get(bid)]
        expected = 1 + max((boons[p].get("tier") or 0 for p in parents if p in boons), default=0)
        if tier != expected:
            inconsistent.append({"id": bid, "tier": tier, "expected": expected})
    report["tiersInconsistentWithPrereqs"] = inconsistent
    for entry in inconsistent:
        fatal.append("%s %s is tier %s but its prerequisites put it at %s"
                     % (game_key, entry["id"], entry["tier"], entry["expected"]))

    # 10. a block whose blocker can be shed. Reporting one tells a player their
    # build is impossible because of something they can swap out, which is the
    # most damaging verdict this engine can give. Normalization drops the one
    # known case; this is the tripwire for the next.
    removable_blocks = []
    for bid, b in sorted(boons.items()):
        for blocker in b.get("blockedBy") or []:
            if blocker in keepsakes or blocker in REMOVABLE_BLOCKER_KNOWN:
                removable_blocks.append({"id": bid, "blocker": blocker})
    report["blocksWithARemovableBlocker"] = removable_blocks
    for entry in removable_blocks:
        fatal.append("%s %s is blocked by %s, which the run can shed"
                     % (game_key, entry["id"], entry["blocker"]))

    # 11. Infusions. An element-gated boon carries its gate in the requirement
    # and carries no affinity of its own; one with neither is a boon whose
    # whole cost has gone missing.
    if raw_defs is not None:
        infusion_problems = []
        for bid, b in sorted(boons.items()):
            if "UnityTrait" not in inherit_chain(raw_defs, bid):
                continue
            elements = [n for n in requirements.walk(b.get("prereq")) if n.get("kind") == "hasElement"]
            if not elements:
                infusion_problems.append({"id": bid, "problem": "no element threshold in its requirement"})
            if b.get("elementAffinity") is not None:
                infusion_problems.append({"id": bid, "problem": "an element affinity of its own"})
        report["infusionsWithoutAnElementGate"] = infusion_problems
        for entry in infusion_problems:
            fatal.append("%s %s is element-gated but has %s" % (game_key, entry["id"], entry["problem"]))

    # 12. a record whose declared god disagrees with the loot table that offers
    # it. Cheap, because the extractor holds both sides, and it is the check
    # that would have caught the two records the overlay now corrects by hand.
    if loot_membership is not None and raw_defs is not None:
        disagreements = []
        for bid in sorted(boons):
            declared = (raw_defs.get(bid) or {}).get("God")
            owning = loot_membership.get(bid)
            if isinstance(declared, str) and owning is not None and declared != owning:
                disagreements.append({"id": bid, "declared": declared, "offeredBy": owning})
        report["godDisagreesWithOwningLootTable"] = disagreements
        for entry in disagreements:
            if entry["id"] in GOD_DISAGREES_WITH_LOOT_TABLE_KNOWN:
                continue
            fatal.append("%s %s declares %s but %s offers it"
                         % (game_key, entry["id"], entry["declared"], entry["offeredBy"]))

    # 13. records nothing offers. A trait is reachable in play only if some
    # file outside the trait definitions references it -- loot tables, the
    # store, quests, characters. A definition on its own is not a source, so a
    # named record nobody references is cut content that kept its text, and a
    # view iterating the catalog would render it as a real boon.
    #
    # Daedalus hammers are excluded first and on purpose: their pool is derived
    # from the weapon rather than listed anywhere, so the test says nothing
    # about them. Advisory, because the answer is a judgement -- the list is
    # short enough to read, and every entry in it so far has been real.
    if external_references is not None:
        unreferenced = []
        for bid, b in sorted(boons.items()):
            if not b.get("name"):
                continue
            if raw_defs is not None and "WeaponTrait" in inherit_chain(raw_defs, bid):
                continue
            if bid not in external_references:
                unreferenced.append(bid)
        report["boonsNotReferencedOutsideTraitData"] = unreferenced
        report["boonsNotReferencedOutsideTraitDataCount"] = len(unreferenced)

    return report, fatal


def unconsumed_clause_keys(raw_defs, extra_tables=()):
    """Requirement-shaped keys in the raw data that no classifier reads.

    The population of clauses has twice been measured by listing the idioms
    somebody remembered, and been wrong both times -- once because a key was
    spelled differently and once because a whole clause family was never
    enumerated. This counts from the other direction: everything that looks
    like a gate, minus everything the classifier actually consumes. A patch
    that introduces a new gate key shows up here rather than as silence.
    """
    counts = {}

    def scan(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key not in requirements.CONSUMED_CLAUSE_KEYS and _looks_like_a_gate(key):
                    counts[key] = counts.get(key, 0) + 1
                scan(value)
        elif isinstance(node, list):
            for value in node:
                scan(value)

    for defs in (raw_defs,) + tuple(extra_tables):
        for data in (defs or {}).values():
            if isinstance(data, dict):
                for key in ("GameStateRequirements", "ActivationRequirements", "LinkedUpgrades"):
                    scan(data.get(key))
                for key, value in data.items():
                    if _looks_like_a_gate(key) and key not in requirements.CONSUMED_CLAUSE_KEYS:
                        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _looks_like_a_gate(key):
    return isinstance(key, str) and (key.startswith("Required") or key.startswith("Requires")
                                     or key.endswith("Requirements"))


IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def referenced_outside_trait_data(scripts):
    """Every identifier named by a game script that is not a trait definition.

    Scanned for identifiers rather than parsed: the question is only whether a
    name appears at all, and the files that answer it are loot tables, store
    data, quests and character data in half a dozen different shapes. Whole
    identifiers rather than substrings, so one trait is not counted as
    referenced because another trait's name contains it.

    Returns None when there is nothing to scan, which is different from an
    empty answer -- a check that could not run must not read as one that
    passed.
    """
    if not os.path.isdir(scripts):
        return None
    names = set()
    found_any = False
    for path in sorted(glob.glob(os.path.join(scripts, "*.lua"))):
        if os.path.basename(path).startswith("TraitData"):
            continue
        found_any = True
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            names.update(IDENTIFIER.findall(f.read()))
    return names if found_any else None


def find_duplicate_colors(color_dict):
    """Flip name->value into value->[names] to surface any color constants
    that are byte-identical (candidates for placeholder/copy-paste values,
    same class of finding as the earlier token pass)."""
    by_value = {}
    for name, val in color_dict.items():
        if not isinstance(val, list):
            continue
        key = tuple(val)
        by_value.setdefault(key, []).append(name)
    return {str(k): v for k, v in by_value.items() if len(v) > 1}


def _load_optional(path):
    return load(path) if os.path.isfile(path) else None


def _external_references(game):
    return referenced_outside_trait_data(scripts_dir(game))


def main():
    OUT = out_dir()
    RAW = raw_dir()

    # -----------------------------------------------------------------------
    # Hades II
    # -----------------------------------------------------------------------
    h2_boons = load(OUT + "hades2/boons.json")
    h2_gods = load(OUT + "hades2/gods.json")
    h2_keepsakes = load(OUT + "hades2/keepsakes.json")
    h2_defs = load(RAW + "h2_TraitData.json")
    h2_report, h2_fatal = validate_game(
        "hades2", h2_boons, h2_gods, h2_keepsakes,
        clause_report=_load_optional(OUT + "hades2/_clause_report.json"),
        raw_defs=h2_defs,
        external_references=_external_references("hades2"),
    )
    h2_report["unconsumedClauseKeys"] = unconsumed_clause_keys(h2_defs)

    h2_color = load(RAW + "h2_Color.json")
    h2_report["duplicateColorValues"] = find_duplicate_colors({
        k: v for k, v in h2_color.items() if k.startswith("BoonPatch") or "Damage" in k or "Voice" in k
    })
    # specific known findings from the earlier token pass, re-verified against this dump
    h2_report["knownFindingsReverified"] = {
        "BoonPatchPerfect_equals_BoonPatchDuo": h2_color.get("BoonPatchPerfect") == h2_color.get("BoonPatchDuo"),
        "ApolloDamage_equals_AthenaDamage": h2_color.get("ApolloDamage") == h2_color.get("AthenaDamage"),
        "ApolloDamageLight_equals_AthenaDamageLight": h2_color.get("ApolloDamageLight") == h2_color.get("AthenaDamageLight"),
        "AresColorLightingLootAllIdentical": (
            h2_boons.get("AresWeaponBoon") is not None  # boons don't carry loot Color; checked separately below
        ),
    }

    # Selene / Ares / Hephaestus+Hermes loot-color duplicates: re-check straight
    # from the LootSetData raw dump (these are god-frame colors, not in the boon
    # catalog schema, so we check the raw source directly).
    h2_loot = load(RAW + "h2_LootSetData.json")
    def loot_color(god, upgrade_id, field):
        d = h2_loot.get(god, {}).get(upgrade_id, {})
        return d.get(field)
    h2_report["knownFindingsReverified"]["Ares_Color_LightingColor_LootColor_allIdentical"] = (
        loot_color("Ares", "AresUpgrade", "Color") ==
        loot_color("Ares", "AresUpgrade", "LightingColor") ==
        loot_color("Ares", "AresUpgrade", "LootColor")
    )
    h2_report["knownFindingsReverified"]["Hephaestus_Hermes_frameColor_identical"] = (
        loot_color("Hephaestus", "HephaestusUpgrade", "Color") ==
        loot_color("Hermes", "HermesUpgrade", "Color")
    )
    selene_color = h2_loot.get("Selene", {}).get("SpellDrop", {}).get("Color")
    chaos_color = h2_loot.get("Chaos", {}).get("TrialUpgrade", {}).get("Color")
    h2_report["knownFindingsReverified"]["Selene_color_equals_Chaos_placeholder_color"] = (
        selene_color == chaos_color and selene_color is not None
    )

    h2_report["raritiesNeverUsedByAnyBoon_notes"] = {
        "Elemental": "Not used as a RarityLevels key on any boon, but IS consumed as a CustomRarityColor override on UnityTrait (TraitData.lua:904, CustomRarityName=\"Boon_Infusion\") -- Infusion boons keep normal Common/Rare/Epic RarityLevels multipliers underneath and only override the DISPLAY color/name. Not dead.",
        "Legacy": "No reference anywhere in Scripts/*.lua beyond its own declaration in ColorData.lua:221 (checked: no CustomRarityColor, no RarityLevels key, no TextFormats entry). Appears genuinely unused/dead, consistent with the earlier token-pass finding.",
    }

    with open(OUT + "hades2/validation.json", "w") as f:
        json.dump(h2_report, f, indent=1, sort_keys=True)
        f.write("\n")

    # -----------------------------------------------------------------------
    # Hades I
    # -----------------------------------------------------------------------
    h1_boons = load(OUT + "hades1/boons.json")
    h1_gods = load(OUT + "hades1/gods.json")
    h1_keepsakes = load(OUT + "hades1/keepsakes.json")
    h1_defs = load(RAW + "h1_TraitData.json")
    h1_loot = load(RAW + "h1_LootData.json")

    # Which god's table offers each trait. Hades I keeps every god's loot in
    # one file, so this is the other side of the `God` field and the only way
    # to tell a mislabelled record from a correct one.
    h1_membership = {}
    for upgrade_id, data in sorted(h1_loot.items()):
        if not (isinstance(data, dict) and upgrade_id.endswith("Upgrade")):
            continue
        god = upgrade_id[:-len("Upgrade")]
        for field in ("PriorityUpgrades", "WeaponUpgrades", "Traits"):
            for tid in data.get(field) or []:
                if isinstance(tid, str):
                    h1_membership.setdefault(tid, god)

    h1_report, h1_fatal = validate_game(
        "hades1", h1_boons, h1_gods, h1_keepsakes,
        clause_report=_load_optional(OUT + "hades1/_clause_report.json"),
        raw_defs=h1_defs,
        loot_membership=h1_membership,
        external_references=_external_references("hades1"),
    )
    h1_report["unconsumedClauseKeys"] = unconsumed_clause_keys(h1_defs, (h1_loot,))

    h1_color = load(RAW + "h1_Color.json")
    h1_report["duplicateColorValues"] = find_duplicate_colors({
        k: v for k, v in h1_color.items() if k.startswith("BoonPatch") or "Damage" in k or "Voice" in k
    })

    h1_report["raritiesNeverUsedByAnyBoon_notes"] = {
        "Duo": "Hades I's Duo (Synergy) boons use RarityLevels={Legendary=...} internally (SynergyTrait, TraitData.lua:83-98), not a distinct 'Duo' RarityLevels key -- they are only visually/logically tagged as Duo via Frame=\"Duo\" and IsDuoBoon=true. This is expected, not missing data (matches the earlier spike finding).",
    }

    with open(OUT + "hades1/validation.json", "w") as f:
        json.dump(h1_report, f, indent=1, sort_keys=True)
        f.write("\n")

    # -----------------------------------------------------------------------
    # What a human reads, and what stops the run
    # -----------------------------------------------------------------------
    for label, rep in (("H2", h2_report), ("H1", h1_report)):
        print("%s validation summary:" % label)
        for k in ["totalBoonRecords", "danglingPrereqReferenceCount", "boonsWithNoPrereqCount",
                  "buildFailureCount", "raritiesNeverUsedByAnyBoon"]:
            print(" ", k, "=", rep.get(k))
        if rep.get("unconsumedClauseKeys"):
            print("  unconsumedClauseKeys =", rep["unconsumedClauseKeys"])
        if rep.get("boonsNotReferencedOutsideTraitData") is not None:
            print("  boonsNotReferencedOutsideTraitData =", rep["boonsNotReferencedOutsideTraitData"])
        print()
    print(" knownFindingsReverified:", json.dumps(h2_report["knownFindingsReverified"], indent=2))

    for rep in (h1_report, h2_report):
        for stale in rep["unresolvedSentinelKnownNoLongerPresent"]:
            print("NOTE: %s no longer carries an unresolved sentinel; drop it from "
                  "UNRESOLVED_SENTINEL_KNOWN in validate.py." % stale)

    fatal = h2_fatal + h1_fatal
    if fatal:
        print("EXTRACTION FAILURES (%d):" % len(fatal))
        for f in fatal:
            print("  ", f)
        raise SystemExit(1)
    print("Extraction is clean (%d known sentinel carriers exempted)."
          % sum(len(r["unresolvedSentinelKnown"]) for r in (h1_report, h2_report)))


if __name__ == "__main__":
    main()
