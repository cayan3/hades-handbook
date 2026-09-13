"""Check the value resolver against the games' own code.

The resolver reimplements what each game does to a trait record before drawing
its tooltip. A reimplementation can be wrong in a way that produces a plausible
number, and a number on a card is the one thing in this product a reader cannot
check by looking -- so this runs the shipped logic under a Lua interpreter and
diffs every value the two produce.

Three outcomes, and only two of them are fine. **Agreeing** is the point.
**Answering nothing where the game answers** is expected and counted: a value
read off a projectile or an effect needs files the dump does not carry, and the
game's own answer for those is fake here anyway, since the stub has nothing to
read. **Answering where the game does not, or answering differently, is a
defect** -- a number nobody asked for is worse than a mark.

Local only, like the drift check: it needs a Lua interpreter and both game
installs. From `tools/data-extract/`:

    python3 check_values.py [hades1|hades2]
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

TOOL = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOL / "src"))

from config import raw_dir, scripts_dir  # noqa: E402
from resolve_values import _stat_display, extracted_for, merged_record  # noqa: E402

GAMES = {"hades1": "h1_TraitData.json", "hades2": "h2_TraitData.json"}
# Hades I has no such dump and needs none: its logic has no weapon-cost branch.
WEAPONS = {"hades1": "h1_WeaponData.json", "hades2": "h2_WeaponData.json"}
# Hades I merges what it extracts back over the record; Hades II collects it.
PREFIX = {"hades1": "", "hades2": "ExtractData."}


def run_oracle(game, which, out_path):
    result = subprocess.run(
        ["lua", str(TOOL / "lua" / "oracle.lua"), str(TOOL / "lua") + os.sep,
         scripts_dir(game), game, which, str(out_path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit("the oracle would not run for %s:\n%s%s" % (game, result.stdout, result.stderr))
    with open(out_path, encoding="utf-8") as f:
        return json.load(f)


def extract_names(node, found):
    """Every name a record's own extract entries write, at any depth."""
    if isinstance(node, dict):
        for entry in node.get("ExtractValues") or []:
            if isinstance(entry, dict) and entry.get("ExtractAs"):
                found.add(entry["ExtractAs"])
        single = node.get("ExtractValue")
        if isinstance(single, dict) and single.get("ExtractAs"):
            found.add(single["ExtractAs"])
        for value in node.values():
            extract_names(value, found)
    elif isinstance(node, list):
        for value in node:
            extract_names(value, found)
    return found


# The two halves of a StatDisplayN: the number, and the key it draws through.
STAT_VALUE = "StatDisplay."
STAT_KIND = "StatDisplayKind."


def check_stat_display(low, passes, key, top, mine, wrong, invented, game):
    """Diff the StatDisplayN indirection itself, not just where it lands.

    Most of a Hades II stat line reads its number through one of these, and
    diffing by extract name misses an off-by-one entirely -- the wrong number is
    still a number we checked, so it agrees. Same for the percent sign, which
    the resolver decides from a hand-copy of the game's format table.
    """
    checked = 0
    for name in sorted(n for n in low[key] if n.startswith(STAT_VALUE)):
        position = int(name[len(STAT_VALUE):])
        drawn = [p[key][name] for p in passes
                 if isinstance(p.get(key), dict) and name in p[key]]
        kinds = {p[key].get(STAT_KIND + str(position)) for p in passes
                 if isinstance(p.get(key), dict)}
        band, percent, signed = _stat_display(top, mine, position, game)
        if band is None:
            continue
        if not drawn:
            invented.append((key, name, str(band)))
            continue
        # A word compares by equality, as in the value pass below. A word
        # against a number is a disagreement, not a crash -- that is what
        # landing on the wrong entry looks like.
        if isinstance(band, str) or any(isinstance(drew, str) for drew in drawn):
            if not all(drew == band for drew in drawn):
                wrong.append((key, name, repr(band), repr(sorted(set(map(str, drawn))))))
                continue
        else:
            lo, hi = min(drawn), max(drawn)
            if not (abs(band.lo - lo) < 1e-6 and abs(band.hi - hi) < 1e-6):
                wrong.append((key, name, str(band), "%s..%s" % (lo, hi)))
                continue
        # Four keys, two axes. FlatPercent is a percent that hides its sign, so
        # it has to be tested before the Percent prefix it also starts with.
        drawn_percent = any(k and "Percent" in k for k in kinds)
        drawn_signed = any(
            k and (k.startswith("Delta") or (k.startswith("Percent"))) for k in kinds
        )
        if drawn_percent != percent:
            wrong.append((key, name + " percent", str(percent), str(drawn_percent)))
            continue
        if drawn_signed != signed:
            wrong.append((key, name + " sign", str(signed), str(drawn_signed)))
            continue
        checked += 1
    return checked


