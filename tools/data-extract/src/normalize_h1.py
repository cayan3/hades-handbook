import json, re, os, sys
from parse_text_bundle import parse_sjson_text_bundle, resolve_display_name
from render_text import descriptions_for, render_name
from line_index import index_keys_at_depth, find_key_anywhere
import build_guard
import requirements

from config import out_dir, raw_dir, scripts_dir, text_dir

RAW = raw_dir()
OUT = out_dir("hades1")
SCRIPTS = scripts_dir("hades1")
TEXT_EN = text_dir("hades1")

# This comes before anything's read (& definitely before anything's written).
# Since the data below comes from a stored dump while the citations come from
# the actual installed game, those two have to be the same build or the output
# would describe neither.
try:
    build_guard.check("hades1")
except build_guard.BuildMismatch as mismatch:
    sys.exit("normalize_h1: %s" % mismatch)

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
# file makes `index_keys_at_depth` answer `{}` instead of raise, so without
# this the run would carry on with no citations at all :pensive: :pensive:. It
# currently happens to die a few lines below on the text bundle instead o_0
# (which is luck, not a check 0_o).
_missing = [f for f in ("TraitData.lua", "LootData.lua") if not os.path.isfile(SCRIPTS + f)]
if _missing:
    sys.exit(
        "normalize_h1: missing %s under %s\n"
        "Point EXTRACT_SCRIPTS_HADES1 at the game's Scripts directory."
        % (", ".join(_missing), SCRIPTS)
    )

boon_source = index_keys_at_depth(SCRIPTS + "TraitData.lua", 1)          # trait id -> line, in TraitData.lua
god_upgrade_source = index_keys_at_depth(SCRIPTS + "LootData.lua", 1)     # <God>Upgrade id -> line

# Several TraitData.lua entries use two-space indent instead of a tab (seems
# like an inconsistency in the source file itself lol); this gets their line
# numbers individually instead of changing the main scan (which gives false
# positives on unrelated nested fields at coincidentally-matching indent).
for _tid in TraitData.keys():
    if _tid not in boon_source:
        _line = find_key_anywhere(SCRIPTS + "TraitData.lua", _tid)
        if _line:
            boon_source[_tid] = _line

# LinkedUpgrades entries are nested three tabs deep inside each god's LootData
# block (see the earlier spike: `\t\t\tKeyName =\n\t\t\t{\n\t\t\t\tOneOf = ...`).
linked_upgrade_source = index_keys_at_depth(SCRIPTS + "LootData.lua", 3)

# ---------------------------------------------------------------------------
# Text bundle~ Hades I doesn't have a dedicated TraitText file; boon/god names
# and descriptions live in HelpText.en.sjson (actually confirmed, not assumed).
# ---------------------------------------------------------------------------

text_bundle_raw = parse_sjson_text_bundle(TEXT_EN + "HelpText.en.sjson")
# This is a warning instead of being required bc the synthetic fixtures
# purposefully don't ship any text bundle but should still yk run. An actual
# extraction that reaches here empty would ermmm emit a whole catalog of
# `name: null`, which looks like data (albeit somewhat silly data lol).
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

# Chaos is the only god whose table is not named after it.
GOD_TABLE_NAMES = {"TrialUpgrade": "Chaos"}


def god_name_of(upgrade_id):
    if upgrade_id in GOD_TABLE_NAMES:
        return GOD_TABLE_NAMES[upgrade_id]
    return upgrade_id[:-len("Upgrade")] if upgrade_id.endswith("Upgrade") else upgrade_id


def is_god_table(upgrade_id, data):
    """Whether a LootData entry is a god who hands out boons.

    Every god's table inherits BaseLoot, but so do the mechanical slots, so that
    alone does not separate them. What does is that a god either keeps BaseLoot's
    GodLoot flag or has an NPC doing the offering. Hermes turns the flag off and
    has a speaker; the Daedalus hammer turns it off and has nobody, since nothing
    hands a hammer over.

    This used to be the ten names written out. That worked against the real files
    and made the entire pass invisible to everything else, so every fixture —
    whose gods are invented, and have to be — ran the LootData half of this file
    as a no-op and froze the silence into the golden as correct.
    """
    if not isinstance(data, dict):
        return False
    if "BaseLoot" not in (data.get("InheritFrom") or []):
        return False
    return bool(resolve_loot_field(upgrade_id, "GodLoot")) or bool(data.get("Speaker"))


