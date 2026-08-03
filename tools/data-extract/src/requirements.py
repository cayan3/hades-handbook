"""Turning the games' requirement clauses into the engine's requirement trees.

Both games express eligibility as declarative tables, and both mix two
different questions into one field: "can this build ever reach this boon" and
"should the game roll this boon as a reward right now". Only the first is a
requirement the app can evaluate; the second describes the moment of the offer
and is worthless to a planner -- worse than worthless, because a boon gated on
"the current room has no Devotion reward" would render as unreachable forever.

So every clause lands in exactly one of four buckets:

  * a **requirement** -- one of the engine's atoms, ANDed with the rest;
  * a **negation** -- an id that must not be held, which is not a requirement
    at all but a separate feasibility edge, resolved by the caller once every
    record's declarations are known (symmetry can't be judged one record at a
    time);
  * an **offer-time gate** -- recognised and deliberately dropped, with the
    reason recorded so the drop is auditable rather than silent;
  * **unclassified** -- a shape nobody has decided about, which fails the run.

That last bucket is the whole point. A clause the extractor does not recognise
is either a new idiom a patch introduced or an old one somebody missed, and
both must be loud: silently keeping it puts a value that is not a requirement
where a requirement goes, and silently dropping it turns a gated boon into an
apparently free one. The catalog is the one artifact nothing downstream can
audit, so the only place this can be caught is here.

The requirement shapes are the engine's own, emitted as plain dicts with a
`kind` discriminator.
"""

import json


# ---------------------------------------------------------------------------
# Requirement constructors
# ---------------------------------------------------------------------------

def has_trait(trait):
    return {"kind": "hasTrait", "trait": trait}


def has_boon_from(god):
    # No count: every producer either game has asks for one boon of the god,
    # and the atom is satisfied by holding any of them.
    return {"kind": "hasBoonFrom", "god": god}


def has_element(element, count):
    return {"kind": "hasElement", "element": element, "count": count}


def has_keepsake(keepsake):
    return {"kind": "hasKeepsake", "keepsake": keepsake}


def has_talent(talent):
    return {"kind": "hasTalent", "talent": talent}


def all_of(parts):
    """AND the parts, collapsing the degenerate cases.

    An `all` with one child evaluates exactly as that child does, and an `all`
    with none is not a gate at all. Emitting either would put a node in the
    tree that the view has to draw and the reader has to skip.

    Nested `all`s are flattened and identical siblings collapsed for the same
    reason. AND is associative, so `all[all[a, b], c]` and `all[a, b, c]` are
    the same predicate -- but they are not the same drawing, and a record whose
    two halves both demand the same boon should say so once. Merging the
    central and inline halves produces both shapes constantly.
    """
    flat = []
    for part in parts:
        if part is None:
            continue
        if part.get("kind") == "all":
            flat.extend(part["of"])
        else:
            flat.append(part)
    unique = []
    seen = set()
    for part in flat:
        key = _canonical(part)
        if key not in seen:
            seen.add(key)
            unique.append(part)
    if not unique:
        return None
    if len(unique) == 1:
        return unique[0]
    return {"kind": "all", "of": unique}


def _canonical(node):
    """A stable rendering of a node, for telling two siblings apart."""
    return json.dumps(node, sort_keys=True)


def any_of(parts, minimum=1):
    parts = [p for p in parts if p is not None]
    if not parts:
        return None
    if minimum <= 1 and len(parts) == 1:
        return parts[0]
    return {"kind": "anyOf", "min": minimum, "of": parts}


def one_of_ids(ids):
    """`OneOf = {a, b, c}` -- hold any one of these traits."""
    members = [i for i in ids if isinstance(i, str)]
    return any_of([has_trait(i) for i in members])


def one_from_each_set(sets):
    """`OneFromEachSet = {{...}, {...}}` -- one from each of several lists."""
    return all_of([one_of_ids(s) for s in sets if isinstance(s, list)])


def walk(requirement):
    """Yield every node of a requirement tree, parents before children."""
    if not isinstance(requirement, dict):
        return
    yield requirement
    for child in requirement.get("of") or []:
        yield from walk(child)


def referenced_trait_ids(requirement):
    """Every trait id a requirement tree names.

    Traits only, because this is also what ladder depth is computed from and a
    keepsake is not a rung.
    """
    return {n["trait"] for n in walk(requirement) if n.get("kind") == "hasTrait"}


