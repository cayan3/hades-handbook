import json, re, os, sys
from parse_text_bundle import parse_sjson_text_bundle
from line_index import index_keys_at_depth, find_key_anywhere

from config import out_dir, raw_dir, scripts_dir, text_dir

RAW = raw_dir()
OUT = out_dir("hades1")
SCRIPTS = scripts_dir("hades1")
TEXT_EN = text_dir("hades1")

os.makedirs(OUT, exist_ok=True)

def load(name):
    with open(RAW + name, encoding="utf-8") as f:
        return json.load(f)

TraitData = load("h1_TraitData.json")
LootData = load("h1_LootData.json")
Color = load("h1_Color.json")
GiftData = load("h1_GiftData.json")

REL_SCRIPTS = "Scripts/"

def is_unresolved(v):
    return isinstance(v, str) and v.startswith("<unresolved:")

# ---------------------------------------------------------------------------
# Source indices
# ---------------------------------------------------------------------------

# Stop here if the scripts directory is not the scripts directory. A missing
# file makes `index_keys_at_depth` answer `{}` rather than raise, so without
# this the run would carry on with no citations at all. It currently happens to
# die a few lines below on the text bundle instead, which is luck, not a check.
_missing = [f for f in ("TraitData.lua", "LootData.lua") if not os.path.isfile(SCRIPTS + f)]
if _missing:
    sys.exit(
        "normalize_h1: missing %s under %s\n"
        "Point EXTRACT_SCRIPTS_HADES1 at the game's Scripts directory."
        % (", ".join(_missing), SCRIPTS)
    )

boon_source = index_keys_at_depth(SCRIPTS + "TraitData.lua", 1)          # trait id -> line, in TraitData.lua
god_upgrade_source = index_keys_at_depth(SCRIPTS + "LootData.lua", 1)     # <God>Upgrade id -> line

# A handful of TraitData.lua entries use 2-space indent instead of a tab
# (an inconsistency in the source file itself); recover their line numbers
# individually rather than loosening the main scan (which produced false
# positives on unrelated nested fields at coincidentally-matching indent).
for _tid in TraitData.keys():
    if _tid not in boon_source:
        _line = find_key_anywhere(SCRIPTS + "TraitData.lua", _tid)
        if _line:
            boon_source[_tid] = _line

# LinkedUpgrades entries are nested 3 tabs deep inside each god's LootData
# block (see the earlier spike: `\t\t\tKeyName =\n\t\t\t{\n\t\t\t\tOneOf = ...`).
linked_upgrade_source = index_keys_at_depth(SCRIPTS + "LootData.lua", 3)

# ---------------------------------------------------------------------------
# Text bundle -- Hades I has no dedicated TraitText file; boon/god names and
# descriptions live in HelpText.en.sjson (confirmed directly, not assumed).
# ---------------------------------------------------------------------------

text_bundle_raw = parse_sjson_text_bundle(TEXT_EN + "HelpText.en.sjson")
# Warned about rather than required, because the synthetic fixtures deliberately
# ship no text bundle and must still run. A real extraction that reaches here
# empty would emit a whole catalog of `name: null`, which looks like data.
if not text_bundle_raw:
    print("WARNING: no text bundle read from %s -- every name and descriptionRef "
          "will be null. Check EXTRACT_TEXT_HADES1." % TEXT_EN, file=sys.stderr)
