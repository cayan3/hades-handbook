"""Everything that must be true of an extraction before it's allowed to ship.

This runs at the end of an extraction, which is the only moment that can
actually refuse. Nothing downstream can audit this output (the app reads
whatever the catalog says and the drift check compares this code's output
against this code's previous output, so a defect that's stable would be
perfectly reproduced :no_mouth: :no_mouth:). The checks here are the last place
a wrong catalog can be caught.

Two kinds of findings live side-by-side (the difference matters :salute: :salute:):

  * **advisory**: a description of the catalog that a human reads and judges.
    E.g. which rarities nobody uses, which boons no source file offers, which
    clause keys nothing consumes. These don't fail the run bc the right answer
    is often "yes, that's correct".
  * **fatal**: a statement that some field holds a value that isn't data, or
    that some invariant the app relies on is broken. E.g. a clause nobody
    classified, a requirement asking for more branches than it has, a god
    that nobody's heard of, an unresolved dumper placeholder. These exit
    non-zero, so a run that produced one can't be mistaken for a clean run.

Splitting them that way is what ermmm lets the fatal list stay short enough to
read lol.
"""

import glob, json, os, re

import requirements
from config import out_dir, raw_dir, scripts_dir

UNRESOLVED_PREFIX = "<unresolved:"

# Records already known to ship an unresolved sentinel, exempted from the leak
# check so that a genuinely new one isn't lost in the noise of an old one.
# Both are Chaos boons whose prereq reaches `G.LootData.TrialUpgrade
# .PermanentTraits`; Hades II keeps its loot tables in LootSetData, so the
# global LootData that TraitData.lua reaches for is never populated and the
# reference falls through to the dumper's proxy. The data is present in the
# LootSetData dump, so this is a load-order defect and not a gap in the game's
# own files. It's recorded instead of repaired bc Chaos boons are out of scope
# (at least for now); anything appearing here that is *not* on this list is a
# new leak and would fail the run :pensive: :pensive:.
UNRESOLVED_SENTINEL_KNOWN = {
    "ChaosLastStandBlessing",
    "ChaosMetaUpgradeCurse",
}

# Gods who appear as a boon's attributed god but own no <God>Upgrade loot table,
# and so get no record in gods.json (e.g. the other game's Olympians making a
# cameo appearance). A name outside the union of these and the emitted god
# records is just a parse accident, not an actual attribution.
CAMEO_GOD_NAMES = {"Artemis", "Athena", "Dionysus", "Hades"}

# Two Hades I records name the wrong god in the game's own files; both are
# Demeter's but declare Zeus lol. The extraction is faithful and the overlay
# carries the correction over, so they are exempted here instead of like
# "repaired". What the rule is really for is a future potential third one, which
# nobody would otherwise notice.
GOD_DISAGREES_WITH_LOOT_TABLE_KNOWN = {
    "DemeterRangedTrait",
    "ShieldLoadAmmo_DemeterRangedTrait",
}

# Tall Order, Hermes' Infusion in Hades II, and the one record in either game
# filed StandardOlympian under a god who takes no pool slot. It reaches the
# category through the Elementals file instead of through its god, which is
# right for what it is despite being wrong-looking when compared to like every
# other Hermes record rip. This is listed here instead of corrected bc whether
# something is an Infusion that belongs to its god's category or to its
# mechanic's is a taxonomy call that hasn't really been made, and the check
# beside this exists so that the second such record is a decision instead of
# a discovery.
CATEGORY_OUTRANKS_GOD_KNOWN = {
    "ElementalUnifiedBoon",
}

# One Godsent Hex per Hex per Olympian, and the game ships nine of each.
# This is a number instead of a list of ids bc the ids are derived, so listing
# them would let a run that derived the wrong nine still match while the check
# would be agreeing with itself. Hades I has no equivalent mechanic and isn't yk
# checked for one.
GODSENT_HEXES_HADES2 = 9

