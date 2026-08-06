"""Turning the games' requirement clauses into the engine's requirement trees.

Both games express eligibility as declarative tables, and both mix two
different questions into one field: "can this build ever reach this boon" and
"should the game roll this boon as a reward right now". Only the first is a
requirement the app can actually evaluate. The second describes the moment of
the offer and is ermmm basically useless to a planner; or even worse than
useless lol since a boon gated on "the current room has no Devotion reward"
would just render as unreachable like literally forever.

This means every clause lands in exactly one of four buckets:

  * a **requirement**: one of the engine's atoms, AND-ed with the rest;
  * a **negation**: an id that must not be held. Not a requirement at all but a
    separate feasibility edge, which the caller resolves once every record's
    declarations are known (symmetry can't be judged one record at a time);
  * an **offer-time gate**: recognized and deliberately dropped, with the reason
    recorded so the drop can be audited instead of just likeee idk happening ig lol;
  * **unclassified**: a shape nobody has decided about, which fails the run.

That last bucket is ermm only yk the whole point lolol. A clause the extractor
doesn't recognize is either a new idiom a patch introduced or an old one
somebody missed; either way, it should be loud. If it's quietly kept, a value
that's not actually a requirement would end up where a requirement goes; on the
other hand, quietly dropping it would make a gated boon turn into an allegedly
free one. Nothing downstream can audit the catalog, so this is the only place
to catch it :salute: :salute:.

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
    # No count bc every producer either game has asks for one boon of the god
    # and the atom is satisfied by yk just holding any of them.
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
    with none is not a gate at all. Emitting either puts a node in the tree that
    the view has to draw and the reader has to skip past.

    Nested `all`s get flattened and identical siblings collapsed, for the same
    reason. AND is associative, so `all[all[a, b], c]` and `all[a, b, c]` are
    the same predicate, but they are not the same drawing, and a record whose
    two halves both demand the same boon should say so once. Merging the central
    and inline halves throws up both shapes constantly.
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


def trait_or_keepsake(named, keepsakes):
    """The atom for an id a gate names, which depends on where that id lives.

    Both games keep keepsakes in the same id space as boons and gate on them the
    same way, so the clause on its own cannot say which atom it wants. The
    keepsake table is what decides. This matters because the two atoms read
    different facts: a boon is held, a keepsake is equipped. A gate that says
    `hasTrait` about a keepsake goes looking for it in the one place it is never
    recorded, which is a prerequisite nothing can ever meet.
    """
    return has_keepsake(named) if named in (keepsakes or ()) else has_trait(named)


def one_of_ids(ids, keepsakes=()):
    """`OneOf = {a, b, c}` — hold any one of these traits."""
    members = [i for i in ids if isinstance(i, str)]
    return any_of([trait_or_keepsake(i, keepsakes) for i in members])


def one_from_each_set(sets, keepsakes=()):
    """`OneFromEachSet = {{...}, {...}}` — one from each of several lists."""
    return all_of([one_of_ids(s, keepsakes) for s in sets if isinstance(s, list)])


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


def referenced_keepsake_ids(requirement):
    """Every keepsake id a requirement names."""
    return {n["keepsake"] for n in walk(requirement) if n.get("kind") == "hasKeepsake"}


def referenced_catalog_ids(requirement):
    """Every id a requirement names that the catalog is expected to carry.

    Keepsakes belong here alongside traits. A gate naming a keepsake that does
    not exist is unsatisfiable forever, exactly as a dangling trait is, and
    checking only one of the two leaves the other free to rot.

    Mirror talents are deliberately absent. They are run state chosen outside
    the run rather than catalog records, so there is nothing here for them to
    dangle against, and the validator would report every one of them as missing.

    Callers that check ids against a specific table want the two kept apart —
    see the pair of functions above. Resolving a `hasTrait` against the
    keepsakes as well is what let four gates name a keepsake through the wrong
    atom and still look like live references.
    """
    return referenced_trait_ids(requirement) | referenced_keepsake_ids(requirement)


# ---------------------------------------------------------------------------
# Classification results
# ---------------------------------------------------------------------------

class Classified:
    """What one record's clauses came to.

    `negations` holds blocker ids rather than requirement nodes, deliberately.
    You cannot tell from the declaring record alone whether an id is a symmetric
    exclusion, a one-directional block or a no-duplicate gate, so that decision
    waits for a pass that can see every declaration at once.
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
    """A short, stable rendering of a clause, for a report a human reads.

    Whole clauses rather than just their key, because "an unrecognised Path" is
    not something anyone can act on and "an unrecognised Path ending in
    ActiveBounty" is. Trimmed so one malformed record cannot flood the report.
    """
    if isinstance(clause, dict):
        return {k: clause[k] for k in sorted(clause)[:6]}
    return clause


