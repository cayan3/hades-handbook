import json, os

from config import out_dir, raw_dir

OUT = out_dir()
RAW = raw_dir()

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


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

def collect_prereq_ids(expr):
    """Walk a prereq expression tree and collect every trait id string it
    references (OneOf list members, OneFromEachSet nested lists, HasNone
    lists gated on the TraitDictionary path) so we can check they all exist
    in the catalog. `HasNone` is a generic primitive also used for non-trait
    checks (e.g. room-flag gating via Path=[...,"CurrentRoom"]); we only
    treat it as a trait reference when its sibling Path ends in
    "TraitDictionary" (see normalize_h2.py's get_exclusive_group for the
    same distinction, discovered via this validator)."""
    ids = set()
    if isinstance(expr, dict):
        if "HasNone" in expr and isinstance(expr.get("HasNone"), list):
            path = expr.get("Path")
            if isinstance(path, list) and path and path[-1] == "TraitDictionary":
                ids.update(x for x in expr["HasNone"] if isinstance(x, str))
        for k, v in expr.items():
            if k == "OneOf" and isinstance(v, list):
                ids.update(x for x in v if isinstance(x, str))
            elif k == "OneFromEachSet" and isinstance(v, list):
                for group in v:
                    if isinstance(group, list):
                        ids.update(x for x in group if isinstance(x, str))
            elif k != "HasNone" and isinstance(v, (dict, list)):
                ids.update(collect_prereq_ids(v))
    elif isinstance(expr, list):
        for item in expr:
            ids.update(collect_prereq_ids(item))
    return ids


def validate_game(game_key, boons, gods, keepsakes):
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

    # 1. dangling prereq ids: referenced but not present anywhere in the catalog
    dangling = {}
    for bid, b in boons.items():
        prereq = b.get("prereq")
        if not prereq:
            continue
        referenced = set()
        if game_key == "hades2":
            if prereq.get("expr"):
                referenced |= collect_prereq_ids(prereq["expr"])
        else:
            for occ in prereq.get("linkedUpgradesOccurrences", []):
                referenced |= collect_prereq_ids(occ.get("expr"))
            inline = prereq.get("inline", {})
            for f in ("RequiredOneOfTraits",):
                if isinstance(inline.get(f), list):
                    referenced.update(x for x in inline[f] if isinstance(x, str))
            # NOTE: RequiredSlottedTrait is a SLOT name (e.g. "Shout"), not a
            # trait id -- confirmed by this validator surfacing it as
            # dangling against every known trait id ("Shout" is Melee's /
            # Secondary's / Ranged's sibling slot name, not a boon). It is
            # deliberately excluded from the trait-id reference check.
            for f in ("RequiredTrait", "RequiredFalseTrait"):
                if isinstance(inline.get(f), str):
                    referenced.add(inline[f])
            if isinstance(inline.get("RequiredFalseTraits"), list):
                referenced.update(x for x in inline["RequiredFalseTraits"] if isinstance(x, str))
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

    # 4. exclusiveGroup symmetry check: if A lists B in its exclusiveGroup,
    # does B list A back? (only meaningful for Hades II's HasNone mechanism,
    # which is expected to be hand-maintained and symmetric)
    asymmetric = []
    for bid, b in boons.items():
        grp = b.get("exclusiveGroup")
        if not grp:
            continue
        for other in grp:
            if other == bid:
                continue
            other_rec = boons.get(other)
            if other_rec is None:
                continue
            other_grp = other_rec.get("exclusiveGroup") or []
            if bid not in other_grp:
                asymmetric.append({"from": bid, "expectedBackReferenceIn": other, "otherGroup": other_grp})
    report["asymmetricExclusiveGroups"] = asymmetric

    # 5. unresolved-sentinel leaks. The dumper writes "<unresolved:X>" wherever
    # a Lua table reached for a global that had not been loaded yet, and those
    # markers are expected in the raw dumps. What must never happen is one
    # surviving into a normalized field, because there it is a *value*: a
    # `prereq` whose OneOf is the string "<unresolved:...>" instead of a list of
    # trait ids has lost its whole clause, and it does so invisibly. The
    # dangling-reference check above cannot see it -- collect_prereq_ids only
    # reads OneOf when it is a list, so a string contributes no ids and the
    # count comes back 0 for exactly the records that are broken. This walks
    # every emitted tree instead of trusting any one field's own guard.
    leaks = []
    for scope, records in (("boon", boons), ("god", gods), ("keepsake", keepsakes)):
        for rid, rec in sorted(records.items()):
            for path, value in find_unresolved(rec):
                leaks.append({"scope": scope, "id": rid, "field": path, "value": value})
    report["unresolvedSentinelLeaks"] = [l for l in leaks if l["id"] not in UNRESOLVED_SENTINEL_KNOWN]
    report["unresolvedSentinelLeakCount"] = len(report["unresolvedSentinelLeaks"])
    report["unresolvedSentinelKnown"] = [l for l in leaks if l["id"] in UNRESOLVED_SENTINEL_KNOWN]
    # A known carrier that stopped carrying means the exemption outlived the
    # defect and should be deleted rather than quietly kept. Only records this
    # game actually has can say anything about it -- the exemption list spans
    # both games, and an id absent from this catalog is simply the other game's.
    present_here = set(boons) | set(gods) | set(keepsakes)
    report["unresolvedSentinelKnownNoLongerPresent"] = sorted(
        (UNRESOLVED_SENTINEL_KNOWN & present_here) - {l["id"] for l in leaks}
    )

    # 6. inferred gods that are not gods. Attribution from a source comment is
    # a guess by construction; this asserts the guess landed inside the known
    # vocabulary rather than on an arbitrary capitalised word.
    known_gods = {g for g in gods if not g.startswith("__")} | CAMEO_GOD_NAMES
    attributed = {b["god"] for b in boons.values() if b.get("god") is not None}
    attributed |= {g for b in boons.values() for g in (b.get("duoGods") or [])}
    report["godNamesOutsideKnownVocabulary"] = sorted(attributed - known_gods)

    return report


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