# How many boons belong to two gods. Both numbers are what the games ship, but
# only one of them has a reason here: Hades I's 28 is every pair of its eight
# pool Olympians, so the set is provably complete and a 29th isn't a Duo
# somebody missed but just a misattribution. Hades II's 37 is just a count; not
# every pair has one, and two of its Zeus/Hera pair are distinct boons instead
# of one single boon like filed twice or something.
#
# Worth pinning bc attribution is decided by ermmm arithmetic lol: specifically,
# a boon offered by two loot tables must be a Duo. That rule is verified and
# extra important bc no single record can independently confirm. (e.g. so an
# ordinary boon that drifted into a second god's table would be filed as a
# Duo, lose its god, its ladder rung, and its category all at once, and surface
# under two gods with nothing actually raised). Counting is ermmm the cheapest
# thing that notices. A number instead of a list of ids for the same reason as
# Hexes: the ids are derived, so listing them would let a run that derived the
# wrong set still match :no_mouth: :no_mouth:.
DUO_BOONS = {"hades1": 28, "hades2": 37}

# Hades I grants exactly one trait through another trait's SetupFunction and the
# granting trait is a keepsake, so the block it declares can be undone by
# swapping keepsakes and must not be reported as permanent. The edge is dropped
# during normalization. This list is what makes a second one visible instead of
# ermmm letting it join the first in silence lol.
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


def godsent_hexes(boons):
    """Ids whose requirement has the paired-Hex shape: one Hex AND one god.

    Written as a test of the emitted *shape* rather than of anything the
    detector that produced it believes, which is the whole point. A check asking
    "did the pairing pass find nine?" would answer nine every time the pass was
    working, and say nothing at all when it silently found none.

    The shape is `all[ hasTrait(Hex), anyOf[ hasBoonFrom(god), hasKeepsake ] ]`,
    and every clause of it is load-bearing. The obvious looser test — does the
    requirement mention a Hex — matches one record more than there are pairs: a
    boon asking for any of seven Hexes with no paired-god half at all, which is
    a different mechanic rather than a tenth pair. An assertion written that way
    fails on a correct catalog, which is the kind most likely to get deleted
    rather than fixed.

    The Hex's own id is deliberately not part of the test. It follows a naming
    convention today, and keying on that would trade a shape the requirement
    genuinely has for a string a patch could rename.
    """
    found = []
    for bid, b in sorted(boons.items()):
        prereq = b.get("prereq")
        if not isinstance(prereq, dict) or prereq.get("kind") != "all":
            continue
        children = [c for c in (prereq.get("of") or []) if isinstance(c, dict)]
        if len(children) != 2:
            continue
        held = [c for c in children if c.get("kind") == "hasTrait"]
        either = [c for c in children if c.get("kind") == "anyOf"]
        if len(held) != 1 or len(either) != 1:
            continue
        alternatives = {c.get("kind") for c in (either[0].get("of") or []) if isinstance(c, dict)}
        if alternatives == {"hasBoonFrom", "hasKeepsake"}:
            found.append(bid)
    return found