# ---------------------------------------------------------------------------
# Hades II
# ---------------------------------------------------------------------------

# The `Path`/`PathTrue`/`PathFalse` prefixes that describe when the game rolls a
# reward, instead of what a build can reach. These were read off the shipped
# data and checked by hand. The list is explicit instead of being a catch-all,
# so a path nobody has seen would still fail.
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

# Weapon gating. A trait that only exists for one weapon isn't gated in any
# way that a build planner actually cares about; the weapon is chosen before
# the run, and for the other weapons the trait just yk simply doesn't exist lol.
# Kept separate from the list above bc the reason differs and the population is
# large.
H2_WEAPON_PATHS = {
    ("CurrentRun", "Hero", "Weapons"): "the weapon this trait belongs to",
}

# Requirement-shaped keys that carry no gate: offer weighting, and the engine
# predicates that ask a transient question.
H2_OFFER_TIME_KEYS = {
    "PriorityChance": "reward weighting, not a gate",
    "FunctionName": "an engine predicate over transient state",
    "FunctionArgs": "arguments to an engine predicate",
}

# `NamedRequirements` is read by value instead of being dropped by key. The key
# only says that some named condition applies; the name itself decides whether
# that condition constrains a build, and the answers differ. Two of the three
# are save-file unlocks, which the app assumes granted. The third is run state
# that moves during a run, so it describes the moment of the offer. Dropping the
# key entirely would have kept working while quietly covering both, and would go
# on covering a name that is neither.
H2_NAMED_REQUIREMENTS = {
    "SeleneDuosUnlocked": "a save-file unlock, which is assumed granted",
    "ChaosLegacyTraitsAvailable": "a save-file unlock, which is assumed granted",
    "MissingLastStand": "the run's death defiances, which it can regain",
}

BASE_ELEMENTS = ("Air", "Water", "Earth", "Fire")

UNRESOLVED_PREFIX = "<unresolved:"

# The reason string a clause gets when its members never resolved at dump time.
# It has a name because the validator matches on it. Normalizing the clause away
# would make the defect invisible, and an exemption that can no longer see its
# own defect is ermmm worse than no exemption at all :smile: :smile:.
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

    # A god in MetGods means a boon of that god is currently held. The game
    # rebuilds the table from the held traits on every change, so purging a
    # god's last boon takes that god back out again. The key names the god's
    # loot table (`ApolloUpgrade`) while every god record is keyed on the bare
    # name, so the suffix has to come off. Getting it wrong doesn't raise
    # anything downstream: the member lookup answers an unknown god with an
    # empty list, and the gate would permanently be unsatisfiable with nothing
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
    # base elements, which is yk what its name says.
    if head[:3] == ("CurrentRun", "Hero", "HighestBaseElementCount"):
        comparison, value = _comparison(clause)
        if comparison == ">=" and isinstance(value, (int, float)):
            out.keep(any_of([has_element(e, value) for e in BASE_ELEMENTS]))
        else:
            out.refuse(clause, "an element threshold that is not a lower bound")
        return

    # A rarity count describes what the game will offer, not what a build can
    # reach; every rarity is upgradeable during a run, so the clause can never
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
                out.keep(trait_or_keepsake(named, keepsakes))
            elif key == "PathFalse":
                out.block(named)
            else:
                out.refuse(clause, "a named trait path with no truth test")
            return
        _h2_trait_dictionary_list(clause, out, keepsakes)
        return

    out.refuse(clause, "an unrecognised path")