text_bundle = {
    tid: {
        "displayName": v.get("displayName"),
        "description": v.get("description"),
        "inheritFrom": v.get("inheritFrom"),
        "source": "Game/Text/en/HelpText.en.sjson:%d" % v["line"],
    }
    for tid, v in text_bundle_raw.items()
}
with open(OUT + "text.json", "w") as f:
    json.dump(text_bundle, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Gods
# ---------------------------------------------------------------------------

GOD_UPGRADE_IDS = {
    "Zeus": "ZeusUpgrade", "Ares": "AresUpgrade", "Artemis": "ArtemisUpgrade",
    "Aphrodite": "AphroditeUpgrade", "Dionysus": "DionysusUpgrade", "Athena": "AthenaUpgrade",
    "Poseidon": "PoseidonUpgrade", "Demeter": "DemeterUpgrade", "Hermes": "HermesUpgrade",
    "Hades": "HadesUpgrade",
}

def resolve_loot_field(upgrade_id, field, _visited=None, _depth=0):
    if _depth > 6:
        return None
    _visited = _visited or set()
    if upgrade_id in _visited:
        return None
    _visited.add(upgrade_id)
    data = LootData.get(upgrade_id)
    if not isinstance(data, dict):
        return None
    if field in data:
        return data[field]
    for p in data.get("InheritFrom") or []:
        if isinstance(p, str):
            v = resolve_loot_field(p, field, _visited, _depth + 1)
            if v is not None:
                return v
    return None

gods = {}
pool_god_names = set()
god_trait_membership = {}  # trait id -> god name, from each god's Traits/WeaponUpgrades/PriorityUpgrades lists
for godname, upgradeId in GOD_UPGRADE_IDS.items():
    data = LootData.get(upgradeId)
    if not isinstance(data, dict):
        continue
    is_pool = bool(resolve_loot_field(upgradeId, "GodLoot"))  # resolved through InheritFrom (BaseLoot.GodLoot = true; Hermes overrides false)
    if is_pool:
        pool_god_names.add(godname)
    for listField in ("PriorityUpgrades", "WeaponUpgrades", "Traits"):
        for tid in data.get(listField) or []:
            if isinstance(tid, str):
                god_trait_membership.setdefault(tid, godname)
    line = god_upgrade_source.get(upgradeId)
    text = text_bundle_raw.get(godname, {})
    gods[godname] = {
        "id": upgradeId,
        "name": text.get("displayName") or godname,
        "kind": "PoolSlot" if is_pool else "NonPoolSlot",
        "iconKey": data.get("Icon"),
        "source": "%sLootData.lua:%d" % (REL_SCRIPTS, line) if line else "%sLootData.lua" % REL_SCRIPTS,
    }

trial_upgrade = LootData.get("TrialUpgrade")
if trial_upgrade:
    line = god_upgrade_source.get("TrialUpgrade")
    gods["Chaos"] = {
        "id": "TrialUpgrade",
        "name": text_bundle_raw.get("Chaos", {}).get("displayName") or "Chaos",
        "kind": "NonPoolSlot",
        "iconKey": trial_upgrade.get("Icon"),
        "source": "%sLootData.lua:%d" % (REL_SCRIPTS, line) if line else "%sLootData.lua" % REL_SCRIPTS,
    }
for key in ["WeaponUpgrade", "StackUpgrade"]:
    d = LootData.get(key)
    if d:
        line = god_upgrade_source.get(key)
        gods["__mechanic_" + key] = {
            "id": key,
            "name": text_bundle_raw.get(key, {}).get("displayName"),
            "kind": "NonPoolSlot",
            "iconKey": d.get("Icon"),
            "source": "%sLootData.lua:%d" % (REL_SCRIPTS, line) if line else "%sLootData.lua" % REL_SCRIPTS,
            "note": "Not a god; a mechanical loot slot.",
        }

with open(OUT + "gods.json", "w") as f:
    json.dump(gods, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Keepsakes
# ---------------------------------------------------------------------------

npc_to_god = {}
for godname, upgradeId in GOD_UPGRADE_IDS.items():
    d = LootData.get(upgradeId, {})
    speaker = d.get("Speaker")
    if isinstance(speaker, str):
        npc_to_god[speaker] = godname

keepsake_to_npc = {}
# A dump whose input never defined GiftData carries the engine stub's
# "<unresolved:...>" placeholder rather than a table, which is deliberate --
# it records that the reference existed without inventing its contents. Nothing
# here can be derived from it, so the keepsake/NPC association is simply empty.
for npc_id, npc_data in (GiftData.items() if isinstance(GiftData, dict) else ()):
    if not isinstance(npc_data, dict):
        continue
    for k, v in npc_data.items():
        if isinstance(v, dict) and isinstance(v.get("Gift"), str):
            keepsake_to_npc.setdefault(v["Gift"], npc_id)

keepsakes = {}
for tid, data in TraitData.items():
    if not isinstance(data, dict):
        continue
    inherits = data.get("InheritFrom")
    if not (isinstance(inherits, list) and "GiftTrait" in inherits):
        continue
    if tid == "GiftTrait":
        continue
    npc = keepsake_to_npc.get(tid)
    line = boon_source.get(tid)
    text = text_bundle_raw.get(tid, {})
    keepsakes[tid] = {
        "id": tid,
        "name": text.get("displayName"),
        "associatedGod": npc_to_god.get(npc, npc),
        "associatedNpcId": npc,
        "iconKey": data.get("Icon"),
        "source": "%sTraitData.lua:%d" % (REL_SCRIPTS, line) if line else None,
    }

with open(OUT + "keepsakes.json", "w") as f:
    json.dump(keepsakes, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Named prerequisite sets
# ---------------------------------------------------------------------------
# Hades I has no LinkedTraitData-style pre-declared "core boons" constant the
# way Hades II does (confirmed during the spike: it repeats id lists inline
# instead of factoring them into a named set). So there is nothing directly
# equivalent to emit here. We still emit each god's LootData.lua trait-
# membership lists (PriorityUpgrades / WeaponUpgrades / Traits), since those
# ARE literal named groupings present in the data, just serving a different
# purpose (menu ordering / weapon-slot pool) than a prerequisite-set alias.

named_sets = {}
for godname, upgradeId in list(GOD_UPGRADE_IDS.items()) + [("Chaos", "TrialUpgrade")]:
    data = LootData.get(upgradeId, {})
    line = god_upgrade_source.get(upgradeId)
    for listField in ("PriorityUpgrades", "WeaponUpgrades", "Traits", "Consumables"):
        val = data.get(listField)
        if isinstance(val, list) and val:
            named_sets["%s.%s" % (upgradeId, listField)] = {
                "members": val,
                "source": "%sLootData.lua:%d" % (REL_SCRIPTS, line) if line else "%sLootData.lua" % REL_SCRIPTS,
                "note": "Not a prerequisite alias like Hades II's LinkedTraitData -- this is the god's own menu/weapon-slot trait list.",
            }

with open(OUT + "named_sets.json", "w") as f:
    json.dump(named_sets, f, indent=1, sort_keys=True)
    f.write("\n")

print("H1 gods:", len(gods), "keepsakes:", len(keepsakes), "named_sets:", len(named_sets))

# ---------------------------------------------------------------------------
# Prerequisite index: every LinkedUpgrades entry across every god's LootData
# block, keyed by trait id (a trait id can appear in more than one god's
# LinkedUpgrades block, e.g. Duo-flavoured requirements offered from either
# parent's pool -- collect all occurrences).
# ---------------------------------------------------------------------------

prereq_occurrences = {}  # trait id -> list of {expr, definingGod, source}
for godname, upgradeId in list(GOD_UPGRADE_IDS.items()) + [("Chaos", "TrialUpgrade")]:
    data = LootData.get(upgradeId, {})
    linked = data.get("LinkedUpgrades")
    if not isinstance(linked, dict):
        continue
    for tid, expr in linked.items():
        line = linked_upgrade_source.get(tid)
        prereq_occurrences.setdefault(tid, []).append({
            "expr": expr,
            "definingGod": godname,
            "source": "%sLootData.lua:%d" % (REL_SCRIPTS, line) if line else "%sLootData.lua" % REL_SCRIPTS,
        })

INLINE_REQ_FIELDS = ["RequiredOneOfTraits", "RequiredTrait", "RequiredFalseTrait", "RequiredFalseTraits", "RequiredSlottedTrait"]

def resolve_field_h1(trait_id, field, _visited=None, _depth=0):
    if _depth > 8:
        return None
    _visited = _visited or set()
    if trait_id in _visited:
        return None
    _visited.add(trait_id)
    data = TraitData.get(trait_id)
    if not isinstance(data, dict):
        return None
    if field in data:
        return data[field]
    for p in data.get("InheritFrom") or []:
        if isinstance(p, str):
            v = resolve_field_h1(p, field, _visited, _depth + 1)
            if v is not None:
                return v
    return None

def get_rarity_h1(trait_id):
    rl = resolve_field_h1(trait_id, "RarityLevels")
    if isinstance(rl, dict):
        return sorted(k for k in rl.keys() if isinstance(k, str) and not is_unresolved(k))
    return []

def get_slot_h1(trait_id):
    v = resolve_field_h1(trait_id, "Slot")
    return v if isinstance(v, str) else None

def get_exclusive_group_h1(trait_id, data):
    members = set([trait_id])
    for f in ("RequiredFalseTrait", "RequiredFalseTraits"):
        v = data.get(f)
        if isinstance(v, str):
            members.add(v)
        elif isinstance(v, list):
            members.update(x for x in v if isinstance(x, str))
    if len(members) <= 1:
        return None
    return sorted(members)

ASSIST_RE = re.compile(r'^([A-Za-z]+)Assist')

boons = {}
skipped_keepsakes_in_main_catalog = []

for tid, data in TraitData.items():
    if not isinstance(data, dict):
        continue
    line = boon_source.get(tid)
    if line is None:
        continue

    inherits = data.get("InheritFrom") or []
    if "GiftTrait" in inherits:
        skipped_keepsakes_in_main_catalog.append(tid)
        continue  # already emitted in keepsakes.json

    god = data.get("God")
    if not isinstance(god, str):
        god = god_trait_membership.get(tid)

    boon_category = None
    m = ASSIST_RE.match(tid)
    if m and god is None:
        boon_category = "NpcAlly"
    elif god in pool_god_names:
        boon_category = "StandardOlympian"
    elif god is not None:
        boon_category = "NonStandard"  # Hermes, Chaos
    else:
        boon_category = "NonStandard"

    inline_reqs = {}
    for f in INLINE_REQ_FIELDS:
        if f in data:
            inline_reqs[f] = data[f]

    linked_occurrences = prereq_occurrences.get(tid)

    prereq_record = None
    if linked_occurrences or inline_reqs:
        prereq_record = {}
        if linked_occurrences:
            prereq_record["linkedUpgradesOccurrences"] = linked_occurrences
        if inline_reqs:
            prereq_record["inline"] = inline_reqs
            prereq_record["inlineSource"] = "%sTraitData.lua:%d" % (REL_SCRIPTS, line)

    text = text_bundle_raw.get(tid, {})
    icon = resolve_field_h1(tid, "Icon")

    boons[tid] = {
        "id": tid,
        "god": god,
        "duoGods": None,  # Hades I has no distinct Duo-boon id space separate from its normal trait ids; see README
        "name": text.get("displayName"),
        "descriptionRef": tid if tid in text_bundle_raw else None,
        "icon": icon if isinstance(icon, str) and not is_unresolved(icon) else None,
        "boonCategory": boon_category,
        "godKind": ("PoolSlot" if god in pool_god_names else "NonPoolSlot") if god else None,
        "slot": get_slot_h1(tid),
        "rarity": get_rarity_h1(tid),
        "exclusiveGroup": get_exclusive_group_h1(tid, data),
        "elementAffinity": None,   # Hades I has no elemental-infusion mechanic (confirmed absent during the spike)
        "elementCost": None,
        "prereq": prereq_record,
        "source": "%sTraitData.lua:%d" % (REL_SCRIPTS, line),
    }

with open(OUT + "boons.json", "w") as f:
    json.dump(boons, f, indent=1, sort_keys=True)
    f.write("\n")

print("H1 boon records:", len(boons), "excluded (keepsakes, emitted separately):", len(skipped_keepsakes_in_main_catalog))