def validate_game(game_key, boons, gods, keepsakes, clause_report=None,
                  raw_defs=None, loot_membership=None, external_references=None,
                  aspect_ids=None, godsent_hexes_expected=None,
                  duo_boons_expected=None, descriptions=None, talents=None,
                  mirror_rows=None):
    """Check one game's emitted catalog. Returns (report, fatal messages).

    The nine trailing arguments are the inputs a check needs that the emitted
    catalog does not carry. Each is optional, and the checks that need one are
    skipped when it is absent: the fixtures do not have a whole game's scripts
    to scan, and a check that could not run is a different thing from one that
    passed.
    """
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

    # 1. dangling references: an id named by a requirement, an exclusion, or a
    # block that's not in the catalog. A requirement pointing at nothing can yk
    # never be satisfied lol, so it always shows the boon as impossible.
    #
    # Each id is resolved against the table its atom reads, not against the two
    # tables put together. Both games keep keepsakes in the same id space as
    # boons, so a union answers "does this id exist somewhere", whichhhh is not
    # actually the question fun fact :smile: :smile:. A gate saying `hasTrait`
    # about a keepsake would resolve cleanly under a union while asking after
    # the keepsake among the traits a run holds, where it's ermm never actually
    # recorded lol :smile: :smile:. Four Hades I gates do exactly this, and this
    # check reported nothing about them.
    dangling = {}
    for bid, b in sorted(boons.items()):
        missing = set()
        for field in ("prereq", "activation"):
            expr = b.get(field)
            missing |= {r for r in requirements.referenced_trait_ids(expr) if r not in boons}
            missing |= {r for r in requirements.referenced_keepsake_ids(expr) if r not in keepsakes}
        # The exclusion fields are trait-space throughout: a group, a block, and
        # an aspect conflict all name something the run holds or equips as a
        # trait record.
        for field in ("exclusiveGroup", "blockedBy", "aspectConflicts"):
            missing |= {r for r in (b.get(field) or []) if r not in boons}
        if missing:
            dangling[bid] = sorted(missing)
    report["danglingPrereqReferences"] = dangling
    report["danglingPrereqReferenceCount"] = sum(len(v) for v in dangling.values())

    # 2. boons with no prereq at all (expected for core/starter boons; giving
    # the full list here is mostly so it can be sanity-checked)
    no_prereq = sorted(bid for bid, b in boons.items() if not b.get("prereq"))
    report["boonsWithNoPrereq"] = no_prereq
    report["boonsWithNoPrereqCount"] = len(no_prereq)

    # 3. rarities with no consumer: rarity levels that appear in *no* boon's
    # `rarity` list at all (i.e. declared somewhere as a concept but never used)
    all_rarities_seen = set()
    for b in boons.values():
        all_rarities_seen.update(b.get("rarity") or [])
    known_rarity_universe = {"Common", "Rare", "Epic", "Heroic", "Legendary", "Duo"}
    if game_key == "hades2":
        known_rarity_universe |= {"Perfect", "Elemental", "Legacy"}
    report["raritiesNeverUsedByAnyBoon"] = sorted(known_rarity_universe - all_rarities_seen)
    report["raritiesSeenInData"] = sorted(all_rarities_seen)

    # 4. exclusiveGroup symmetry. The classifier only records a mutual exclusion
    # when both records name each other, so this can ermmm no longer find
    # anything lol, which is yk exactly why it stays and why it's fatal. It's
    # become a check on the classifier instead of on the game's data; the reason
    # the field was wrong before is that nobody was actually checking that rip.
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
    # a Lua table reached for a global that hadn't been loaded yet, and those
    # markers are expected in the raw dumps. What must never happen is one
    # surviving into a normalized field bc there it's an actual *value*; a
    # `prereq` whose member list is the string "<unresolved:...>" instead of a
    # list of trait ids has lost its whole clause, and it does so invisibly.
    # Normalization now refuses a clause like this instead of passing it
    # through, so we get a build failure instead of a leak. Both count as
    # carrying though bc otherwise, normalizing the value would make it look
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

    # 6. inferred gods that aren't uh actually gods lol. Attribution from a
    # source comment is a guess by construction, so this checks that the guess
    # landed inside the known vocab instead of on an arbitrary capitalised word.
    known_gods = {g for g in gods if not g.startswith("__")} | CAMEO_GOD_NAMES
    attributed = {b["god"] for b in boons.values() if b.get("god") is not None}
    attributed |= {g for b in boons.values() for g in (b.get("duoGods") or [])}
    report["godNamesOutsideKnownVocabulary"] = sorted(attributed - known_gods)
    for name in report["godNamesOutsideKnownVocabulary"]:
        fatal.append("%s attributes a boon to %r, which is not a known god" % (game_key, name))

    # 7. clauses that didn't actually classify. The requirement grammar is only
    # safe to model without negation bc anything that doesn't fit the model is
    # supposed to stop the build. Otherwise, an unrecognised gate is quietly
    # kept as something it isn't (there is.. an imposter.. amo--), or just yk
    # quietly dropped, and a boon that needs something would appear free.
    failures = (clause_report or {}).get("buildFailures") or []
    report["buildFailures"] = failures
    report["buildFailureCount"] = len(failures)
    for failure in failures:
        if failure.get("id") in UNRESOLVED_SENTINEL_KNOWN:
            continue
        fatal.append("%s %s: %s (%s)" % (game_key, failure.get("id"), failure.get("reason"),
                                         json.dumps(failure.get("clause"))))

    # A known carrier that stopped carrying means the exemption outlived the
    # defect and should be deleted instead of quietly kept. Only records this
    # game actually has can say anything about it since the exemption list spans
    # both games and an id absent from this catalog is simply the other game's.
    present_here = set(boons) | set(gods) | set(keepsakes)
    still_carrying = {l["id"] for l in leaks} | {f.get("id") for f in failures}
    report["unresolvedSentinelKnownNoLongerPresent"] = sorted(
        (UNRESOLVED_SENTINEL_KNOWN & present_here) - still_carrying
    )

    # 8. requirement arity. An `anyOf` asking for more branches than it has can
    # never be satisfied by anything the run does rip, and evaluation still has
    # to answer for whatever it's handed, so it reports "impossible" with no
    # actual reason to show the player. That's erm an authoring error rip, and
    # this is the only place that can actually refuse it.
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
    # is stored instead of recomputed by the app, so a wrong one is wrong
    # everywhere and forever :sparkles: :sparkles:; it's cheap to check it here
    # against the same prereqs the view would read.
    god_of = {bid: b.get("god") for bid, b in boons.items()}
    stored = {bid: b["tier"] for bid, b in boons.items() if b.get("tier") is not None}
    recomputed, _ = requirements.compute_tiers(
        {bid: b.get("prereq") for bid, b in boons.items()}, god_of, set(stored)
    )
    inconsistent = []
    for bid in sorted(stored):
        if stored[bid] != recomputed.get(bid):
            inconsistent.append({"id": bid, "tier": stored[bid], "expected": recomputed.get(bid)})
    report["tiersInconsistentWithPrereqs"] = inconsistent
    for entry in inconsistent:
        fatal.append("%s %s is tier %s but its prerequisites put it at %s"
                     % (game_key, entry["id"], entry["tier"], entry["expected"]))

    # 10. a block whose blocker can be shed. Reporting one tells a player their
    # build is impossible because of something they can swap out, which is only
    # yk the most damaging verdict that this engine can give :smile: :smile:.
    # Normalization drops the one known case; this is the tripwire for the next.
    removable_blocks = []
    for bid, b in sorted(boons.items()):
        for blocker in b.get("blockedBy") or []:
            if blocker in keepsakes or blocker in REMOVABLE_BLOCKER_KNOWN:
                removable_blocks.append({"id": bid, "blocker": blocker})
    report["blocksWithARemovableBlocker"] = removable_blocks
    for entry in removable_blocks:
        fatal.append("%s %s is blocked by %s, which the run can shed"
                     % (game_key, entry["id"], entry["blocker"]))

    # 10b. a weapon aspect named as if it were a held trait. The two fields
    # below both mean "the run picked this up" and a run never picks up an
    # aspect; it's equipped before the run and answered from a different fact.
    # An aspect named in either one is a constraint that quietly never fires,
    # which reads as a boon being reachable when it isn't (the direction of
    # error nothing downstream can notice :no_mouth: :no_mouth:). This is the
    # check that was missing while two thirds of every block edge in the
    # catalog was an aspect :sobbing: :sobbing:.
    if aspect_ids is not None:
        misfiled = []
        for bid, b in sorted(boons.items()):
            for blocker in b.get("blockedBy") or []:
                if blocker in aspect_ids:
                    misfiled.append({"id": bid, "field": "blockedBy", "aspect": blocker})
            for member in b.get("exclusiveGroup") or []:
                if member in aspect_ids:
                    misfiled.append({"id": bid, "field": "exclusiveGroup", "aspect": member})
        report["aspectsNamedAsHeldTraits"] = misfiled
        for entry in misfiled:
            fatal.append("%s %s names the aspect %s in %s, where only a held trait belongs"
                         % (game_key, entry["id"], entry["aspect"], entry["field"]))

    # 11. Infusions. An element-gated boon carries its gate in the requirement
    # and carries no affinity of its own; one with neither is a boon whose
    # whole cost has gone missing :no_mouth: :no_mouth:.
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
    # it. Cheap to check rn bc the extractor holds both sides and it's the check
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

    # 13. records nothing offers. A trait is reachable in play only if some file
    # outside the trait definitions references it: loot tables, the store,
    # quests, characters, etc. A definition on its own isn't a source, so a
    # named record nobody references is cut content that kept its text and a
    # view iterating the catalog would render it as yk a real boon lol.
    #
    # Daedalus hammers are excluded first (and on purpose) since their pool is
    # derived from the weapon instead of listed anywhere, so the test says
    # nothing about them. Advisory here bc the answer is a judgement. The list
    # is short enough to read, and every entry in it so far has been real yay.
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

    # 14. the Godsent Hexes, counted. Their god and their Hex are the two things
    # the game doesn't state outright, so both are derived and the derivation
    # only checks itself once it's decided a record is one of these. Deciding
    # that takes three tests against the raw data: a marker string, an inherited
    # base, and the requirement block being written as a table instead of a
    # list. Missing on any of them isn't an error, it's just a `continue`, and
    # the result is a handful of records that don't keep any god and just
    # quietly lose half their requirement meep. A spell boon then renders as
    # reachable without its Hex, which is yk the opposite of what it says.
    #
    # The population is fixed and small, so counting it turns that silence
    # loud. Skipped where no expectation is supplied since the fixtures have
    # no such records and a check that can't run is erm not a check that passed.
    if godsent_hexes_expected is not None:
        found = godsent_hexes(boons)
        report["godsentHexes"] = found
        report["godsentHexCount"] = len(found)
        if len(found) != godsent_hexes_expected:
            fatal.append(
                "%s has %d requirements with the paired-Hex shape, expected %d: %s"
                % (game_key, len(found), godsent_hexes_expected,
                   ", ".join(found) or "none")
            )

    # 15. the boons belonging to two gods, counted, for the same reason as 14 and
    # against a different silence. Who grants a Hades I boon is settled by
    # arithmetic (two loot tables offering it is what a Duo *is* since neither
    # game marks one on the record) so the rule can't be confirmed by reading
    # any single record and a record that gets to the wrong answer looks exactly
    # like one that actually arrived at the correct one.
    #
    # Both directions are costly since a boon that gains a second owning table
    # is filed as a Duo and loses its god, its ladder rung, and its
    # category together; on the other hand, one that loses an owner stops being
    # a Duo and lands on one god's ladder claiming a rung it doesn't actually
    # have. The counts are fixed, so counting is the cheapest thing that can
    # tell either apart from a correct run.
    if duo_boons_expected is not None:
        duos = sorted(bid for bid, b in boons.items() if b.get("duoGods"))
        report["duoBoons"] = duos
        report["duoBoonCount"] = len(duos)
        wrong_arity = sorted(bid for bid in duos if len(boons[bid]["duoGods"]) != 2)
        report["duoBoonsNotNamingTwoGods"] = wrong_arity
        if len(duos) != duo_boons_expected:
            fatal.append(
                "%s has %d boons belonging to two gods, expected %d"
                % (game_key, len(duos), duo_boons_expected)
            )
        for bid in wrong_arity:
            # A Duo names two gods by construction, so anything else is the
            # attribution getting to a shape the field can't actually mean.
            fatal.append(
                "%s %s has duoGods naming %d gods, and a Duo names two"
                % (game_key, bid, len(boons[bid]["duoGods"]))
            )

    # 16. a god record with no source. Cheap, and has the shape two different
    # near misses in the god derivation both get to: an intermediate
    # template passing the god test instead of the table that inherits it, and
    # a section holding two god-shaped entries so that the sorted-last one
    # overwrites the first. Both emit a record built from an id the source index
    # has never seen, and both are otherwise silent: the god still has a name,
    # still lands in the pool set, and every count downstream still adds up. The
    # citation is the one field that can't survive either.
    sourceless = sorted(g for g, record in gods.items() if not record.get("source"))
    report["godRecordsWithoutASource"] = sourceless
    for name in sourceless:
        fatal.append(
            "%s god %r was emitted with no source, so it was built from an id "
            "the loot tables do not index" % (game_key, name)
        )

    # 17. a boon whose category disagrees with the pool standing of its god.
    # `StandardOlympian` is the category for a god who takes a pool slot, so a
    # record pairing it with `NonPoolSlot` is asserting both at once. One real
    # record does (Hermes' Tall Order), which reaches the category through the
    # file it lives in instead of through its god; it's listed here instead of
    # being fixed bc the pairing is a taxonomy question and this check exists
    # for the second one arriving unnoticed.
    contradictions = sorted(
        bid for bid, b in boons.items()
        if b.get("godKind") == "NonPoolSlot" and b.get("boonCategory") == "StandardOlympian"
    )
    report["boonsWhoseCategoryOutranksTheirGod"] = contradictions
    for bid in contradictions:
        if bid in CATEGORY_OUTRANKS_GOD_KNOWN:
            continue
        fatal.append(
            "%s %s is filed StandardOlympian under a god who takes no pool slot"
            % (game_key, bid)
        )

    # 18. Codex descriptions. The rendering resolves the game's markup and drops
    # what it cannot resolve, so a brace surviving means a construction nobody
    # has read -- and it would reach a card verbatim, which is the one place
    # this text is looked at.
    if descriptions is not None:
        report["descriptionCount"] = len(descriptions)
        with_markup = sorted(k for k, v in descriptions.items() if "{" in v or "}" in v)
        report["descriptionsCarryingMarkup"] = with_markup
        for ref in with_markup:
            fatal.append("%s the description for %s still carries markup: %r"
                         % (game_key, ref, descriptions[ref]))
        # A record naming a ref with nothing behind it is not a defect: roughly a
        # fifth of each game's entries are debug and cut content with no text at
        # all. Counted so a collapse in the number is visible.
        unresolved = sorted(
            b["descriptionRef"] for b in boons.values()
            if b.get("descriptionRef") and b["descriptionRef"] not in descriptions
        )
        report["descriptionRefsWithNoProse"] = unresolved
        report["descriptionRefsWithNoProseCount"] = len(unresolved)

    # 19. Mirror talents. A talent has no trait record, so a gate naming one is
    # checked against the talent table instead -- without this the ids in those
    # gates are the only ones in either catalog nothing resolves at all.
    if talents is not None:
        report["talentCount"] = len(talents)
        named_by_gates = set()
        for b in boons.values():
            for field in ("prereq", "activation"):
                named_by_gates |= {
                    n["talent"] for n in requirements.walk(b.get(field))
                    if n.get("kind") == "hasTalent"
                }
        unknown = sorted(t for t in named_by_gates if t not in talents)
        report["talentsGatedOnWithNoRecord"] = unknown
        for talent in unknown:
            fatal.append("%s a gate names the Mirror talent %s, which has no record"
                         % (game_key, talent))
        if mirror_rows is not None:
            report["mirrorRowCount"] = len(mirror_rows)
            for row_id, row in sorted(mirror_rows.items()):
                members = row.get("members") or []
                if len(members) != 2:
                    fatal.append("%s Mirror row %s has %d members, and a row opposes two"
                                 % (game_key, row_id, len(members)))
                for member in members:
                    if member not in talents:
                        fatal.append("%s Mirror row %s names %s, which has no talent record"
                                     % (game_key, row_id, member))

    return report, fatal


