import glob, json, re, os, sys
from parse_text_bundle import parse_sjson_text_bundle, resolve_display_name
from render_text import descriptions_for, render_name
from line_index import index_keys_at_depth
import build_guard
import requirements

from config import out_dir, raw_dir, scripts_dir, text_dir

RAW = raw_dir()
OUT = out_dir("hades2")
SCRIPTS = scripts_dir("hades2")
TEXT_EN = text_dir("hades2")

# This comes before anything's read (& definitely before anything's written).
# Since the data below comes from a stored dump while the citations come from
# the actual installed game, those two have to be the same build or the output
# would describe neither.
try:
    build_guard.check("hades2")
except build_guard.BuildMismatch as mismatch:
    sys.exit("normalize_h2: %s" % mismatch)

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
# (not that there like ever would be one lol) is absorbed by re-running the
# extractor, which is the whole premise of extracting instead of transcribing.
# A hardcoded list would quietly emit nothing for a new god's boons while every
# validation check still passed, because an id nobody looked for cannot dangle.
# Sorted for determinism: later files overwrite earlier keys in the source
# index, so the order is part of the output.
TRAIT_FILES = sorted(os.path.basename(p) for p in glob.glob(SCRIPTS + "TraitData_*.lua"))
LOOT_FILES = sorted(os.path.basename(p) for p in glob.glob(SCRIPTS + "LootData_*.lua"))

# Stop here if the scripts directory is not the scripts directory.
# `index_keys_at_depth` answers `{}` for a file that isn't actually there, which
# is the right answer for an optional per-god file (a game shipping none of them
# isn't like an error) but it's silently fatal for the ones every citation
# depends on. Without this check, a mistyped path produces an empty source
# index, every trait then fails its `src is None` test and is reclassified as a
# base archetype, and the run writes `{}` over the catalog and exits 0. An empty
# glob is the same failure seen from the other side: the directory exists but
# holds no per-god trait files, so nothing would actually be read from it.
_missing = [f for f in ("TraitData.lua",) if not os.path.isfile(SCRIPTS + f)]
if _missing or not TRAIT_FILES:
    sys.exit(
        "normalize_h2: %s under %s\n"
        "Point EXTRACT_SCRIPTS_HADES2 at the game's Scripts directory."
        % ("no TraitData_*.lua files" if not _missing
           else "missing " + ", ".join(_missing), SCRIPTS)
    )

# id maps to (file, line)  (base TraitData.lua covers base archetypes, tracked separately)
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

# TraitRequirements entries all live inside TraitData.lua's
# `TraitRequirements = { ... }` table at 1-tab indent, which is the same file and
# depth the base_trait_source scan already covers. So we'll just yk reuse that
# index; it catches every 1-tab key in TraitData.lua, TraitRequirements' entries
# included (since they sit at the same tab-indentation level as the base archetypes and
# only differ by like section).
prereq_source = base_trait_source

# ---------------------------------------------------------------------------
# Text bundle (names + descriptions) — kept as a SEPARATE output file
# ---------------------------------------------------------------------------

text_bundle_raw = parse_sjson_text_bundle(TEXT_EN + "TraitText.en.sjson")
# This is a warning instead of being required bc the synthetic fixtures
# purposefully don't ship any text bundle but should still yk run. An actual
# extraction that reaches here empty would ermmm emit a whole catalog of
# `name: null`, which looks like data (albeit somewhat silly data lol).
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

# The keyword titles a description quotes are in a second file here, unlike
# Hades I where one file holds both. Read once and used for names as well:
# thirteen records write their name as markup rather than as a word.
keyword_bundle = parse_sjson_text_bundle(TEXT_EN + "HelpText.en.sjson")


def named(entry_id):
    return render_name(resolve_display_name(text_bundle_raw, entry_id), keyword_bundle)


# ---------------------------------------------------------------------------
# God records
# ---------------------------------------------------------------------------

# LootSetData is sectioned by god, but an `InheritFrom` entry names a bare id
# that can live in any section lol. Every <God>Upgrade inherits `BaseLoot`,
# which is under the `Loot` section and is where `GodLoot = true` is actually
# declared, so resolution goes through a union of every section's entries. This
# matters bc Poseidon and Zeus carry no literal `GodLoot` of their own rip and
# are pool gods purely through that inheritance, so reading the field directly
# off the record would show None for those two of the nine total gods here.
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


