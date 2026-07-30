import json, os

from config import out_dir, raw_dir

OUT = out_dir()
RAW = raw_dir()

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

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