def _h2_trait_dictionary_list(clause, out, keepsakes=()):
    """The list forms of a TraitDictionary test: hold all, any, or none.

    `HasNone` is a generic "this list-valued path contains none of these"
    primitive, and what it means depends entirely on the `Path` sitting beside
    it. Against the trait dictionary it is a real trait-versus-trait negation.
    Against the current room it is a reward-state flag naming no trait at all.
    That is why the path gets classified first, and why this branch — reached
    only through the trait-dictionary path — is the one place a member list is
    read as trait ids.
    """
    handled = False
    if isinstance(clause.get("HasAll"), list):
        out.keep(all_of([trait_or_keepsake(i, keepsakes) for i in clause["HasAll"] if isinstance(i, str)]))
        handled = True
    if isinstance(clause.get("HasAny"), list):
        out.keep(one_of_ids(clause["HasAny"], keepsakes))
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
    # This is handled first, and then execution carries on down the rest of the
    # chain instead of returning. The bottom of this function is what refuses a
    # key nobody has classified, so returning here would exempt every clause
    # that happens to carry an alternation from the one check that keeps the
    # table closed; an unrecognised key beside an `OrRequirements` would vanish,
    # where the same key on its own stops the run. `OrRequirements` is itself in
    # `known` below, so falling through doesn't read it twice.
    if isinstance(clause.get("OrRequirements"), list):
        branches = []
        for group in clause["OrRequirements"]:
            branch = Classified()
            for inner in group if isinstance(group, list) else [group]:
                classify_h2_clause(inner, branch, keepsakes)
            # A branch that reduces to a negation or a discard can't be OR-ed
            # with anything; the requirement type doesn't have a negation, and
            # also a dropped gate leaves nothing to OR against.
            if branch.negations or branch.unclassified or branch.requirement() is None:
                out.refuse(clause, "an alternative branch that is not a requirement")
                return
            out.discarded.extend(branch.discarded)
            branches.append(branch.requirement())
        out.keep(any_of(branches))

    for key, reason in H2_OFFER_TIME_KEYS.items():
        if key in clause:
            out.drop({key: clause[key]}, reason)

    if "NamedRequirements" in clause:
        named = clause["NamedRequirements"]
        for name in named if isinstance(named, list) else [named]:
            reason = H2_NAMED_REQUIREMENTS.get(name)
            if reason is None:
                out.refuse({"NamedRequirements": name},
                           "a named requirement nobody has classified")
            else:
                out.drop({"NamedRequirements": name}, reason)

    # A member list that came back as a dumper placeholder isn't an empty gate.
    # Instead, it's a gate whose contents were lost, and normalizing it away
    # would take the evidence with it, leaving a record that looks ungated.
    for key in ("OneOf", "OneFromEachSet", "HasAll", "HasAny", "HasNone"):
        if _is_unresolved(clause.get(key)):
            out.refuse({key: clause[key]}, UNRESOLVED_REASON)
            return

    if isinstance(clause.get("OneOf"), list):
        out.keep(one_of_ids(clause["OneOf"], keepsakes))
    if isinstance(clause.get("OneFromEachSet"), list):
        out.keep(one_from_each_set(clause["OneFromEachSet"], keepsakes))

    for key in ("Path", "PathTrue", "PathFalse"):
        path = clause.get(key)
        if isinstance(path, list):
            _h2_path_clause(clause, key, [p for p in path if isinstance(p, str)], out, keepsakes)

    # `IsNone`/`IsAny` only ever appear beside a `Path` that's already been
    # classified above; same for `NotHasAll`. They're named here so that one
    # appearing on its own is refused instead of ignored.
    for key in ("IsNone", "IsAny", "NotHasAll", "HasAll", "HasAny", "HasNone"):
        if key in clause and not isinstance(clause.get("Path"), list):
            out.refuse(clause, "a membership test with no path to test against")

    known = {
        "OrRequirements", "NamedRequirements",
        "OneOf", "OneFromEachSet", "Path", "PathTrue", "PathFalse",
        "IsNone", "IsAny", "NotHasAll", "HasAll", "HasAny", "HasNone",
        "Comparison", "Value", "UseLength", "Count",
    } | set(H2_OFFER_TIME_KEYS)
    for key in clause:
        if key in known:
            continue
        # A Lua table with both an array part and named keys dumps its array
        # entries under their numeric index, so a digit key is a nested clause
        # instead of a field of this one.
        if key.isdigit() and isinstance(clause[key], dict):
            classify_h2_clause(clause[key], out, keepsakes)
            continue
        out.refuse({key: clause[key]}, "an unrecognised clause key")