def referenced_catalog_ids(requirement):
    """Every id a requirement names that the catalog is expected to carry.

    Keepsakes belong here as well as traits: a gate naming a keepsake that does
    not exist is unsatisfiable forever, exactly as a dangling trait is, and
    checking only one of the two would leave the other free to rot.

    Mirror talents are deliberately absent. They are run state chosen outside
    the run, not catalog records, so there is nothing here for them to dangle
    against -- the validator would report every one of them as missing.
    """
    ids = referenced_trait_ids(requirement)
    ids |= {n["keepsake"] for n in walk(requirement) if n.get("kind") == "hasKeepsake"}
    return ids


# ---------------------------------------------------------------------------
# Classification results
# ---------------------------------------------------------------------------

class Classified:
    """What one record's clauses came to.

    `negations` holds blocker ids rather than requirement nodes on purpose:
    whether an id is a symmetric exclusion, a one-directional block or a
    no-duplicate gate cannot be told from the declaring record alone, so the
    decision is deferred to a pass that can see every declaration.
    """

    def __init__(self):
        self.requirements = []
        self.negations = []
        self.discarded = []
        self.unclassified = []

    def requirement(self):
        return all_of(self.requirements)

    def keep(self, node):
        if node is not None:
            self.requirements.append(node)

    def block(self, trait_id):
        if isinstance(trait_id, str) and trait_id not in self.negations:
            self.negations.append(trait_id)

    def drop(self, clause, reason):
        self.discarded.append({"clause": _summarise(clause), "reason": reason})

    def refuse(self, clause, reason):
        self.unclassified.append({"clause": _summarise(clause), "reason": reason})

    def absorb(self, other):
        self.requirements.extend(other.requirements)
        for b in other.negations:
            self.block(b)
        self.discarded.extend(other.discarded)
        self.unclassified.extend(other.unclassified)


def _summarise(clause):
    """A short, stable rendering of a clause for a report a human reads.

    Whole clauses are kept rather than just their key, because "an unrecognised
    Path" is not actionable and "an unrecognised Path ending in ActiveBounty"
    is. Trimmed so one malformed record cannot flood the report.
    """
    if isinstance(clause, dict):
        return {k: clause[k] for k in sorted(clause)[:6]}
    return clause


# ---------------------------------------------------------------------------
# Hades II
# ---------------------------------------------------------------------------

# The prefixes of `Path`/`PathTrue`/`PathFalse` that describe when the game
# rolls a reward rather than what a build can reach. Every one of these was
# read off the shipped data and checked individually; the list is explicit
# rather than a catch-all so that a path nobody has seen still fails.
H2_OFFER_TIME_PATHS = {
    ("CurrentRun", "CurrentRoom"): "the room's own reward state",
    ("CurrentRun", "LastReward"): "what the previous reward was",
    ("CurrentRun", "BiomesReached"): "how far this run has got",
    ("CurrentRun", "IsDreamRun"): "which run mode is being played",
    ("CurrentRun", "ActiveBounty"): "which bounty is active",
    ("CurrentRun", "TextLinesRecord"): "which conversations have played",
    ("CurrentRun", "SpecialInteractRecord"): "which interactables were used",
    ("CurrentRun", "DeathDefianceDamageBoonEligible"): "a transient eligibility flag",
    ("CurrentRun", "Hero", "EligiblePrevRunTraits"): "what last run left behind",
    ("CurrentRun", "Hero", "SlottedTraits"): "which slots are empty right now",
    ("PrevRun",): "the previous run",
    ("GameState",): "save-file progression, which is assumed complete",
}

# Weapon gating. A trait that only exists for one weapon is not gated in any
# sense a build planner cares about -- the weapon is chosen before the run and
# the trait simply does not exist for the others. Kept separate from the list
# above because the reason is different and the population is large.
H2_WEAPON_PATHS = {
    ("CurrentRun", "Hero", "Weapons"): "the weapon this trait belongs to",
}

# Requirement-shaped keys that carry no gate: offer weighting, and the
# save-file unlocks that the app assumes are all unlocked.
H2_OFFER_TIME_KEYS = {
    "PriorityChance": "reward weighting, not a gate",
    "NamedRequirements": "a save-file unlock, which is assumed granted",
    "FunctionName": "an engine predicate over transient state",
    "FunctionArgs": "arguments to an engine predicate",
}

