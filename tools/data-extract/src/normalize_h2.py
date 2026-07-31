import glob, json, re, os, sys
from parse_text_bundle import parse_sjson_text_bundle
from line_index import index_keys_at_depth

from config import out_dir, raw_dir, scripts_dir, text_dir

RAW = raw_dir()
OUT = out_dir("hades2")
SCRIPTS = scripts_dir("hades2")
TEXT_EN = text_dir("hades2")

os.makedirs(OUT, exist_ok=True)

def load(name):
    with open(RAW + name, encoding="utf-8") as f:
        return json.load(f)

TraitData = load("h2_TraitData.json")
TraitSetData = load("h2_TraitSetData.json")
LootSetData = load("h2_LootSetData.json")
Color = load("h2_Color.json")
LinkedTraitData = load("h2_LinkedTraitData.json")
TraitRequirements = load("h2_TraitRequirements.json")
GiftData = load("h2_GiftData.json")

REL_SCRIPTS = "Scripts/"  # cited paths are relative to the game's Scripts dir, per prior convention

# ---------------------------------------------------------------------------
# Source-line indices: which file:line each key was actually declared at
# ---------------------------------------------------------------------------

# Discovered from the directory rather than listed, so a patch that adds a god
# is absorbed by re-running the extractor -- which is the whole premise of
# extracting instead of transcribing. A hardcoded list would silently emit
# nothing for a new god's boons while every validation check still passed,
# because an id nobody looked for cannot dangle. Sorted for determinism: later
# files overwrite earlier keys in the source index, so the order is part of the
# output.
TRAIT_FILES = sorted(os.path.basename(p) for p in glob.glob(SCRIPTS + "TraitData_*.lua"))
LOOT_FILES = sorted(os.path.basename(p) for p in glob.glob(SCRIPTS + "LootData_*.lua"))

# Stop here if the scripts directory is not the scripts directory.
# `index_keys_at_depth` answers `{}` for a file that is not there, which is the
# right answer for an optional per-god file -- a game shipping none of them is
# not an error -- but it is silently fatal for the ones every citation depends
# on. Without this check a mistyped path produces an empty source index, every
# trait then fails its `src is None` test and is reclassified as a base
# archetype, and the run writes `{}` over the catalog and exits 0. An empty
# glob is the same failure seen from the other side: the directory exists but
# holds no per-god trait files, so nothing would be read from it.
_missing = [f for f in ("TraitData.lua",) if not os.path.isfile(SCRIPTS + f)]
if _missing or not TRAIT_FILES:
    sys.exit(
        "normalize_h2: %s under %s\n"
        "Point EXTRACT_SCRIPTS_HADES2 at the game's Scripts directory."
        % ("no TraitData_*.lua files" if not _missing
           else "missing " + ", ".join(_missing), SCRIPTS)
    )

# id -> (file, line)  (base TraitData.lua covers base archetypes, tracked separately)
boon_source = {}
for fname in TRAIT_FILES:
    for key, line in index_keys_at_depth(SCRIPTS + fname, 1).items():
        boon_source[key] = (fname, line)

base_trait_source = index_keys_at_depth(SCRIPTS + "TraitData.lua", 1)  # BaseTrait, FireBoon, LegendaryTrait, SynergyTrait, UnityTrait, etc.

god_upgrade_source = {}
for fname in ["LootData.lua"] + LOOT_FILES:
    for key, line in index_keys_at_depth(SCRIPTS + fname, 1).items():
        if key.endswith("Upgrade"):
            god_upgrade_source[key] = (fname, line)

# TraitRequirements entries: all live inside TraitData.lua's `TraitRequirements = { ... }`
# table, at 1-tab indent, same as base_trait_source scan (same file/depth) --
# reuse that same index (it already covers every 1-tab key in TraitData.lua,
# TraitRequirements' entries included, since they live in the same physical
# tab-indentation level as the base archetypes, just a different section).
prereq_source = base_trait_source

# ---------------------------------------------------------------------------
# Text bundle (names + descriptions) -- kept as a SEPARATE output file
# ---------------------------------------------------------------------------