# ---------------------------------------------------------------------------
# Hades II
# ---------------------------------------------------------------------------
h2_boons = load(OUT + "hades2/boons.json")
h2_gods = load(OUT + "hades2/gods.json")
h2_keepsakes = load(OUT + "hades2/keepsakes.json")
h2_report = validate_game("hades2", h2_boons, h2_gods, h2_keepsakes)

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

h2_trait_text = load(RAW + "h2_TraitData.json")
h2_report["raritiesNeverUsedByAnyBoon_notes"] = {
    "Elemental": "Not used as a RarityLevels key on any boon, but IS consumed as a CustomRarityColor override on UnityTrait (TraitData.lua:904, CustomRarityName=\"Boon_Infusion\") -- Infusion boons keep normal Common/Rare/Epic RarityLevels multipliers underneath and only override the DISPLAY color/name. Not dead.",
    "Legacy": "No reference anywhere in Scripts/*.lua beyond its own declaration in ColorData.lua:221 (checked: no CustomRarityColor, no RarityLevels key, no TextFormats entry). Appears genuinely unused/dead, consistent with the earlier token-pass finding.",
}

with open(OUT + "hades2/validation.json", "w") as f:
    json.dump(h2_report, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Hades I
# ---------------------------------------------------------------------------
h1_boons = load(OUT + "hades1/boons.json")
h1_gods = load(OUT + "hades1/gods.json")
h1_keepsakes = load(OUT + "hades1/keepsakes.json")
h1_report = validate_game("hades1", h1_boons, h1_gods, h1_keepsakes)

h1_color = load(RAW + "h1_Color.json")
h1_report["duplicateColorValues"] = find_duplicate_colors({
    k: v for k, v in h1_color.items() if k.startswith("BoonPatch") or "Damage" in k or "Voice" in k
})

h1_report["raritiesNeverUsedByAnyBoon_notes"] = {
    "Duo": "Hades I's Duo (Synergy) boons use RarityLevels={Legendary=...} internally (SynergyTrait, TraitData.lua:83-98), not a distinct 'Duo' RarityLevels key -- they are only visually/logically tagged as Duo via Frame=\"Duo\" and IsDuoBoon=true. This is expected, not missing data (matches the earlier spike finding).",
}
h1_report["asymmetricExclusiveGroups_note"] = (
    "Hades I's RequiredFalseTrait(s) field does not appear to be maintained as a symmetric "
    "pairwise relationship the way Hades II's HasNone cast-exclusivity trio is (each Hades II "
    "member explicitly lists the other members back). Treat this list as one-directional "
    "'don't offer X if Y was already taken' soft blocks, not confirmed two-way mutual exclusion, "
    "unless individually checked."
)

with open(OUT + "hades1/validation.json", "w") as f:
    json.dump(h1_report, f, indent=1, sort_keys=True)
    f.write("\n")

print("H2 validation summary:")
for k in ["totalBoonRecords", "danglingPrereqReferenceCount", "boonsWithNoPrereqCount", "raritiesNeverUsedByAnyBoon"]:
    print(" ", k, "=", h2_report[k])
print(" knownFindingsReverified:", json.dumps(h2_report["knownFindingsReverified"], indent=2))
print()
print("H1 validation summary:")
for k in ["totalBoonRecords", "danglingPrereqReferenceCount", "boonsWithNoPrereqCount", "raritiesNeverUsedByAnyBoon"]:
    print(" ", k, "=", h1_report[k])

# The reports above are advisory -- they describe the catalog and a human reads
# them. These two are different in kind: each says a field holds a value that is
# not data, which no consumer of the catalog can detect for itself. Exit
# non-zero so a run that produced one cannot be mistaken for a clean run.
print()
fatal = []
for game, rep in (("hades2", h2_report), ("hades1", h1_report)):
    for leak in rep["unresolvedSentinelLeaks"]:
        fatal.append("%s %s %s.%s = %s" % (game, leak["scope"], leak["id"], leak["field"], leak["value"]))
    for name in rep["godNamesOutsideKnownVocabulary"]:
        fatal.append("%s attributes a boon to %r, which is not a known god" % (game, name))
    for stale in rep["unresolvedSentinelKnownNoLongerPresent"]:
        print("NOTE: %s no longer carries an unresolved sentinel; drop it from "
              "UNRESOLVED_SENTINEL_KNOWN in validate.py." % stale)
if fatal:
    print("EMISSION INTEGRITY FAILURES (%d):" % len(fatal))
    for f in fatal:
        print("  ", f)
    raise SystemExit(1)
print("Emission integrity: clean (%d known sentinel carriers exempted)."
      % sum(len(r["unresolvedSentinelKnown"]) for r in (h1_report, h2_report)))