GOD_UPGRADE_IDS = {
    god_name_of(upgrade_id): upgrade_id
    for upgrade_id, data in sorted(LootData.items())
    if is_god_table(upgrade_id, data)
}

gods = {}
pool_god_names = set()
god_trait_membership = {}  # trait id maps to god name (from each god's Traits/WeaponUpgrades/PriorityUpgrades lists)
# trait id maps to every god whose table offers it. Membership above only keeps
# the first god, which is all the mislabelling check wants; ownership has to keep
# them all bc being offered by two tables is yk literally what a Duo is.
god_trait_owners = {}
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
                god_trait_owners.setdefault(tid, set()).add(godname)
    # A gated boon is listed under the god who gates it instead of in any of the
    # above lists, so LinkedUpgrades is the other half of ownership and carries
    # every boon (including Duos) with a prerequisite that's offered by the god.
    for tid in data.get("LinkedUpgrades") or {}:
        if isinstance(tid, str):
            god_trait_owners.setdefault(tid, set()).add(godname)
    line = god_upgrade_source.get(upgradeId)
    text = text_bundle_raw.get(godname, {})
    gods[godname] = {
        "id": upgradeId,
        "name": text.get("displayName") or godname,
        "kind": "PoolSlot" if is_pool else "NonPoolSlot",
        "iconKey": data.get("Icon"),
        "source": "%sLootData.lua:%d" % (REL_SCRIPTS, line) if line else "%sLootData.lua" % REL_SCRIPTS,
    }

