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
from resolve_values import extracted_for, merged_record  # noqa: E402

GAMES = {"hades1": "h1_TraitData.json", "hades2": "h2_TraitData.json"}
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


def check(game, workdir):
    defs = json.load(open(raw_dir() + GAMES[game], encoding="utf-8"))
    low = run_oracle(game, "min", workdir / ("%s_min.json" % game))
    high = run_oracle(game, "max", workdir / ("%s_max.json" % game))

    agree = silent = 0
    wrong, invented = [], []
    for key in sorted(low):
        if not isinstance(low.get(key), dict) or not isinstance(high.get(key), dict):
            continue
        trait_id, rarity = key.split("|")
        rarity = None if rarity == "__none__" else rarity
        record = merged_record(defs, trait_id)
        # Only the rarities the record itself declares, which is the set the
        # catalog ships and the only one the shallow merge above agrees on.
        levels = (defs.get(trait_id) or {}).get("RarityLevels")
        if rarity is not None and not (isinstance(levels, dict) and rarity in levels):
            continue
        _, mine, _ = extracted_for(defs, trait_id, rarity, game)
        for name in sorted(extract_names(record, set())):
            theirs = low[key].get(PREFIX[game] + name)
            if theirs is None:
                if name in mine:
                    invented.append((key, name, str(mine[name])))
                continue
            if name not in mine:
                silent += 1
                continue
            band = mine[name]
            other = high[key].get(PREFIX[game] + name, theirs)
            if abs(band.lo - min(theirs, other)) < 1e-6 and abs(band.hi - max(theirs, other)) < 1e-6:
                agree += 1
            else:
                wrong.append((key, name, str(band), "%s..%s" % (theirs, other)))

    print("%s: %d agree, %d the resolver leaves to the mark" % (game, agree, silent))
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