text_bundle_raw = parse_sjson_text_bundle(TEXT_EN + "TraitText.en.sjson")
# Warned about rather than required, because the synthetic fixtures deliberately
# ship no text bundle and must still run. A real extraction that reaches here
# empty would emit a whole catalog of `name: null`, which looks like data.
if not text_bundle_raw:
    print("WARNING: no text bundle read from %s -- every name and descriptionRef "
          "will be null. Check EXTRACT_TEXT_HADES2." % TEXT_EN, file=sys.stderr)
text_bundle = {
    tid: {
        "displayName": v.get("displayName"),
        "description": v.get("description"),
        "inheritFrom": v.get("inheritFrom"),
        "source": "Game/Text/en/TraitText.en.sjson:%d" % v["line"],
    }
    for tid, v in text_bundle_raw.items()
}
with open(OUT + "text.json", "w") as f:
    json.dump(text_bundle, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# God records
# ---------------------------------------------------------------------------

# gods that actually appear in the standard boon pool this run (GodLoot == true)
GOD_FILE_KEYS = {  # LootSetData top-level key -> <God>Upgrade id
    "Aphrodite": "AphroditeUpgrade", "Apollo": "ApolloUpgrade", "Ares": "AresUpgrade",
    "Demeter": "DemeterUpgrade", "Hephaestus": "HephaestusUpgrade", "Hera": "HeraUpgrade",
    "Hermes": "HermesUpgrade", "Hestia": "HestiaUpgrade", "Poseidon": "PoseidonUpgrade",
    "Zeus": "ZeusUpgrade",
}

# LootSetData is sectioned by god, but an `InheritFrom` entry names a bare id
# that may live in any section: every <God>Upgrade inherits `BaseLoot`, which
# sits under the `Loot` section and is where `GodLoot = true` is actually
# declared. Resolution therefore walks a flat union of every section's entries.
# This matters -- Poseidon and Zeus carry no literal `GodLoot` of their own and
# are pool gods purely through that inheritance, so reading the field directly
# off the record answers None for two of the nine.
LOOT_ENTRIES = {}
for _section in LootSetData.values():
    if isinstance(_section, dict):
        for _entry_id, _entry in _section.items():
            if isinstance(_entry, dict):
                LOOT_ENTRIES.setdefault(_entry_id, _entry)

def resolve_loot_field(entry_id, field, _visited=None, _depth=0):
    if _depth > 6:
        return None
    _visited = _visited or set()
    if entry_id in _visited:
        return None
    _visited.add(entry_id)
    entry = LOOT_ENTRIES.get(entry_id)
    if not isinstance(entry, dict):
        return None
    if field in entry:
        return entry[field]
    for parent in entry.get("InheritFrom") or []:
        if isinstance(parent, str):
            v = resolve_loot_field(parent, field, _visited, _depth + 1)
            if v is not None:
                return v
    return None

gods = {}
pool_god_names = set()
for godname, upgradeId in GOD_FILE_KEYS.items():
    section = LootSetData.get(godname, {})
    data = section.get(upgradeId)
    if data is None:
        continue
    src = god_upgrade_source.get(upgradeId)
    # Resolved rather than read: Hermes overrides BaseLoot's `true` with `false`,
    # and the rest either declare it or inherit it.
    is_pool = bool(resolve_loot_field(upgradeId, "GodLoot"))
    if is_pool:
        pool_god_names.add(godname)
    text = text_bundle_raw.get(godname, {})
    gods[godname] = {
        "id": upgradeId,
        "name": text.get("displayName") or godname,
        "kind": "PoolSlot" if is_pool else "NonPoolSlot",
        "iconKey": data.get("Icon"),
        "source": "%s%s:%d" % (REL_SCRIPTS, src[0], src[1]) if src else None,
    }

# Selene is a special case: grants Hexes via a SpellDrop interactable, not a
# standard <God>Upgrade table (see the Hades II token-pass finding).
selene_spell = LootSetData.get("Selene", {}).get("SpellDrop")
if selene_spell is not None:
    src = god_upgrade_source.get("SpellDrop")  # likely absent; SpellDrop isn't named "...Upgrade"
    gods["Selene"] = {
        "id": "SpellDrop",
        "name": text_bundle_raw.get("Selene", {}).get("displayName") or "Selene",
        "kind": "NonPoolSlot",
        "iconKey": selene_spell.get("Icon"),
        "source": "%sLootData_Selene.lua (SpellDrop table; not a <God>Upgrade -- irregular structure, see token-pass notes)" % REL_SCRIPTS,
        "note": "Selene does not grant boons through the standard <God>Upgrade loot mechanism; she grants Hex/Arcana spells via a SpellDrop interactable.",
    }

# Chaos and the mechanical "gods" (weapon upgrade, stack upgrade) also live
# in LootSetData.Loot -- include them tagged distinctly, they are not
# Olympians.
for key in ["WeaponUpgrade", "StackUpgrade", "StackUpgradeDouble", "StackUpgradeTriple"]:
    d = LootSetData.get("Loot", {}).get(key)
    if d:
        src = god_upgrade_source.get(key)
        gods.setdefault("__mechanic_" + key, {
            "id": key,
            "name": text_bundle_raw.get(key, {}).get("displayName"),
            "kind": "NonPoolSlot",
            "iconKey": d.get("Icon"),
            "source": "%s%s:%d" % (REL_SCRIPTS, src[0], src[1]) if src else "%sLootData.lua" % REL_SCRIPTS,
            "note": "Not a god; a mechanical loot slot (Daedalus Hammer / stacked reward variants).",
        })
trial_upgrade = LootSetData.get("Chaos", {}).get("TrialUpgrade")
if trial_upgrade:
    src = god_upgrade_source.get("TrialUpgrade")
    gods["Chaos"] = {
        "id": "TrialUpgrade",
        "name": text_bundle_raw.get("Chaos", {}).get("displayName") or "Chaos",
        "kind": "NonPoolSlot",
        "iconKey": trial_upgrade.get("Icon"),
        "source": "%sLootData_Chaos.lua:%d" % (REL_SCRIPTS, src[1]) if src else "%sLootData_Chaos.lua" % REL_SCRIPTS,
    }

with open(OUT + "gods.json", "w") as f:
    json.dump(gods, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Keepsake records
# ---------------------------------------------------------------------------

# NPC id -> god/character name, derived from each LootData_<God>.lua's
# `Speaker = "NPC_X_01"` field (a real, read field, not invented).
npc_to_god = {}
for godname in GOD_FILE_KEYS:
    d = LootSetData.get(godname, {}).get(GOD_FILE_KEYS[godname], {})
    speaker = d.get("Speaker")
    if isinstance(speaker, str):
        npc_to_god[speaker] = godname
selene_speaker = LootSetData.get("Selene", {}).get("SpellDrop", {}).get("Speaker")
if selene_speaker:
    npc_to_god[selene_speaker] = "Selene"

# keepsake id -> NPC id, from GiftData's `[n] = { Gift = "X" }` entries
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

keepsake_src_index = index_keys_at_depth(SCRIPTS + "TraitData_Keepsake.lua", 1)
keepsakes = {}
for kid, kdata in TraitSetData.get("Keepsakes", {}).items():
    if kid == "GiftTrait":  # base template, not an actual keepsake
        continue
    npc = keepsake_to_npc.get(kid)
    line = keepsake_src_index.get(kid)
    text = text_bundle_raw.get(kid, {})
    keepsakes[kid] = {
        "id": kid,
        "name": text.get("displayName"),
        "associatedGod": npc_to_god.get(npc, npc),  # NPC id verbatim if not a pantheon god
        "associatedNpcId": npc,
        "iconKey": kdata.get("Icon") if isinstance(kdata, dict) else None,
        "source": "%sTraitData_Keepsake.lua:%d" % (REL_SCRIPTS, line) if line else None,
    }

with open(OUT + "keepsakes.json", "w") as f:
    json.dump(keepsakes, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Named prerequisite sets (LinkedTraitData)
# ---------------------------------------------------------------------------

linked_source = index_keys_at_depth(SCRIPTS + "TraitData.lua", 1)
named_sets = {}
for name, members in LinkedTraitData.items():
    line = linked_source.get(name)
    named_sets[name] = {
        "members": members,
        "source": "%sTraitData.lua:%d" % (REL_SCRIPTS, line) if line else "%sTraitData.lua" % REL_SCRIPTS,
    }
with open(OUT + "named_sets.json", "w") as f:
    json.dump(named_sets, f, indent=1, sort_keys=True)
    f.write("\n")

print("H2 gods:", len(gods), "keepsakes:", len(keepsakes), "named_sets:", len(named_sets))
print("boon_source entries:", len(boon_source), "base_trait_source entries:", len(base_trait_source))

# ---------------------------------------------------------------------------
# Boon/trait catalog
# ---------------------------------------------------------------------------

ALL_DEFS = dict(TraitData)  # base archetypes + every per-god/mechanic boon, already merged by the loader
ASPECT_DEFS = TraitSetData.get("Aspects", {})
ALL_DEFS_WITH_ASPECTS = dict(ALL_DEFS)
ALL_DEFS_WITH_ASPECTS.update(ASPECT_DEFS)

def is_unresolved(v):
    return isinstance(v, str) and v.startswith("<unresolved:")

def resolve_field(trait_id, field, _visited=None, _depth=0):
    """Look up `field` on trait_id, walking InheritFrom parents (in order,
    first-defined-wins like the raw table already reflects child-overrides-
    parent) if not present directly. Returns (value, definingId) or (None, None).
    """
    if _depth > 8:
        return None, None
    _visited = _visited or set()
    if trait_id in _visited:
        return None, None
    _visited.add(trait_id)
    data = ALL_DEFS_WITH_ASPECTS.get(trait_id)
    if not isinstance(data, dict):
        return None, None
    if field in data:
        return data[field], trait_id
    parents = data.get("InheritFrom")
    if isinstance(parents, list):
        for p in parents:
            if isinstance(p, str):
                val, definer = resolve_field(p, field, _visited, _depth + 1)
                if val is not None:
                    return val, definer
    return None, None

def inherit_chain(trait_id, _visited=None, _depth=0):
    if _depth > 8 or trait_id in (_visited or set()):
        return []
    _visited = set(_visited or set())
    _visited.add(trait_id)
    data = ALL_DEFS_WITH_ASPECTS.get(trait_id)
    if not isinstance(data, dict):
        return []
    parents = data.get("InheritFrom") or []
    chain = list(parents)
    for p in parents:
        if isinstance(p, str):
            chain.extend(inherit_chain(p, _visited, _depth + 1))
    return chain

ELEMENT_BASE_TRAITS = {"AirBoon": "Air", "FireBoon": "Fire", "EarthBoon": "Earth", "WaterBoon": "Water", "AetherBoon": "Aether"}

NPC_MARKER_FILES = {  # files whose boons are tied to one specific non-Olympian NPC
    "TraitData_Circe.lua": "Circe", "TraitData_Icarus.lua": "Icarus", "TraitData_Medea.lua": "Medea",
    "TraitData_Narcissus.lua": "Narcissus", "TraitData_Arachne.lua": "Arachne", "TraitData_Echo.lua": "Echo",
}
MECHANIC_ONLY_FILES = {
    "TraitData_Aspect.lua", "TraitData_Axe.lua", "TraitData_Dagger.lua", "TraitData_Lob.lua",
    "TraitData_Staff.lua", "TraitData_Suit.lua", "TraitData_Torch.lua", "TraitData_MetaUpgrade.lua",
    "TraitData_Spell.lua", "TraitData_Store.lua", "TraitData_Talent.lua", "TraitData_Chaos.lua",
    "TraitData_Elementals.lua", "TraitData_Essence.lua",
}
# Files named for a god but holding no single god's boons: duos belong to two and
# read their pair from a source comment, keepsakes belong to whoever gives them.
CROSS_GOD_TRAIT_FILES = {"TraitData_Duo.lua", "TraitData_Keepsake.lua"}

# `TraitData_<Name>.lua` names its god, so derive the map from the files actually
# present rather than listing them. Listing was the older form and it left a new
# god silently unattributed -- a patch adding `TraitData_Chronos.lua` would emit
# its boons with `god: null` and `boonCategory: NonStandard` and say nothing,
# which is the same failure the file glob above already exists to prevent. Every
# `TraitData_*` file must fall in exactly one of the four buckets; anything the
# three exclusion sets do not claim is a god's file by construction.
FILE_TO_GOD = {
    fname: fname[len("TraitData_"):-len(".lua")]
    for fname in TRAIT_FILES
    if fname not in MECHANIC_ONLY_FILES
    and fname not in NPC_MARKER_FILES
    and fname not in CROSS_GOD_TRAIT_FILES
}

# Every god name the extractor is willing to attribute a boon to. Both readers
# below recover a name from a hand-written source comment, which is the only
# place the data records these associations at all -- but a comment is prose,
# and the patterns match any capitalised word. Without this set, a comment that
# happens to read `-- Deprecated: replaced in 1.3` yields `god = "Deprecated"`,
# which then decides godKind and boonCategory as confidently as a real name
# would. An unrecognised name must become an absent god, not a plausible one:
# an unattributed boon renders as unattributed, whereas an invented god renders
# as somebody's, and only the second is silently wrong.
KNOWN_GOD_NAMES = set(GOD_FILE_KEYS) | set(FILE_TO_GOD.values()) | {"Selene", "Chaos"}

DUO_COMMENT_RE = re.compile(r'--\s*([A-Z][a-zA-Z]+)\s*(?:x|×)\s*([A-Z][a-zA-Z]+)')

def parse_duo_gods(fname, line):
    """Duo boon definition lines carry a `-- GodA x GodB` trailing comment
    in TraitData_Duo.lua; read it directly rather than guessing."""
    if not line:
        return None
    try:
        with open(SCRIPTS + fname, encoding="utf-8-sig") as f:
            lines = f.readlines()
        raw = lines[line - 1]
        m = DUO_COMMENT_RE.search(raw)
        if m and m.group(1) in KNOWN_GOD_NAMES and m.group(2) in KNOWN_GOD_NAMES:
            return [m.group(1), m.group(2)]
    except Exception:
        pass
    return None

ELEMENTAL_COMMENT_RE = re.compile(r'--\s*([A-Z][a-zA-Z]+)')

def parse_elemental_god_comment(fname, line):
    """TraitData_Elementals.lua entries carry a `-- <God>, all elements`
    style leading comment identifying which god's Infusion this is."""
    if not line:
        return None
    try:
        with open(SCRIPTS + fname, encoding="utf-8-sig") as f:
            lines = f.readlines()
        # look up to 2 lines above the entry for a comment
        for i in range(max(0, line - 3), line - 1):
            m = ELEMENTAL_COMMENT_RE.search(lines[i])
            if m and m.group(1) in KNOWN_GOD_NAMES:
                return m.group(1)
    except Exception:
        pass
    return None

def get_exclusive_group(trait_id, data):
    # `HasNone` is a generic "this list-valued GameState path contains none
    # of these strings" primitive -- it is reused for unrelated purposes
    # depending on what `Path` it's paired with. Confirmed by validation:
    # Path=[...,"TraitDictionary"] means "I hold none of these traits" (a
    # real mutual-exclusion group), but Path=[...,"CurrentRoom"] means "this
    # room has none of these flags set" (e.g. HasNone={"BlockGiftBoons"}),
    # which is not a trait reference at all. Only treat the former as an
    # exclusiveGroup.
    gsr = data.get("GameStateRequirements")
    if not isinstance(gsr, list):
        return None
    for cond in gsr:
        if not isinstance(cond, dict) or not isinstance(cond.get("HasNone"), list):
            continue
        path = cond.get("Path")
        if isinstance(path, list) and path and path[-1] == "TraitDictionary":
            group = sorted(set([trait_id] + [x for x in cond["HasNone"] if isinstance(x, str)]))
            return group
    return None

def get_element_affinity(trait_id):
    chain = [trait_id] + inherit_chain(trait_id)
    for c in chain:
        if c in ELEMENT_BASE_TRAITS:
            return ELEMENT_BASE_TRAITS[c]
    return None

def get_element_cost(trait_id, data):
    chain = [trait_id] + inherit_chain(trait_id)
    if "UnityTrait" not in chain:
        return None
    gsr = data.get("GameStateRequirements")
    costs = {}
    if isinstance(gsr, list):
        for cond in gsr:
            if not isinstance(cond, dict):
                continue
            path = cond.get("Path")
            if isinstance(path, list) and len(path) >= 4 and path[2] == "Elements":
                elem = path[3]
                val = cond.get("Value")
                if isinstance(val, (int, float)):
                    costs[elem] = val
    return costs or None

def get_rarity(trait_id):
    rl, definer = resolve_field(trait_id, "RarityLevels")
    if isinstance(rl, dict):
        return sorted(k for k in rl.keys() if isinstance(k, str) and not is_unresolved(k))
    return []

def get_slot(trait_id):
    v, _ = resolve_field(trait_id, "Slot")
    return v if isinstance(v, str) else None

def classify_category(trait_id, god, fname, data, chain):
    if "CostumeTrait" in chain:
        return "NonStandard"  # cosmetic skin unlock, not a gameplay boon
    if fname in NPC_MARKER_FILES:
        return "NpcAlly"
    if fname == "TraitData_Duo.lua":
        return "StandardOlympian"  # duo boons combine two pool gods; still pantheon-sourced
    if "InPersonOlympianTrait" in chain or "LegacyTrait" in chain:
        return "NonStandard"  # one-off narrative cameo boon (Athena/Artemis/Dionysus), not pool content
    if fname == "TraitData_Elementals.lua":
        return "StandardOlympian" if god else "NonStandard"
    if god in pool_god_names:
        return "StandardOlympian"
    if fname in MECHANIC_ONLY_FILES:
        return "NonStandard"
    if fname == "TraitData_Hades.lua" or fname == "TraitData_Aspect.lua":
        return "NonStandard"
    return "NonStandard"

boons = {}
skipped_base_archetypes = []

for trait_id, data in ALL_DEFS.items():
    if not isinstance(data, dict):
        continue
    src = boon_source.get(trait_id)
    if src is None:
        # only defined in the base TraitData.lua -> a template/archetype
        # (BaseTrait, FireBoon, LegendaryTrait, SynergyTrait, UnityTrait, ...),
        # not itself an offerable boon. Exclude from the catalog, but keep a
        # record of what we excluded, for the validation report.
        base_line = base_trait_source.get(trait_id)
        skipped_base_archetypes.append({"id": trait_id, "source": "Scripts/TraitData.lua:%d" % base_line if base_line else None})
        continue
    fname, line = src
    chain = [trait_id] + inherit_chain(trait_id)

    god = FILE_TO_GOD.get(fname)
    duo_gods = None
    if fname == "TraitData_Duo.lua":
        duo_gods = parse_duo_gods(fname, line)
    elemental_god_comment = None
    if fname == "TraitData_Elementals.lua":
        elemental_god_comment = parse_elemental_god_comment(fname, line)
        god = elemental_god_comment  # best-effort, sourced from a comment, flagged below

    prereq = TraitRequirements.get(trait_id)
    prereq_line = prereq_source.get(trait_id)
    prereq_record = None
    if prereq is not None:
        prereq_record = {
            "expr": prereq,
            "source": "Scripts/TraitData.lua:%d" % prereq_line if prereq_line else "Scripts/TraitData.lua",
        }
    else:
        # inline GameStateRequirements HasNone-style negation counts as a prereq too
        gsr = data.get("GameStateRequirements")
        if isinstance(gsr, list) and any(isinstance(c, dict) and ("HasNone" in c or "Path" in c) for c in gsr):
            prereq_record = {
                "expr": {"GameStateRequirements": gsr},
                "source": "Scripts/%s:%d" % (fname, line),
                "note": "inline on the trait definition itself, not in the central TraitRequirements table",
            }

    text = text_bundle_raw.get(trait_id, {})

    icon, icon_definer = resolve_field(trait_id, "Icon")

    record = {
        "id": trait_id,
        "god": god,
        "duoGods": duo_gods,
        "name": text.get("displayName"),
        "descriptionRef": trait_id if trait_id in text_bundle_raw else None,
        "icon": icon if isinstance(icon, str) and not is_unresolved(icon) else None,
        "boonCategory": classify_category(trait_id, god, fname, data, chain),
        "godKind": ("PoolSlot" if god in pool_god_names else "NonPoolSlot") if god else None,
        "slot": get_slot(trait_id),
        "rarity": get_rarity(trait_id),
        "exclusiveGroup": get_exclusive_group(trait_id, data),
        "elementAffinity": get_element_affinity(trait_id),
        "elementCost": get_element_cost(trait_id, data),
        "prereq": prereq_record,
        "source": "Scripts/%s:%d" % (fname, line),
    }
    if elemental_god_comment:
        record["_godInferredFromComment"] = True
    boons[trait_id] = record

with open(OUT + "boons.json", "w") as f:
    json.dump(boons, f, indent=1, sort_keys=True)
    f.write("\n")

with open(OUT + "_skipped_base_archetypes.json", "w") as f:
    json.dump(skipped_base_archetypes, f, indent=1, sort_keys=True)
    f.write("\n")

print("H2 boon records:", len(boons), "skipped base archetypes:", len(skipped_base_archetypes))
