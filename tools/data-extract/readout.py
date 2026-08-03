"""This takes in the extraction and outputs a file that's actually readable
by like real people ():standing_man: :standing_man:), mostly so I can check
the extraction's findings against the actual game(s).

The catalog is in JSON and its keys are internal ids, which is fine if you're
a little elf helper in the backend who's responsible for making the app work,
but also pretty much unreadable for Real People (hi!) who are trying to verify
if listed boons and their requirements actually match the game it came from.
This fun lil guy prints out the most useful info out of the extraction's
boon-related findings; e.g. display names, corresponding gods, requirements,
and blockers.

To do that, this lil guy reads the extraction and invents literally nothing
(zero zilch nada). If a display name is missing for some reason (rip :pensive:
:pensive: might be a skill issue mb), the id is used as a placeholder; usually,
records that this happens to aren't actually in the game at all (e.g. existed
in early access but was later cut for whatever reason).

This also means that we're leaving out any hand-written corrections that were
just uh put on top of the catalog o_0, (e.g. game file naming the wrong god;
in particular, this happens to two Hades I records). If we considered those
here, it would ermmm basically defeat the point of this file (i.e. to show
exactly what the extractor worked out on its own). To use:

    python3 readout.py                    for both games; to stdout
    python3 readout.py hades2 > out.md    for one game; to a file

The output carries the game's own display text, so it should be stored somewhere
private, not in the public repository itself.
"""

import json
import sys

from config import out_dir

GAMES = ("hades1", "hades2")


def load(game, name):
    with open(out_dir(game) + name, encoding="utf-8") as f:
        return json.load(f)


def namer(text, boons, keepsakes):
    """Prefer the display name; fall back to the id, marked as such."""
    def name_of(trait_id):
        for table in (text, boons, keepsakes):
            entry = table.get(trait_id)
            if isinstance(entry, dict) and entry.get("displayName" if table is text else "name"):
                return entry["displayName" if table is text else "name"]
        return "{%s}" % trait_id
    return name_of


def render(requirement, name_of, depth=0):
    """Write a requirement tree as indented English."""
    if requirement is None:
        return ["(no prerequisite)"]
    kind = requirement.get("kind")
    if kind == "hasTrait":
        return ["hold %s" % name_of(requirement["trait"])]
    if kind == "hasBoonFrom":
        return ["hold any boon of %s" % requirement["god"]]
    if kind == "hasElement":
        return ["%d %s" % (requirement["count"], requirement["element"])]
    if kind == "hasKeepsake":
        return ["have %s equipped" % name_of(requirement["keepsake"])]
    if kind == "hasTalent":
        return ["have the %s talent selected" % requirement["talent"]]
    if kind == "hasAspect":
        return ["using %s" % " or ".join(requirement.get("aspects") or [])]
    if kind in ("all", "anyOf"):
        children = requirement.get("of") or []
        if kind == "anyOf" and all(c.get("kind") == "hasTrait" for c in children):
            # By far the most common case; makes much more sense as a one-liner
            # than a bulleted list of like nine singular words lol
            joined = ", ".join(name_of(c["trait"]) for c in children)
            return ["any %d of: %s" % (requirement.get("min", 1), joined)]
        header = "all of:" if kind == "all" else "any %d of:" % requirement.get("min", 1)
        lines = [header]
        for child in children:
            rendered = render(child, name_of, depth + 1)
            lines.append("  - " + rendered[0])
            lines.extend("    " + extra for extra in rendered[1:])
        return lines
    return ["(unclassified: %s)" % json.dumps(requirement)]


def report(game, out):
    boons = load(game, "boons.json")
    gods = load(game, "gods.json")
    keepsakes = load(game, "keepsakes.json")
    text = load(game, "text.json")
    name_of = namer(text, boons, keepsakes)

    print("# %s — extracted boons and their requirements\n" % game, file=out)
    version = load(game, "version.json")
    print("Build `%s`, last updated %s. Extracted %s.\n"
          % (version.get("steamBuildId"), version.get("steamLastUpdatedUtc"),
             version.get("extractedAtUtc")), file=out)
    print("Every requirement below is what the extraction holds. Anything that "
          "disagrees with the game is a finding.\n", file=out)

    by_god = {}
    for trait_id, record in sorted(boons.items()):
        owners = [record["god"]] if record.get("god") else list(record.get("duoGods") or [])
        for owner in owners or ["(no god)"]:
            by_god.setdefault(owner, []).append(trait_id)

    for god in sorted(by_god, key=lambda g: (g == "(no god)", g)):
        members = by_god[god]
        print("\n## %s — %d records\n" % (god, len(members)), file=out)
        for trait_id in sorted(members, key=lambda t: (boons[t].get("tier") or 99, name_of(t))):
            record = boons[trait_id]
            tier = record.get("tier")
            bits = ["tier %s" % tier if tier is not None else "no tier"]
            if record.get("slot"):
                bits.append(record["slot"])
            if record.get("elementAffinity"):
                bits.append(record["elementAffinity"])
            if record.get("duoGods"):
                bits.append("duo: %s" % " x ".join(record["duoGods"]))
            print("### %s  `%s`" % (name_of(trait_id), trait_id), file=out)
            print("*%s*" % ", ".join(bits), file=out)
            for line in render(record.get("prereq"), name_of):
                print("- " + line if not line.startswith("  ") else line, file=out)
            if record.get("activation"):
                print("- **active only when:** %s"
                      % " ".join(render(record["activation"], name_of)), file=out)
            if record.get("blockedBy"):
                print("- **blocked by:** %s"
                      % ", ".join(name_of(b) for b in record["blockedBy"]), file=out)
            if record.get("aspectConflicts"):
                print("- **not offered on:** %s"
                      % ", ".join(name_of(a) for a in record["aspectConflicts"]), file=out)
            if record.get("exclusiveGroup"):
                others = [b for b in record["exclusiveGroup"] if b != trait_id]
                print("- **cannot be held with:** %s"
                      % ", ".join(name_of(b) for b in others), file=out)
            print(file=out)


def main():
    wanted = sys.argv[1:] or list(GAMES)
    for game in wanted:
        if game not in GAMES:
            sys.exit("unknown game %r; expected one of %s" % (game, ", ".join(GAMES)))
        report(game, sys.stdout)


if __name__ == "__main__":
    main()