# Requirement-shaped keys that were already read and aren't gates on obtaining a
# trait. They match the census pattern (they start "Required" or end
# "Requirements"), so without this they would sit in the report forever, which
# means a list that always has nine entries can't show anyone a tenth. Each was
# looked at against the data instead of guessed from its name, and the reason
# recorded beside it is what lets a later reader disagree.
#
# `RequiresFalseTraits` is purposefully not here bc it's the one Hades I record
# that misspells the negation key rip. That's a real finding about the game's
# data since the engine must be ignoring it too; the census is where it shows.
CLAUSE_KEYS_THAT_ARE_NOT_GATES = {
    # display surfaces
    "CodexGameStateRequirements": "when the Codex entry shows, not when the trait is offered",
    "BoonInfoIgnoreRequirements": "a flag telling the boon-info panel to skip requirements",
    "CustomNameWithRequirements": "which display name to use, not whether the trait is reachable",
    # offer weighting rather than eligibility
    "PriorityRequirements": "reward weighting -- it prioritises a trait never seen before",
    # conditions on an effect, not on obtaining
    "EternalBurnRequirements": "a condition inside the trait's own effect",
    "KeepsakeRarityGameStateRequirements": "which rarity tier an assist keepsake is at",
    "DisableFishRequirements": "a flag about fishing points, which are not traits",
    # save-file progression and run progress, both assumed or offer-time
    "RequiredMinCompletedRuns": "save-file progression, which is assumed complete",
    "RequiredSeenRooms": "how far the run has got, or which conversation has played",
}