BASE_ELEMENTS = ("Air", "Water", "Earth", "Fire")

UNRESOLVED_PREFIX = "<unresolved:"

# The reason string a clause gets when its members never resolved at dump time.
# Named because the validator matches on it: normalizing the clause away would
# otherwise make the defect invisible, and an exemption that stops being able
# to see its own defect is worse than no exemption.
UNRESOLVED_REASON = "a clause whose members did not resolve when the game data was dumped"


def _is_unresolved(value):
    return isinstance(value, str) and value.startswith(UNRESOLVED_PREFIX)


def _comparison(clause):
    return clause.get("Comparison"), clause.get("Value")


def _h2_path_clause(clause, key, path, out, keepsakes):
    """Classify one `Path`/`PathTrue`/`PathFalse` clause by where it points."""
    for prefix, reason in H2_OFFER_TIME_PATHS.items():
        if tuple(path[:len(prefix)]) == prefix:
            out.drop(clause, reason)
            return
    for prefix, reason in H2_WEAPON_PATHS.items():
        if tuple(path[:len(prefix)]) == prefix:
            out.drop(clause, reason)
            return

    head = tuple(path[:4])

    # A god in MetGods means a boon of that god is currently held -- the game
    # rebuilds the table from the held traits on every change, so purging a
    # god's last boon takes it back out. The key names the god's loot table
    # (`ApolloUpgrade`) while every god record is keyed on the bare name, so
    # the suffix has to come off. A god id that does not exist raises nothing
    # anywhere downstream: the member lookup answers an unknown god with an
    # empty list, and the gate would sit permanently unsatisfiable with nothing
    # to show the player.
    if head[:3] == ("CurrentRun", "Hero", "MetGods") and len(path) >= 4:
        god = path[3]
        out.keep(has_boon_from(god[:-len("Upgrade")] if god.endswith("Upgrade") else god))
        return

    if head[:3] == ("CurrentRun", "Hero", "Elements") and len(path) >= 4:
        comparison, value = _comparison(clause)
        if comparison == ">=" and isinstance(value, (int, float)):
            out.keep(has_element(path[3], value))
        else:
            out.refuse(clause, "an element threshold that is not a lower bound")
        return

    # "the largest single element count is at least N" is the same predicate as
    # "some element is at least N". Aether is excluded because the field counts
    # base elements, which is what its name says.
    if head[:3] == ("CurrentRun", "Hero", "HighestBaseElementCount"):
        comparison, value = _comparison(clause)
        if comparison == ">=" and isinstance(value, (int, float)):
            out.keep(any_of([has_element(e, value) for e in BASE_ELEMENTS]))
        else:
            out.refuse(clause, "an element threshold that is not a lower bound")
        return

    # A rarity count describes what the game will offer, not what a build can
    # reach: every rarity is upgradeable during a run, so the clause can never
    # make a build impossible.
    if head[:3] == ("CurrentRun", "Hero", "GodBoonRarities"):
        out.drop(clause, "a rarity count, which a run can always change")
        return

    if head[:3] == ("CurrentRun", "Hero", "TraitDictionary"):
        named = path[3] if len(path) >= 4 else None
        if named is not None:
            # A named id under TraitDictionary is a single positive or negative
            # trait test. Keepsakes live in the same dictionary as boons, so
            # which atom this is depends on which table the id is in.
            if key == "PathTrue":
                out.keep(has_keepsake(named) if named in keepsakes else has_trait(named))
            elif key == "PathFalse":
                out.block(named)
            else:
                out.refuse(clause, "a named trait path with no truth test")
            return
        _h2_trait_dictionary_list(clause, out)
        return

    out.refuse(clause, "an unrecognised path")


def _h2_trait_dictionary_list(clause, out):
    """The list forms of a TraitDictionary test: hold all, any, or none.

    `HasNone` is a generic "this list-valued path contains none of these"
    primitive, and what it means depends entirely on the `Path` beside it:
    against the trait dictionary it is a real trait-vs-trait negation, but
    against the current room it is a reward-state flag naming no trait at all.
    That is why the path is classified first and only this branch, reached
    through the trait-dictionary path, treats a member list as trait ids.
    """
    handled = False
    if isinstance(clause.get("HasAll"), list):
        out.keep(all_of([has_trait(i) for i in clause["HasAll"] if isinstance(i, str)]))
        handled = True
    if isinstance(clause.get("HasAny"), list):
        out.keep(one_of_ids(clause["HasAny"]))
        handled = True
    if isinstance(clause.get("HasNone"), list):
        for i in clause["HasNone"]:
            out.block(i)
        handled = True
    if not handled:
        out.refuse(clause, "a trait-dictionary test with no member list")