def check(game, workdir):
    defs = json.load(open(raw_dir() + GAMES[game], encoding="utf-8"))
    # The weapon table, where a spell's Magick cost is: the resolver reads it
    # there and so does the game, so leaving it out here would compare two
    # silences and report the pair as nothing to check.
    weapons = {}
    if os.path.exists(raw_dir() + WEAPONS[game]):
        weapons = json.load(open(raw_dir() + WEAPONS[game], encoding="utf-8"))
    # Four passes rather than two: the rarity multiplier and the base are
    # separate rolls, so the ends of one value's band are corners of a box the
    # oracle has to visit rather than the two runs where everything rolls the
    # same way. Dionysus's damage reduction is 20-37 and the diagonal is 25-30.
    passes = [run_oracle(game, "%s-%s" % (a, b), workdir / ("%s_%s_%s.json" % (game, a, b)))
              for a in ("min", "max") for b in ("min", "max")]
    low = passes[0]

    agree = silent = stats = 0
    wrong, invented = [], []
    for key in sorted(low):
        if not isinstance(low.get(key), dict):
            continue
        trait_id, rarity = key.split("|")
        rarity = None if rarity == "__none__" else rarity
        record = merged_record(defs, trait_id)
        # The rarities the merged record declares, which is the set `boons.json`
        # ships and so the set the catalog resolves values at. Reading the
        # unmerged record here skipped 305 Hades I pairs and 524 Hades II ones
        # -- every record that inherits its whole ladder, god boons included.
        levels = record.get("RarityLevels")
        if rarity is not None and not (isinstance(levels, dict) and rarity in levels):
            continue
        top, mine, _ = extracted_for(defs, trait_id, rarity, game, weapons)
        stats += check_stat_display(low, passes, key, top, mine, wrong, invented, game)
        for name in sorted(extract_names(record, set())):
            drawn = [p[key][PREFIX[game] + name] for p in passes
                     if isinstance(p.get(key), dict) and PREFIX[game] + name in p[key]]
            if not drawn:
                if name in mine:
                    invented.append((key, name, str(mine[name])))
                continue
            if name not in mine:
                silent += 1
                continue
            band = mine[name]
            # A word compares by equality across every pass: the Rarity format
            # answers the keyword reference itself, so there is no band to widen
            # and no rounding to allow for.
            if isinstance(band, str) or any(isinstance(drew, str) for drew in drawn):
                if all(drew == band for drew in drawn):
                    agree += 1
                else:
                    wrong.append((key, name, repr(band), repr(sorted(set(drawn)))))
                continue
            theirs, other = min(drawn), max(drawn)
            if abs(band.lo - theirs) < 1e-6 and abs(band.hi - other) < 1e-6:
                agree += 1
            else:
                wrong.append((key, name, str(band), "%s..%s" % (theirs, other)))

    # A record the game's own logic threw on is reported rather than counted as
    # nothing to check: a stub that makes the shipped code raise looks exactly
    # like a record with no values, and the pcall around it swallows the
    # difference. Not fatal -- a handful genuinely need a run to process.
    dropped = low.get("__skipped__") or []
    print("%s: %d agree, %d the resolver leaves to the mark, %d the game's own "
          "logic would not process" % (game, agree, silent, len(dropped)))
    # A different question from the values: not "is this number right" but
    # "is this the number that line draws".
    print("    %d StatDisplay slots agree on the value, the percent and the sign"
          % stats)
    for key in dropped[:10]:
        print("    NOT PROCESSED %s" % key)
    for key, name, mine_text, theirs_text in wrong[:20]:
        print("  DISAGREE %s %s: resolver %s, game %s" % (key, name, mine_text, theirs_text))
    for key, name, mine_text in invented[:20]:
        print("  INVENTED %s %s: resolver %s, game says nothing" % (key, name, mine_text))
    return len(wrong) + len(invented)


if __name__ == "__main__":
    wanted = sys.argv[1:] or sorted(GAMES)
    with tempfile.TemporaryDirectory() as tmp:
        failures = sum(check(game, Path(tmp)) for game in wanted)
    if failures:
        sys.exit("%d values do not match the games' own code" % failures)
    print("every value the resolver produces is the one the game produces")