# This is just the same claim but from the other end: several traits name the
# table that grants them instead of being listed in the table itself. It's the
# only signal for six of them & agrees with the tables wherever both methods
# are used & no trait it names is claimed by a second god, so this fills in the
# gaps without like inventing Duos or something.
_KNOWN_GOD_TABLES = set(GOD_UPGRADE_IDS.values())
for tid, data in TraitData.items():
    if not isinstance(data, dict):
        continue
    source = data.get("LootSource")
    if isinstance(source, str) and source in _KNOWN_GOD_TABLES:
        god_trait_owners.setdefault(tid, set()).add(god_name_of(source))

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
    keepsakes[tid] = {
        "id": tid,
        "name": resolve_display_name(text_bundle_raw, tid),
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
# Hades I doesn't have any LinkedTraitData-style pre-declared "core boons"
# constant the way Hades II does (confirmed during the spike: it repeats id
# lists inline instead of factoring them into a named set), so there's nothing
# directly equivalent to emit here. We still emit each god's LootData.lua trait-
# membership lists (PriorityUpgrades/WeaponUpgrades/Traits) since those *are*
# literally named groupings seen in the data, just serving a different
# purpose (e.g. menu ordering/weapon-slot pool) than a prerequisite-set alias.

named_sets = {}
for godname, upgradeId in GOD_UPGRADE_IDS.items():
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

# ---------------------------------------------------------------------------
# Mirror talents and the rows they oppose each other in
# ---------------------------------------------------------------------------
# A talent has no trait record, so the ids a gate names are recoverable only
# here. MetaUpgradeOrder states the pairing outright; a row is keyed by its
# first member rather than by a name, the file giving its rows none.

MetaUpgradeData = load("h1_MetaUpgradeData.json") if os.path.exists(RAW + "h1_MetaUpgradeData.json") else {}
MetaUpgradeOrder = load("h1_MetaUpgradeOrder.json") if os.path.exists(RAW + "h1_MetaUpgradeOrder.json") else []
talent_source = index_keys_at_depth(SCRIPTS + "MetaUpgradeData.lua", 1)
order_line = find_key_anywhere(SCRIPTS + "MetaUpgradeData.lua", "MetaUpgradeOrder")

talents = {}
mirror_rows = {}
for pair in MetaUpgradeOrder:
    members = [m for m in pair if isinstance(m, str)]
    if len(members) != 2:
        continue
    mirror_rows[members[0]] = {
        "members": members,
        "source": ("%sMetaUpgradeData.lua:%d" % (REL_SCRIPTS, order_line) if order_line
                   else "%sMetaUpgradeData.lua" % REL_SCRIPTS),
    }
    for tid in members:
        data = MetaUpgradeData.get(tid) or {}
        icon = data.get("Icon")
        line = talent_source.get(tid)
        talents[tid] = {
            "id": tid,
            "name": render_name(resolve_display_name(text_bundle_raw, tid), text_bundle_raw),
            "icon": icon if isinstance(icon, str) and not is_unresolved(icon) else None,
            "source": "%sMetaUpgradeData.lua:%d" % (REL_SCRIPTS, line) if line else None,
        }

with open(OUT + "talents.json", "w") as f:
    json.dump(talents, f, indent=1, sort_keys=True)
    f.write("\n")

with open(OUT + "mirror_rows.json", "w") as f:
    json.dump(mirror_rows, f, indent=1, sort_keys=True)
    f.write("\n")

print("H1 gods:", len(gods), "keepsakes:", len(keepsakes), "named_sets:", len(named_sets))
print("H1 talents:", len(talents), "mirror rows:", len(mirror_rows))

# ---------------------------------------------------------------------------
# Prerequisite index: every LinkedUpgrades entry across every god's LootData
# block, keyed by trait id (a trait id can appear in more than one god's
# LinkedUpgrades block (e.g. Duo-flavoured requirements offered from either
# parent's pool) so must collect all occurrences).
# ---------------------------------------------------------------------------

prereq_occurrences = {}  # trait id maps to list of {expr, definingGod, source}
for godname, upgradeId in GOD_UPGRADE_IDS.items():
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

ASSIST_RE = re.compile(r'^([A-Za-z]+)Assist')

def inherit_chain_h1(trait_id, _visited=None, _depth=0):
    if _depth > 8 or trait_id in (_visited or set()):
        return []
    _visited = set(_visited or set())
    _visited.add(trait_id)
    data = TraitData.get(trait_id)
    if not isinstance(data, dict):
        return []
    parents = [p for p in data.get("InheritFrom") or [] if isinstance(p, str)]
    chain = list(parents)
    for p in parents:
        chain.extend(inherit_chain_h1(p, _visited, _depth + 1))
    return chain

# A Daedalus hammer upgrade. Its pool is derived from the weapon itself instead
# of listed in any loot table & hammers aren't actually modelled in v1, so a
# negation edge that touches one isn't actually a constraint this catalog
# carries (at least rn).
def is_hammer(trait_id):
    return "WeaponTrait" in inherit_chain_h1(trait_id)

# A weapon aspect. Two aspects of the same weapon already exclude each other
# since a run uses exactly one weapon/aspect, so an edge between them wouldn't
# record anything the model doesn't already know.
def is_aspect(trait_id):
    return "WeaponEnchantmentTrait" in inherit_chain_h1(trait_id)

# What can be held in each slot (for the clause that asks if a slot is filled
# instead of just naming a trait). This is built from the data itself yay (even
# though game code isn't likely to be dramatically changed in the future lol).
# Records with no display name are left out where a text bundle was read at
# all: they're templates and support traits the player never picks up, so
# putting one in a requirement would show the player a branch with no name on
# it. This condition matters bc the synthetic fixtures don't ship any text
# bundle on purpose and every record there is in fact nameless.
slot_members = {}
for _tid, _data in sorted(TraitData.items()):
    if not isinstance(_data, dict):
        continue
    _slot = resolve_field_h1(_tid, "Slot")
    if not isinstance(_slot, str):
        continue
    if text_bundle_raw and not (text_bundle_raw.get(_tid) or {}).get("displayName"):
        continue
    slot_members.setdefault(_slot, []).append(_tid)

boons = {}
skipped_keepsakes_in_main_catalog = []
declared_negations = {}
classified = {}

# A keepsake swaps out between regions, so nothing a keepsake is or grants can
# block a build for the rest of a run. Hades I grants exactly one trait this
# way; the edge it produces is dropped and the validator watches for a second.
REMOVABLE_BLOCKERS = set(keepsakes)
for _tid, _data in TraitData.items():
    if isinstance(_data, dict):
        _setup = _data.get("SetupFunction")
        _args = _setup.get("Args") if isinstance(_setup, dict) else None
        if isinstance(_args, dict) and isinstance(_args.get("TraitName"), str):
            REMOVABLE_BLOCKERS.add(_args["TraitName"])

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

    # Who grants it. There are three signals (some are better than others lol).
    #
    # Two tables offering the same boon is what a Hades I Duo *is*. The game
    # doesn't have a separate Duo id space, so e.g. being gated by both Ares and
    # Artemis is the only thing that makes a boon both of "theirs".
    #
    # If that signal isn't in the code, the declared field wins (it's just left
    # alone even where it's wrong; e.g. two records name Zeus for boons
    # Demeter's table offers and correcting that here would put the extraction
    # permanently at odds with its source rip). The mislabelling check reports
    # them and the overlay fixes them, which keeps the disagreement visible
    # instead of just yk quietly absorbed into the void rip.
    #
    # If both of those signals aren't there, there's a single owning table that
    # can fill the gap, which covers most of this file's actual reach: a boon
    # offered behind a prerequisite is listed under the god who gates it and
    # carries no `God` field at all.
    declared = data.get("God")
    owners = sorted(god_trait_owners.get(tid, ()))
    if len(owners) == 2:
        duo_gods, god = owners, None
    else:
        duo_gods = None
        god = declared if isinstance(declared, str) else (owners[0] if owners else None)

    boon_category = None
    m = ASSIST_RE.match(tid)
    if duo_gods:
        # A Duo is listed under both (i.e. exactly two) pool gods.
        boon_category = ("StandardOlympian" if all(g in pool_god_names for g in duo_gods)
                         else "NonStandard")
    elif m and god is None:
        boon_category = "NpcAlly"
    elif god in pool_god_names:
        boon_category = "StandardOlympian"
    elif god is not None:
        boon_category = "NonStandard"  # Hermes, Chaos
    else:
        boon_category = "NonStandard"

    clauses = requirements.Classified()
    requirements.classify_h1_inline(data, clauses, slot_members, keepsakes)

    # A trait can be offered from more than one god's pool and each pool
    # states its own condition. Twenty-eight traits are listed twice and every
    # one of them repeats the same condition verbatim, so this always collapses
    # to a single requirement. If two pools ever disagreed, meeting either one
    # is what earns the offer so they're OR-ed instead of AND-ed. Getting that
    # backwards would turn an alternative into an additional demand :pensive: :pensive:.
    linked_occurrences = prereq_occurrences.get(tid) or []
    branches = []
    for occurrence in linked_occurrences:
        branch = requirements.Classified()
        requirements.classify_h1_linked(occurrence.get("expr"), branch, keepsakes)
        clauses.discarded.extend(branch.discarded)
        clauses.unclassified.extend(branch.unclassified)
        if branch.requirement() is not None:
            branches.append(branch.requirement())
    distinct = []
    for branch in branches:
        if branch not in distinct:
            distinct.append(branch)
    clauses.keep(requirements.any_of(distinct))

    classified[tid] = clauses
    if clauses.negations:
        declared_negations[tid] = clauses.negations

    prereq = clauses.requirement()
    build_failures = [dict(f, stage="prereq") for f in clauses.unclassified]
    if clauses.unclassified:
        prereq = {"type": requirements.UNCLASSIFIED_MARKER}

    if linked_occurrences and branches:
        prereq_citation = linked_occurrences[0]["source"]
    elif prereq is not None:
        prereq_citation = "%sTraitData.lua:%d" % (REL_SCRIPTS, line)
    else:
        prereq_citation = None

    icon = resolve_field_h1(tid, "Icon")

    record = {
        "id": tid,
        "god": god,
        # Hades I doesn't have a distinct Duo-boon id space, so the pair of
        # tables offering a boon is what names its two gods.
        "duoGods": duo_gods,
        "name": resolve_display_name(text_bundle_raw, tid),
        "descriptionRef": tid if tid in text_bundle_raw else None,
        "icon": icon if isinstance(icon, str) and not is_unresolved(icon) else None,
        "boonCategory": boon_category,
        "godKind": ("PoolSlot" if god in pool_god_names else "NonPoolSlot") if god else None,
        "slot": get_slot_h1(tid),
        "tier": None,
        "rarity": get_rarity_h1(tid),
        "exclusiveGroup": None,
        "blockedBy": None,
        "aspectConflicts": None,
        "elementAffinity": None,   # Hades I doesn't yk have an elemental-infusion mechanic
        "prereq": prereq,
        "prereqSource": prereq_citation,
        "activation": None,        # Hades I also has no Infusions lol (so no boons have like a second threshold to meet or anything)
        "source": "%sTraitData.lua:%d" % (REL_SCRIPTS, line),
    }
    if build_failures:
        record["buildFailure"] = build_failures
    boons[tid] = record

# ---------------------------------------------------------------------------
# What a negation actually is (decided once every declaration is known)
# ---------------------------------------------------------------------------

exclusive_groups, blocked_by, aspect_conflicts, dropped_edges, no_duplicate_gates = requirements.resolve_negations(
    declared_negations,
    removable=REMOVABLE_BLOCKERS,
    is_out_of_scope=is_hammer,
    is_aspect=is_aspect,
)
for tid, group in exclusive_groups.items():
    boons[tid]["exclusiveGroup"] = group
for tid, blockers in blocked_by.items():
    boons[tid]["blockedBy"] = blockers
for tid, aspects in aspect_conflicts.items():
    boons[tid]["aspectConflicts"] = aspects

# ---------------------------------------------------------------------------
# Ladder depth
# ---------------------------------------------------------------------------

# Hades I marks a duo by inheritance instead of by rarity and a duo belongs
# to two gods, so it's actually on neither god's ladder.
LADDER_IDS = {
    tid for tid, rec in boons.items()
    if rec["god"] and "SynergyTrait" not in inherit_chain_h1(tid)
}
tiers, tier_cycles = requirements.compute_tiers(
    {tid: rec["prereq"] for tid, rec in boons.items()},
    {tid: rec["god"] for tid, rec in boons.items()},
    LADDER_IDS,
)
for tid, tier in tiers.items():
    boons[tid]["tier"] = tier
for cycle in tier_cycles:
    boons[cycle[0]].setdefault("buildFailure", []).append({
        "clause": {"cycle": cycle},
        "reason": "a prerequisite cycle, which leaves the ladder depth undefined",
        "stage": "tier",
    })

with open(OUT + "boons.json", "w") as f:
    json.dump(boons, f, indent=1, sort_keys=True)
    f.write("\n")

with open(OUT + "_clause_report.json", "w") as f:
    json.dump(requirements.clause_report(boons, classified, dropped_edges, no_duplicate_gates),
              f, indent=1, sort_keys=True)
    f.write("\n")

# ---------------------------------------------------------------------------
# Codex descriptions
# ---------------------------------------------------------------------------
# Hades I keeps its keyword titles in the same file as its trait text, so the
# bundle resolves its own references. Only the refs a record names are rendered;
# the rest of the file is the whole game's help text.

descriptions = descriptions_for(
    [rec["descriptionRef"] for rec in boons.values() if rec["descriptionRef"]],
    text_bundle_raw,
    text_bundle_raw,
)
with open(OUT + "descriptions.json", "w") as f:
    json.dump(descriptions, f, indent=1, sort_keys=True, ensure_ascii=False)
    f.write("\n")

print("H1 boon records:", len(boons), "excluded (keepsakes, emitted separately):", len(skipped_keepsakes_in_main_catalog))
print("H1 descriptions:", len(descriptions))