def classify_h2_clause(clause, out, keepsakes):
    if not isinstance(clause, dict):
        out.refuse(clause, "a clause that is not a table")
        return

    # `OrRequirements` is a list of AND-groups, any one of which suffices.
    if isinstance(clause.get("OrRequirements"), list):
        branches = []
        for group in clause["OrRequirements"]:
            branch = Classified()
            for inner in group if isinstance(group, list) else [group]:
                classify_h2_clause(inner, branch, keepsakes)
            # A branch that reduces to a negation or a discard cannot be ORed
            # with anything -- there is no negation in the requirement type and
            # nothing to OR a dropped gate against.
            if branch.negations or branch.unclassified or branch.requirement() is None:
                out.refuse(clause, "an alternative branch that is not a requirement")
                return
            out.discarded.extend(branch.discarded)
            branches.append(branch.requirement())
        out.keep(any_of(branches))
        return

    for key, reason in H2_OFFER_TIME_KEYS.items():
        if key in clause:
            out.drop({key: clause[key]}, reason)

    # A member list that came back as a dumper placeholder is not an empty
    # gate, it is a gate whose contents were lost -- and normalizing it away
    # would take the evidence with it, leaving a record that looks ungated.
    for key in ("OneOf", "OneFromEachSet", "HasAll", "HasAny", "HasNone"):
        if _is_unresolved(clause.get(key)):
            out.refuse({key: clause[key]}, UNRESOLVED_REASON)
            return

    if isinstance(clause.get("OneOf"), list):
        out.keep(one_of_ids(clause["OneOf"]))
    if isinstance(clause.get("OneFromEachSet"), list):
        out.keep(one_from_each_set(clause["OneFromEachSet"]))

    for key in ("Path", "PathTrue", "PathFalse"):
        path = clause.get(key)
        if isinstance(path, list):
            _h2_path_clause(clause, key, [p for p in path if isinstance(p, str)], out, keepsakes)

    # `IsNone`/`IsAny` only ever appear beside a `Path` that has already been
    # classified above; `NotHasAll` likewise. They are named here so that one
    # appearing on its own is refused rather than ignored.
    for key in ("IsNone", "IsAny", "NotHasAll", "HasAll", "HasAny", "HasNone"):
        if key in clause and not isinstance(clause.get("Path"), list):
            out.refuse(clause, "a membership test with no path to test against")

    known = {
        "OrRequirements", "OneOf", "OneFromEachSet", "Path", "PathTrue", "PathFalse",
        "IsNone", "IsAny", "NotHasAll", "HasAll", "HasAny", "HasNone",
        "Comparison", "Value", "UseLength", "Count",
    } | set(H2_OFFER_TIME_KEYS)
    for key in clause:
        if key in known:
            continue
        # A Lua table with both an array part and named keys dumps its array
        # entries under their numeric index, so a digit key is a nested clause
        # rather than a field of this one.
        if key.isdigit() and isinstance(clause[key], dict):
            classify_h2_clause(clause[key], out, keepsakes)
            continue
        out.refuse({key: clause[key]}, "an unrecognised clause key")


def classify_h2(expr, keepsakes):
    """Classify one record's requirement table, central or inline.

    Both containers reach here: the central table is a single mapping, while an
    inline `GameStateRequirements` is usually a list of clauses ANDed together
    but is a bare mapping on a dozen records. Accepting both is what stops the
    dozen from being dropped for their container's shape.
    """
    out = Classified()
    if expr is None:
        return out
    for clause in expr if isinstance(expr, list) else [expr]:
        classify_h2_clause(clause, out, keepsakes)
    return out


# ---------------------------------------------------------------------------
# Hades I
# ---------------------------------------------------------------------------

