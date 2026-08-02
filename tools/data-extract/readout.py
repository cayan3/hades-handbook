"""A human-readable rendering of the extraction, for checking against the game.

The catalog is JSON keyed on internal ids, which is right for the app and
useless for the one check nothing else can perform: sitting in front of the
game and asking whether the requirement a boon actually shows matches the one
that was extracted. This prints it the way the game says it -- display names,
grouped by god, with each requirement written as a sentence.

It reads the extraction and invents nothing. Where a name is missing the id is
shown in braces instead, because a record with no display name is usually
either cut content or a template and that is worth seeing rather than hiding.

    python3 readout.py                    both games, to stdout
    python3 readout.py hades2 > out.md    one game, to a file

The output carries the game's own display text, so it belongs somewhere
private rather than in the repository.
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
            # The common case by far, and it reads far better on one line than
            # as a bulleted list of nine single words.
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