def classify_h2(expr, keepsakes):
    """Classify one record's requirement table, central or inline.

    Both containers land here. The central table is a single mapping; an inline
    `GameStateRequirements` is usually a list of clauses ANDed together, but on
    about a dozen records it is a bare mapping. Accepting both shapes is what
    stops those dozen being dropped over their container.
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

# Requirement-shaped keys on a Hades I trait that describe the offer instead of
# the build. Weapon gates dominate here :salute: :salute:: they sit on hammer
# upgrades and on weapon aspects, both of which name the weapon they belong to.
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
# slotted there, which is a real build prerequisite (a Call is picked up during
# the run and yk kept lol), but there isn't an atom for "any trait in slot X".
# So it expands into the disjunction it means, over the slot's own members,
# which also means it's recomputed from the data on every run instead of listed
# by hand.
H1_SLOT_CLAUSE = "RequiredSlottedTrait"


def classify_h1_inline(data, out, slot_members, keepsakes=()):
    """Classify the requirement-shaped fields on a Hades I trait definition."""
    for key, reason in H1_OFFER_TIME_KEYS.items():
        if key in data:
            out.drop({key: data[key]}, reason)

    trait = data.get("RequiredTrait")
    if isinstance(trait, str):
        out.keep(trait_or_keepsake(trait, keepsakes))

    one = data.get("RequiredOneOfTraits")
    if isinstance(one, list):
        out.keep(one_of_ids(one, keepsakes))

    slot = data.get(H1_SLOT_CLAUSE)
    if isinstance(slot, str):
        members = slot_members.get(slot) or []
        if members:
            out.keep(any_of([has_trait(m) for m in members]))
        else:
            out.refuse({H1_SLOT_CLAUSE: slot}, "a slot with no members to expand into")

    # Which talent is selected at the Mirror is fixed before the run and can't
    # change during it, so an unmet one is never just pending. Which talents
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


def classify_h1_linked(expr, out, keepsakes=()):
    """Classify one `<God>Upgrade.LinkedUpgrades` entry."""
    if not isinstance(expr, dict):
        out.refuse(expr, "a linked-upgrade entry that is not a table")
        return
    for key, reason in H1_OFFER_TIME_KEYS.items():
        if key in expr:
            out.drop({key: expr[key]}, reason)
    if isinstance(expr.get("OneOf"), list):
        out.keep(one_of_ids(expr["OneOf"], keepsakes))
    if isinstance(expr.get("OneFromEachSet"), list):
        out.keep(one_from_each_set(expr["OneFromEachSet"], keepsakes))
    known = {"OneOf", "OneFromEachSet"} | set(H1_OFFER_TIME_KEYS)
    for key in expr:
        if key not in known:
            out.refuse({key: expr[key]}, "an unrecognised linked-upgrade key")


# Every key either game's classifier reads. The validator censuses the raw dumps
# against this set, so a requirement-shaped key nobody consumes gets reported
# rather than staying invisible. Twice now, the population of clauses has been
# "measured" by listing the idioms somebody remembered lol.
CONSUMED_CLAUSE_KEYS = (
    {"OrRequirements", "NamedRequirements",
     "OneOf", "OneFromEachSet", "Path", "PathTrue", "PathFalse",
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

    A discarded clause leaves no trace on the record it came from. Without this
    report, telling "this boon has no prerequisite" apart from "this boon's
    prerequisite was thrown away" means going back to the raw dump. Discards are
    grouped by reason because the useful question is what class of thing is
    being dropped and whether that class grew, not which individual clause it
    was.

    This describes an extraction rather than being data an app reads, so it is
    deliberately not part of what ships.
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
    ladder is what one god's page draws. A boon needing a second god's boon is
    not one rung higher; it is off the ladder entirely.

    **The rung is the cheapest way in, not the dearest.** A rung number means
    "reaching this needs at least one boon of the rung below", so it has to be
    measured along the path that actually gets you there. A boon reachable
    through any one of three others sits on the rung above the *shallowest* of
    them. Take the deepest as the answer and it lands several rows below the
    point where it becomes available, claiming a prerequisite on the rung below
    that it does not have.

    So a disjunction costs whatever its cheapest satisfying branch costs — or,
    when it asks for several, whatever the last of the cheapest few costs —
    while a conjunction costs its dearest child, all of them being needed. A
    branch satisfiable without any of this god's boons costs nothing, which is
    what puts a boon gated on "a Cast from anyone" on the first rung of every
    god's ladder rather than partway up one.

    Anything outside `ladder_ids` — cross-god boons and the element-gated ones —
    gets no depth at all rather than a misleading zero, and the view places
    those separately.

    Returns (depths, cycles). A cycle leaves depth undefined, so it is reported
    rather than resolved, and the caller fails the run on it.
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

    Takes `declared` as {holder: [blocker, ...]} and answers (exclusive_groups,
    blocked_by, aspect_conflicts, dropped, self_gates), because none of the four
    can be decided from a single record:

      * a declaration naming its own trait is a "do not offer a duplicate"
        gate, not an exclusion of anything;
      * a blocker that is a weapon aspect is not a trait the run holds at all.
        An aspect is equipped rather than picked up, so this is a conflict with
        the weapon form, which the run answers from a different fact;
      * a pair that names each other is a symmetric mutual exclusion, and at
        most one of the group is ever held;
      * anything else is one-directional — taking the blocked trait first leaves
        both held — which is a different feasibility verdict and must not be
        recorded as mutual.

    A block may only be reported as permanent when the blocker cannot leave the
    player's possession. `removable` names the blockers that can, and their
    edges are dropped, since reporting one would tell a player their build is
    impossible over a keepsake they can swap out next region. That test runs
    ahead of the symmetry test, so a pair with one removable member does not
    become a group either — a group makes the same permanent claim, in both
    directions at once.
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

    # Two passes bc symmetry is about the edges that survive, not abt the edges
    # the game declared. Every test below removes an edge for a reason that
    # holds whichever direction it runs in, so an edge whose counterpart has
    # gone is no longer half of a mutual exclusion; instead, it's a
    # one-directional  block that happened to be declared twice. If we instead
    # judged symmetry against the raw declarations, a dropped edge would go on
    # making its counterpart look mutual, which is how a pair with one shed-able
    # member kept its group after the removability test moved ahead of it.
    live = set()
    for holder, blocker in sorted(edges):
        # Scope is tested before symmetry, not after. An edge on content the
        # release doesn't model isn't a constraint whichever direction it runs
        # in, and testing symmetry first would let the same content back
        # in through the exclusive-group half.
        if is_out_of_scope(holder) or is_out_of_scope(blocker):
            dropped.append({"holder": holder, "blocker": blocker,
                            "reason": "an edge on content this release does not model"})
            continue
        # Anything touching a weapon form is settled here, before symmetry. An
        # aspect is equipped rather than picked up, so neither of the two fields
        # below can carry it: both mean "the run holds this", and a run never
        # holds an aspect. A block naming one would hunt for it among the held
        # traits and never find it, leaving a real constraint permanently inert.
        # A mutual exclusion would be the same mistake symmetrically, which is
        # why symmetry cannot be allowed to see these first.
        if is_aspect(holder) or is_aspect(blocker):
            if is_aspect(holder) and is_aspect(blocker):
                # A run has exactly one weapon form, so one can't rule another
                # out. The edge says nothing the model doesn't already know.
                dropped.append({"holder": holder, "blocker": blocker,
                                "reason": "an edge between two weapon forms, and a run has one"})
            elif is_aspect(blocker):
                aspect_conflicts.setdefault(holder, set()).add(blocker)
            else:
                # The declaration runs the other way: a weapon form saying it is
                # not offered alongside some trait. The form is chosen before
                # the run (i.e. when nothing is held yet), so there's no moment
                # at which this could gate anything. Reading it in reverse
                # (i.e. as the trait being blocked by the form), would invent an
                # edge the data doesn't state.
                dropped.append({"holder": holder, "blocker": blocker,
                                "reason": "a weapon form, which is chosen before anything is held"})
            continue
        # A mutual exclusion says at most one of the group is ever held, which
        # for a temporary blocker is simply uh false (i.e. swap the keepsake and
        # take the other one). So it's decided here instead of after symmetry,
        # where the pair would become a group and tell a player something's
        # Impossible when they can actually undo what "made it impossible". The
        # tripwire that watches for exactly this reads only the one-directional
        # field, so nothing else would actually catch it.
        if blocker in removable:
            dropped.append({"holder": holder, "blocker": blocker,
                            "reason": "a blocker the run can shed, so it can never be permanent"})
            continue
        live.add((holder, blocker))

    for holder, blocker in sorted(live):
        # Both halves survived, so the exclusion really is mutual :cowboy: :cowboy:.
        if (blocker, holder) in live:
            exclusive_groups.setdefault(holder, set()).update({holder, blocker})
        else:
            blocked_by.setdefault(holder, set()).add(blocker)

    return (
        {k: sorted(v) for k, v in exclusive_groups.items()},
        {k: sorted(v) for k, v in blocked_by.items()},
        {k: sorted(v) for k, v in aspect_conflicts.items()},
        dropped,
        sorted(set(self_gates)),
    )