# Requirement-shaped keys on a Hades I trait that describe the offer rather
# than the build. Weapon gates dominate: they sit on hammer upgrades and on
# weapon aspects, both of which name the weapon they belong to.
H1_OFFER_TIME_KEYS = {
    "RequiredWeapon": "the weapon this trait belongs to",
    "RequiredWeapons": "the weapons this trait belongs to",
    "RequiredFalseRewardType": "what the room is currently offering",
    "RequiredFalseRooms": "which rooms have been visited",
    "RequiredBiome": "where in the run the player is",
    "RequiredMaxDepth": "how deep the run has got",
    "RequiredMaxBiomeDepth": "how deep into a region the run has got",
    "RequiredMinMaxHealthAmount": "the run's current health, which changes freely",
    "RequiredMinMaximumLastStands": "how many death defiances the run holds",
    "RequiredNoChallengeSwitchInRoom": "what the current room contains",
    "RequiredCosmetics": "house decorations, which are not run state",
    "RequiredTextLines": "which conversations have played",
    "PriorityChance": "reward weighting, not a gate",
}

# Hades I marks its Call slot `Shout`. The clause asks whether anything is
# slotted there, which is a real build prerequisite -- a Call is picked up
# during the run and kept -- but there is no atom for "any trait in slot X".
# It expands into the disjunction it means, over the slot's own members, so it
# is recomputed from the data on every run rather than listed by hand.
H1_SLOT_CLAUSE = "RequiredSlottedTrait"


def classify_h1_inline(data, out, slot_members):
    """Classify the requirement-shaped fields on a Hades I trait definition."""
    for key, reason in H1_OFFER_TIME_KEYS.items():
        if key in data:
            out.drop({key: data[key]}, reason)

    trait = data.get("RequiredTrait")
    if isinstance(trait, str):
        out.keep(has_trait(trait))

    one = data.get("RequiredOneOfTraits")
    if isinstance(one, list):
        out.keep(one_of_ids(one))

    slot = data.get(H1_SLOT_CLAUSE)
    if isinstance(slot, str):
        members = slot_members.get(slot) or []
        if members:
            out.keep(any_of([has_trait(m) for m in members]))
        else:
            out.refuse({H1_SLOT_CLAUSE: slot}, "a slot with no members to expand into")

    # Which talent is selected at the Mirror is fixed before the run and cannot
    # change during it, so an unmet one is never merely pending. Which talents
    # are *unlocked* is a different fact and stays out of scope.
    talent = data.get("RequiredMetaUpgradeSelected")
    if isinstance(talent, str):
        out.keep(has_talent(talent))

    for key in ("RequiredFalseTrait", "RequiredFalseTraits"):
        value = data.get(key)
        if isinstance(value, str):
            out.block(value)
        elif isinstance(value, list):
            for i in value:
                out.block(i)


def classify_h1_linked(expr, out):
    """Classify one `<God>Upgrade.LinkedUpgrades` entry."""
    if not isinstance(expr, dict):
        out.refuse(expr, "a linked-upgrade entry that is not a table")
        return
    for key, reason in H1_OFFER_TIME_KEYS.items():
        if key in expr:
            out.drop({key: expr[key]}, reason)
    if isinstance(expr.get("OneOf"), list):
        out.keep(one_of_ids(expr["OneOf"]))
    if isinstance(expr.get("OneFromEachSet"), list):
        out.keep(one_from_each_set(expr["OneFromEachSet"]))
    known = {"OneOf", "OneFromEachSet"} | set(H1_OFFER_TIME_KEYS)
    for key in expr:
        if key not in known:
            out.refuse({key: expr[key]}, "an unrecognised linked-upgrade key")


# Every key either game's classifier reads. The validator censuses the raw
# dumps against this set so that a requirement-shaped key nobody consumes is
# reported rather than invisible -- the population of clauses has twice been
# measured by listing the idioms somebody remembered.
CONSUMED_CLAUSE_KEYS = (
    {"OrRequirements", "OneOf", "OneFromEachSet", "Path", "PathTrue", "PathFalse",
     "IsNone", "IsAny", "NotHasAll", "HasAll", "HasAny", "HasNone",
     "Comparison", "Value", "UseLength", "Count"}
    | set(H2_OFFER_TIME_KEYS)
    | set(H1_OFFER_TIME_KEYS)
    | {"RequiredTrait", "RequiredOneOfTraits", H1_SLOT_CLAUSE,
       "RequiredMetaUpgradeSelected", "RequiredFalseTrait", "RequiredFalseTraits"}
    # The containers themselves, which are read rather than being gates.
    | {"GameStateRequirements", "ActivationRequirements", "LinkedUpgrades"}
)