def inherits_from(entry_id, base, _visited=None, _depth=0):
    """Whether an entry inherits `base`, however many steps away it is.

    Walked rather than read off `InheritFrom` directly, to match how the flag it
    is tested beside gets resolved. The real file already nests one level deep —
    the stacked reward variants reach BaseLoot through StackUpgrade — so a god's
    table nesting the same way is a shape this data already has, and a direct
    read answers "no" for it. Answering "no" would be survivable. The near miss
    would not: the intermediate template passes instead and becomes the god,
    carrying its own id and no source.
    """
    if _depth > 6:
        return False
    _visited = _visited or set()
    if entry_id in _visited:
        return False
    _visited.add(entry_id)
    entry = LOOT_ENTRIES.get(entry_id)
    if not isinstance(entry, dict):
        return False
    parents = [p for p in (entry.get("InheritFrom") or []) if isinstance(p, str)]
    if base in parents:
        return True
    return any(inherits_from(p, base, _visited, _depth + 1) for p in parents)


def is_god_table(entry_id, entry):
    """Whether a LootSetData entry is a god who hands out boons.

    Every god's table inherits BaseLoot, and so do the mechanical slots, so that
    alone does not separate them. What does is that a god either keeps BaseLoot's
    GodLoot flag or has an NPC doing the offering. Hermes turns the flag off and
    has a speaker; the hammer turns it off and has nobody, since nothing hands a
    hammer over.

    This used to be the ten real god names written out, one per section. That
    worked against the installed game and made the whole pass invisible to
    everything else: the fixtures' gods are invented, and have to be, so nothing
    matched, gods.json came out empty, and every fixture boon was filed
    NonPoolSlot for a reason no test ever stated.
    """
    if not isinstance(entry, dict):
        return False
    if not inherits_from(entry_id, "BaseLoot"):
        return False
    return bool(resolve_loot_field(entry_id, "GodLoot")) or bool(entry.get("Speaker"))


# section name maps to the <God>Upgrade id inside it. The section is what
# actually names the god, which is worth taking over the entry id; Chaos hands
# gives their boons through the `TrialUpgrade` table and reading the section
# doesn't need any exception for that like reading the id would.
GOD_FILE_KEYS = {
    section_name: entry_id
    for section_name, section in sorted(LootSetData.items())
    if isinstance(section, dict)
    for entry_id, entry in sorted(section.items())
    if is_god_table(entry_id, entry)
}

gods = {}
pool_god_names = set()
for godname, upgradeId in GOD_FILE_KEYS.items():
    section = LootSetData.get(godname, {})
    data = section.get(upgradeId)
    if data is None:
        continue
    src = god_upgrade_source.get(upgradeId)
    # This is resolved instead of read; Hermes overrides BaseLoot's `true` with
    # `false` lol, and the rest either declare it or inherit it.
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

# Selene is a special case :moon: :moon:; grants Hexes via a SpellDrop
# interactable, not a standard <God>Upgrade table (see the Hades II token-pass finding).
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

# The mechanical "gods" (weapon upgrade, stack upgrade) are also in
# LootSetData.Loot. We'll include them but tag them distinctly bc they're yk not
# Olympians lol. Chaos isn't included here anymore bc their table counts as a
# god's under the test above, which reads the section name and so doesn't need
# an exception for the `TrialUpgrade` table.
for key in ["WeaponUpgrade", "StackUpgrade", "StackUpgradeBig", "StackUpgradeTriple"]:
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