def unconsumed_clause_keys(raw_defs, extra_tables=()):
    """Requirement-shaped keys in the raw data that nothing reads and nobody has judged.

    The population of clauses has twice been measured by listing the idioms
    somebody remembered, and been wrong both times: once because a key was
    spelled differently, once because a whole clause family was never
    enumerated. So this counts from the other direction — everything that looks
    like a gate, minus everything the classifier consumes, minus everything
    somebody has read and ruled out. A patch introducing a new gate key shows up
    here instead of as silence.

    The last subtraction is what makes the first two useful. Reporting every
    display-side and offer-weighting key alongside a genuinely unread one left
    nine entries per game standing permanently, and nobody would notice a tenth
    arriving in a list like that. Advisory rather than fatal, because the answer
    is a judgement — but it can only be judged if the list is short enough to
    read, which now it is.
    """
    counts = {}

    def scan(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if _is_unjudged_gate(key):
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
                    if _is_unjudged_gate(key):
                        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _looks_like_a_gate(key):
    return isinstance(key, str) and (key.startswith("Required") or key.startswith("Requires")
                                     or key.endswith("Requirements"))


def _is_unjudged_gate(key):
    return (_looks_like_a_gate(key)
            and key not in requirements.CONSUMED_CLAUSE_KEYS
            and key not in CLAUSE_KEYS_THAT_ARE_NOT_GATES)


IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def referenced_outside_trait_data(scripts):
    """Every identifier named by a game script that is not a trait definition.

    Scanned for identifiers rather than parsed: the question is only whether a
    name appears at all, and the files that answer it are loot tables, store
    data, quests and character data in half a dozen different shapes. Whole
    identifiers rather than substrings, so one trait is not counted as
    referenced because another trait's name contains it.

    Returns None when there is nothing to scan, which is a different thing from
    an empty answer: a check that could not run must never read as one that
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


def aspects_by_inheritance(raw_defs, base):
    """Hades I marks a weapon form by what it inherits from; there is no table."""
    return {tid for tid in raw_defs if base in inherit_chain(raw_defs, tid)}


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
    # Hades II keeps its weapon forms in a table of their own, so membership *is*
    # the test. Inheritance is not; every aspect inherits the same two
    # templates, and those templates are what carries the `Slot` field.
    h2_aspects = set(load(RAW + "h2_TraitSetData.json").get("Aspects", {}))
    h2_report, h2_fatal = validate_game(
        "hades2", h2_boons, h2_gods, h2_keepsakes,
        clause_report=_load_optional(OUT + "hades2/_clause_report.json"),
        raw_defs=h2_defs,
        external_references=_external_references("hades2"),
        aspect_ids=h2_aspects,
        godsent_hexes_expected=GODSENT_HEXES_HADES2,
        duo_boons_expected=DUO_BOONS["hades2"],
        descriptions=_load_optional(OUT + "hades2/descriptions.json"),
        talents=_load_optional(OUT + "hades2/talents.json"),
        mirror_rows=_load_optional(OUT + "hades2/mirror_rows.json"),
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

    # Selene/Ares/Hephaestus + Hermes loot-color duplicates: re-check straight
    # from the LootSetData raw dump (these are god-frame colors, not in the boon
    # catalog schema, so we check the raw source directly :salute: :salute:).
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
        aspect_ids=aspects_by_inheritance(h1_defs, "WeaponEnchantmentTrait"),
        duo_boons_expected=DUO_BOONS["hades1"],
        descriptions=_load_optional(OUT + "hades1/descriptions.json"),
        talents=_load_optional(OUT + "hades1/talents.json"),
        mirror_rows=_load_optional(OUT + "hades1/mirror_rows.json"),
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