# ---------------------------------------------------------------------------
# The report of what was dropped and what refused to classify
# ---------------------------------------------------------------------------

def clause_report(boons, classified, dropped_edges, no_duplicate_gates):
    """What the classifier did with everything it did not turn into a gate.

    A discarded clause leaves no trace on the record it came from, so without
    this the only way to tell "this boon has no prerequisite" from "this boon's
    prerequisite was thrown away" is to go back to the raw dump. Discards are
    grouped by reason because the useful question is "what class of thing is
    being dropped, and did that class grow", not the individual clause.

    This is a report about an extraction rather than data an app reads, so it
    is deliberately not part of what ships.
    """
    discarded = {}
    for trait_id, clauses in sorted(classified.items()):
        for entry in clauses.discarded:
            bucket = discarded.setdefault(entry["reason"], {"count": 0, "ids": []})
            bucket["count"] += 1
            if trait_id not in bucket["ids"]:
                bucket["ids"].append(trait_id)

    failures = []
    for trait_id, record in sorted(boons.items()):
        for entry in record.get("buildFailure") or []:
            failures.append(dict(entry, id=trait_id))

    return {
        "buildFailures": failures,
        "buildFailureCount": len(failures),
        "discardedClausesByReason": discarded,
        "negationEdgesDropped": dropped_edges,
        "noDuplicateGates": no_duplicate_gates,
        "exclusiveGroupCount": sum(1 for r in boons.values() if r.get("exclusiveGroup")),
        "blockedByEdgeCount": sum(len(r.get("blockedBy") or []) for r in boons.values()),
        "aspectConflictEdgeCount": sum(len(r.get("aspectConflicts") or []) for r in boons.values()),
    }


# ---------------------------------------------------------------------------
# Ladder depth
# ---------------------------------------------------------------------------

def compute_tiers(prereqs, god_of, ladder_ids):
    """How deep each boon sits in its own god's prerequisite ladder.

    Depth counts only prerequisites belonging to the same god, because the
    ladder is what one god's page draws: a boon needing a second god's boon is
    not one rung higher, it is off the ladder entirely.

    **The rung is the cheapest way in, not the dearest.** A rung number means
    "reaching this needs at least one boon of the rung below", so it has to be
    measured along the path that actually gets you there. A boon reachable
    through any one of three others is on the rung above the *shallowest* of
    them: taking the deepest as the answer would put it several rows below the
    point where it becomes available, and would claim a prerequisite at the
    rung below that it does not have.

    So a disjunction costs what its cheapest satisfying branch costs -- or,
    when it asks for several, what the last of the cheapest few costs -- while
    a conjunction costs its dearest child, since all of them are needed. A
    branch that can be satisfied without any of this god's boons costs nothing,
    which is what puts a boon gated on "a Cast from anyone" on the first rung
    of every god's ladder rather than partway up one.

    Anything outside `ladder_ids` -- cross-god boons and the element-gated
    ones -- gets no depth at all rather than a misleading zero, and the view
    places those separately.

    Returns (depths, cycles). A cycle leaves depth undefined, so it is reported
    rather than resolved; the caller fails the run on it.
    """
    depths = {}
    cycles = []
    visiting = []

    def cost(node, home):
        """Rungs of `home`'s own ladder that satisfying this node demands."""
        if not isinstance(node, dict) or home is None:
            return 0
        kind = node.get("kind")
        if kind == "hasTrait":
            trait = node["trait"]
            return depth_of(trait) if god_of.get(trait) == home else 0
        if kind == "hasBoonFrom":
            # Any boon of the god, and the cheapest of those is the first rung.
            return 1 if node.get("god") == home else 0
        if kind == "all":
            return max((cost(c, home) for c in node.get("of") or []), default=0)
        if kind == "anyOf":
            branches = sorted(cost(c, home) for c in node.get("of") or [])
            if not branches:
                return 0
            wanted = max(1, min(node.get("min", 1), len(branches)))
            return branches[wanted - 1]
        # Elements, keepsakes, talents and aspects are not rungs of any ladder.
        return 0

    def depth_of(trait_id):
        if trait_id in depths:
            return depths[trait_id]
        if trait_id in visiting:
            cycles.append(visiting[visiting.index(trait_id):] + [trait_id])
            return 1
        visiting.append(trait_id)
        depth = 1 + cost(prereqs.get(trait_id), god_of.get(trait_id))
        visiting.pop()
        depths[trait_id] = depth
        return depth

    return {t: depth_of(t) for t in sorted(ladder_ids)}, cycles