with open(OUT + "gods.json", "w") as f:
    json.dump(gods, f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Keepsake records
# ---------------------------------------------------------------------------

# NPC id maps to god/character name, derived from each LootData_<God>.lua's
# `Speaker = "NPC_X_01"` field (a real field from game code lol, not invented).
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
# "<unresolved:...>" placeholder instead of a table; this is on purpose in order
# to denote that the reference existed without like inventing its contents.
# Since nothing here can be derived from it, the keepsake/NPC association is
# just yk empty :shrug: :shrug:.
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
    keepsakes[kid] = {
        "id": kid,
        "name": named(kid),
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
# Files named for a god but holding no single god's boons; duos belong to two and
# read their pair from a source comment, keepsakes belong to whoever gives them.
CROSS_GOD_TRAIT_FILES = {"TraitData_Duo.lua", "TraitData_Keepsake.lua"}

# `TraitData_<Name>.lua` names its god, so derive the map from the files that
# are actually present instead of like listing them. Listing was the older form;
# there won't be any new gods added in either game ofc, but if they were they'd
# be unattributed, which is the failure the file glob above already prevents.
# Every `TraitData_*` file has to fall in exactly one of the four buckets, so
# anything the three exclusion sets don't claim must be a god's file.
FILE_TO_GOD = {
    fname: fname[len("TraitData_"):-len(".lua")]
    for fname in TRAIT_FILES
    if fname not in MECHANIC_ONLY_FILES
    and fname not in NPC_MARKER_FILES
    and fname not in CROSS_GOD_TRAIT_FILES
}

# Every god name the extractor is willing to attribute a boon to. Both readers
# below recover a name from a hand-written source comment, which is the only
# place the data records these associations at all. A comment is prose and
# the patterns match any capitalised word, so without this set, a comment that
# happens to read `-- Deprecated: replaced in 1.3` yields `god = "Deprecated"`,
# which then decides godKind and boonCategory as confidently as a real name
# would. An unrecognised name must become an absent god, not a plausible one;
# an unattributed boon renders as unattributed, whereas an invented god renders
# as somebody's (only the latter is silently wrong).
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

def get_element_affinities(trait_id):
    """Every element base in the inherit chain, not only the first one found.

    The resolver this replaces returned on its first match, so a trait
    inheriting two affinity bases would have kept one and lost the other in
    silence. No shipped trait has two, which is precisely why the loss would
    never have been noticed. So every match comes back, and the caller fails the
    run rather than picking one.
    """
    chain = [trait_id] + inherit_chain(trait_id)
    return [ELEMENT_BASE_TRAITS[c] for c in chain if c in ELEMENT_BASE_TRAITS]

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
        return "StandardOlympian"  # duo boons combine two pool gods
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

# Which ids the player can't shed once the run has them. A keepsake swaps
# between regions, so anything a keepsake is or grants is temporary (and
# temporary blockers shouldn't be displayed as permanent ones).
REMOVABLE_BLOCKERS = set(keepsakes)
for _tid, _data in ALL_DEFS.items():
    if isinstance(_data, dict):
        _setup = _data.get("SetupFunction")
        _args = _setup.get("Args") if isinstance(_setup, dict) else None
        if isinstance(_args, dict) and isinstance(_args.get("TraitName"), str):
            REMOVABLE_BLOCKERS.add(_args["TraitName"])


# Which ids are a weapon form instead of something the run picks up. The aspects
# have their own table, which is the test used here; the resolved `Slot` field
# isn't bc it reaches the two templates the aspects inherit from and none of the
# aspects themselves.
def is_aspect(trait_id):
    return trait_id in ASPECT_DEFS

declared_negations = {}   # trait id map to ids it declares itself incompatible with
classified = {}           # trait id map to what its clauses came to

for trait_id, data in ALL_DEFS.items():
    if not isinstance(data, dict):
        continue
    src = boon_source.get(trait_id)
    if src is None:
        # Only defined in the base TraitData.lua; a template/archetype
        # (BaseTrait, FireBoon, LegendaryTrait, SynergyTrait, UnityTrait, ...)
        # isn't actually an offerable boon itself, so exclude from the catalog
        # but keep a record of what's been excluded (for the validation report).
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

    # Both halves are read and AND-ed. The old reader that was replaced by this
    # one just took the central entry when there was one and never looked at the
    # record's own `GameStateRequirements`, so nine records had one gate
    # suppressed by another. It also required the inline half to be a list,
    # which a dozen records actually write as a bare table instead. Between
    # them, those two tests dropped every Selene-duo gate in the game :pensive:
    # :pensive:.
    prereq_line = prereq_source.get(trait_id)
    central = requirements.classify_h2(TraitRequirements.get(trait_id), keepsakes)
    inline = requirements.classify_h2(data.get("GameStateRequirements"), keepsakes)
    clauses = requirements.Classified()
    clauses.absorb(central)
    clauses.absorb(inline)
    classified[trait_id] = clauses
    if clauses.negations:
        declared_negations[trait_id] = clauses.negations

    prereq = clauses.requirement()
    if central.requirements and prereq_line:
        prereq_citation = "Scripts/TraitData.lua:%d" % prereq_line
    elif prereq is not None:
        prereq_citation = "Scripts/%s:%d" % (fname, line)
    else:
        prereq_citation = None

    build_failures = [
        dict(f, stage="prereq") for f in clauses.unclassified
    ]
    if clauses.unclassified:
        # A record whose clauses didn't all get classified shouldn't ship a
        # requirement at all; half a gate just looks like a weaker gate, and the
        # run is going to fail anyway. The marker replaces it so nothing can
        # mistake the remains for a requirement.
        prereq = {"type": requirements.UNCLASSIFIED_MARKER}

    activation = None
    activation_clauses = requirements.classify_h2(data.get("ActivationRequirements"), keepsakes)
    build_failures += [dict(f, stage="activation") for f in activation_clauses.unclassified]
    # The activation gate's own discards belong in the report as much as the
    # prerequisite's do. Uncommon Grace carries the same rarity clause on both
    # and only one of the two was being counted, so the report said the class was
    # smaller than it is; which is yk bad bc that's the one question the report
    # literally exists to answer :sobbing: :sobbing:.
    clauses.discarded.extend(activation_clauses.discarded)
    if not activation_clauses.unclassified:
        activation = activation_clauses.requirement()

    affinities = get_element_affinities(trait_id)
    if len(set(affinities)) > 1:
        build_failures.append({
            "clause": {"elementAffinity": sorted(set(affinities))},
            "reason": "more than one element base in the inherit chain, and the field holds one",
            "stage": "elementAffinity",
        })


    icon, icon_definer = resolve_field(trait_id, "Icon")

    record = {
        "id": trait_id,
        "god": god,
        "duoGods": duo_gods,
        "name": named(trait_id),
        "descriptionRef": trait_id if trait_id in text_bundle_raw else None,
        "icon": icon if isinstance(icon, str) and not is_unresolved(icon) else None,
        "boonCategory": classify_category(trait_id, god, fname, data, chain),
        "godKind": ("PoolSlot" if god in pool_god_names else "NonPoolSlot") if god else None,
        "slot": get_slot(trait_id),
        "tier": None,
        "rarity": get_rarity(trait_id),
        "exclusiveGroup": None,
        "blockedBy": None,
        "aspectConflicts": None,
        "elementAffinity": affinities[0] if affinities else None,
        "prereq": prereq,
        # Where the gate was written, which isn't where the trait was. Hades
        # II keeps most prerequisites in one central table and the rest inline
        # on the record, so a citation that always named the record would be
        # wrong for most of them.
        "prereqSource": prereq_citation,
        "activation": activation,
        "source": "Scripts/%s:%d" % (fname, line),
    }
    if elemental_god_comment:
        record["_godInferredFromComment"] = True
    if build_failures:
        record["buildFailure"] = build_failures
    boons[trait_id] = record

# ---------------------------------------------------------------------------
# Selene's paired boons
# ---------------------------------------------------------------------------

# Nine records pair one of Selene's Hexes with one Olympian; the game files list
# them under Talents instead of beside the Hexes (which is why they read as
# god-less mechanic content). One half of their requirement is a real clause and
# one isn't; the gate on the Olympian is written out, while holding the matching
# Hex is carried by the inheritance and the name. That second half is derived
# here and the derivation actually checks itself (the god read from the name
# must agree with the god read from the gate, and the Hex id must exist) so a
# renamed record fails the run instead of likee quietly losing half its gate oops.
SELENE_PAIRED_MARKER = "SeleneDuosUnlocked"
SELENE_PAIRED_BASE = "SpellTalentTrait"

selene_paired = set()
for trait_id, record in boons.items():
    data = ALL_DEFS.get(trait_id) or {}
    gsr = data.get("GameStateRequirements")
    named = gsr.get("NamedRequirements") if isinstance(gsr, dict) else None
    if not (isinstance(named, list) and SELENE_PAIRED_MARKER in named):
        continue
    if SELENE_PAIRED_BASE not in inherit_chain(trait_id):
        continue

    gated_gods = sorted({n["god"] for n in requirements.walk(record["prereq"])
                         if n.get("kind") == "hasBoonFrom"})
    stem = trait_id[:-len("Talent")] if trait_id.endswith("Talent") else trait_id
    named_god = next((g for g in gated_gods if stem.endswith(g)), None)
    hex_id = "Spell%sTrait" % stem[:-len(named_god)] if named_god else None

    if len(gated_gods) != 1 or named_god is None or hex_id not in boons:
        record.setdefault("buildFailure", []).append({
            "clause": {"gatedGods": gated_gods, "derivedHex": hex_id},
            "reason": "a paired Selene boon whose god and Hex could not be read back from the data",
            "stage": "prereq",
        })
        continue

    selene_paired.add(trait_id)
    record["god"] = named_god
    record["godKind"] = "PoolSlot" if named_god in pool_god_names else "NonPoolSlot"
    record["prereq"] = requirements.all_of([
        requirements.has_trait(hex_id),
        record["prereq"],
    ])

# ---------------------------------------------------------------------------
# What a negation actually is (decided once every declaration is known)
# ---------------------------------------------------------------------------

exclusive_groups, blocked_by, aspect_conflicts, dropped_edges, no_duplicate_gates = requirements.resolve_negations(
    declared_negations,
    removable=REMOVABLE_BLOCKERS,
    # Nothing is out of scope here (whereas Hades I drops anything touching a
    # Daedalus hammer). That's an asymmetry instead of a difference between
    # the games; Hades II's weapon-upgrade traits are the same mechanic under
    # another name and one pair of them does actually ship a real exclusive
    # group. Both of its members are out of scope themselves (so nothing renders
    # wrongly yay) and the filter is left unwritten until something depends on
    # it instead of like just idk guessing it rn ig o_0.
    is_out_of_scope=lambda tid: False,
    is_aspect=is_aspect,
)
for trait_id, group in exclusive_groups.items():
    boons[trait_id]["exclusiveGroup"] = group
for trait_id, blockers in blocked_by.items():
    boons[trait_id]["blockedBy"] = blockers
for trait_id, aspects in aspect_conflicts.items():
    boons[trait_id]["aspectConflicts"] = aspects

# ---------------------------------------------------------------------------
# Ladder depth
# ---------------------------------------------------------------------------

# A duo belongs to two gods, an element-gated boon belongs to none of the
# ladders, and one of Selene's paired boons is connected to an Olympian's page
# the way a duo does instead of like just yk standing on a rung of that god's
# ladder like the others. Everything else with a god sits on one.
LADDER_IDS = {
    tid for tid, rec in boons.items()
    if rec["god"] and not rec["duoGods"] and tid not in selene_paired
    and "UnityTrait" not in ([tid] + inherit_chain(tid))
}
tiers, tier_cycles = requirements.compute_tiers(
    {tid: rec["prereq"] for tid, rec in boons.items()},
    {tid: rec["god"] for tid, rec in boons.items()},
    LADDER_IDS,
)
for trait_id, tier in tiers.items():
    boons[trait_id]["tier"] = tier
for cycle in tier_cycles:
    boons[cycle[0]].setdefault("buildFailure", []).append({
        "clause": {"cycle": cycle},
        "reason": "a prerequisite cycle, which leaves the ladder depth undefined",
        "stage": "tier",
    })

with open(OUT + "boons.json", "w") as f:
    json.dump(boons, f, indent=1, sort_keys=True)
    f.write("\n")

with open(OUT + "_skipped_base_archetypes.json", "w") as f:
    json.dump(skipped_base_archetypes, f, indent=1, sort_keys=True)
    f.write("\n")

with open(OUT + "_clause_report.json", "w") as f:
    json.dump(requirements.clause_report(boons, classified, dropped_edges, no_duplicate_gates),
              f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Codex descriptions
# ---------------------------------------------------------------------------
# All 129 keywords the shipped descriptions reference resolve out of the keyword
# bundle read beside the trait text above.

descriptions = descriptions_for(
    [rec["descriptionRef"] for rec in boons.values() if rec["descriptionRef"]],
    text_bundle_raw,
    keyword_bundle,
)
with open(OUT + "descriptions.json", "w") as f:
    json.dump(descriptions, f, indent=1, sort_keys=True, ensure_ascii=False)
    f.write("\n")

# ---------------------------------------------------------------------------
# Mirror talents
# ---------------------------------------------------------------------------
# Hades II replaces the Mirror with Arcana and no boon prerequisite in the
# extraction references one, so these are empty rather than absent: a consumer
# asking either game the same question should get a list, not a missing file.

with open(OUT + "talents.json", "w") as f:
    json.dump({}, f, indent=1, sort_keys=True)
    f.write("\n")

with open(OUT + "mirror_rows.json", "w") as f:
    json.dump({}, f, indent=1, sort_keys=True)
    f.write("\n")

print("H2 boon records:", len(boons), "skipped base archetypes:", len(skipped_base_archetypes))
print("H2 descriptions:", len(descriptions))