# ---------------------------------------------------------------------------
# Negation edges
# ---------------------------------------------------------------------------

UNCLASSIFIED_MARKER = "UNCLASSIFIED_NEGATION"


def resolve_negations(declared, removable, is_out_of_scope, is_aspect):
    """Split every declared negation into the four things it can be.

    Takes `declared` as {holder: [blocker, ...]} and answers
    (exclusive_groups, blocked_by, aspect_conflicts, dropped), because none of
    them can be decided from a single record:

      * a declaration naming its own trait is a "do not offer a duplicate"
        gate, not an exclusion of anything;
      * a blocker that is a weapon aspect is not a trait the run holds at all
        -- the aspect is equipped rather than picked up, so this is a conflict
        with the weapon form, which the run answers from a different fact;
      * a pair that names each other is a symmetric mutual exclusion, and at
        most one of the group is ever held;
      * anything else is one-directional -- taking the blocked trait first
        leaves both held -- which is a different feasibility verdict and must
        not be recorded as mutual.

    A one-directional block may only be reported as permanent when the blocker
    cannot leave the player's possession. `removable` names the blockers that
    can, and their edges are dropped: reporting one would tell a player their
    build is impossible because of a keepsake they can swap out next region.
    """
    edges = set()
    self_gates = []
    for holder, blockers in declared.items():
        for blocker in blockers:
            if blocker == holder:
                self_gates.append(holder)
            else:
                edges.add((holder, blocker))

    exclusive_groups = {}
    blocked_by = {}
    aspect_conflicts = {}
    dropped = []
    for holder, blocker in sorted(edges):
        # Scope is tested before symmetry, not after. An edge on content the
        # release does not model is not a constraint whichever direction it
        # runs in, and testing symmetry first would let the same content back
        # in through the exclusive-group half.
        if is_out_of_scope(holder) or is_out_of_scope(blocker):
            dropped.append({"holder": holder, "blocker": blocker,
                            "reason": "an edge on content this release does not model"})
            continue
        # Anything touching a weapon form is settled here, before symmetry.
        # An aspect is equipped rather than picked up, so neither of the two
        # fields below can carry it: both mean "the run holds this", and a run
        # never holds an aspect. A block naming one would look for it among the
        # traits held and never find it, leaving a real constraint permanently
        # inert; a mutual exclusion would be the same mistake symmetrically,
        # which is why symmetry cannot be allowed to see these first.
        if is_aspect(holder) or is_aspect(blocker):
            if is_aspect(holder) and is_aspect(blocker):
                # A run has exactly one weapon form, so one cannot rule out
                # another -- the edge says nothing the model does not know.
                dropped.append({"holder": holder, "blocker": blocker,
                                "reason": "an edge between two weapon forms, and a run has one"})
            elif is_aspect(blocker):
                aspect_conflicts.setdefault(holder, set()).add(blocker)
            else:
                # The declaration runs the other way: a weapon form saying it
                # is not offered alongside some trait. The form is chosen
                # before the run, when nothing is held yet, so there is no
                # moment at which this could gate anything. Reading it in
                # reverse -- as the trait being blocked by the form -- would be
                # inventing an edge the data does not state.
                dropped.append({"holder": holder, "blocker": blocker,
                                "reason": "a weapon form, which is chosen before anything is held"})
            continue
        if (blocker, holder) in edges:
            exclusive_groups.setdefault(holder, set()).update({holder, blocker})
            continue
        if blocker in removable:
            dropped.append({"holder": holder, "blocker": blocker,
                            "reason": "a blocker the run can shed, so it can never be permanent"})
        else:
            blocked_by.setdefault(holder, set()).add(blocker)

    return (
        {k: sorted(v) for k, v in exclusive_groups.items()},
        {k: sorted(v) for k, v in blocked_by.items()},
        {k: sorted(v) for k, v in aspect_conflicts.items()},
        dropped,
        sorted(set(self_gates)),
    )
