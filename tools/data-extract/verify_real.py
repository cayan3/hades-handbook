"""This is the (hashtag) drift check(kk). It re-runs the extraction and diffs it
against the last verified.

This is one half of the coverage that the synthetic fixtures can't provide.
The synthetic fixtures prove that the parser handles the shapes it was written
for, but only this lil guy proves that those shapes are still the ones that
the shipped games actually use. If a future game patch renames a field or
restructures a file or something, those changes would pass through all the
fixtures and show up here as a diff.

This runs locally and nowhere else (bc the reference tree isn't committed &
the actual Hades/Hades II game installs are the input lol). There are two modes:

    python3 verify_real.py              re-normalize the stored dump
    python3 verify_real.py --redump     re-dump from the game install first

The default mode doesn't need a game install for the data itself; it basically
answers "do the normalizers still turn this dump into this output" (which is how
it catches any accidental changes to the parsers). On the other hand, `--redump`
needs both games and a Lua interpreter; this is the mode that actually detects
a patch (by rebuilding the raw dump from the installed scripts so any changed
field would reach the diff).

Exit status is 0 when everything matches and 1 on the first difference, so it
can actually gate a commit.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOL = Path(__file__).resolve().parent
SRC = TOOL / "src"
LUA = TOOL / "lua"
REFERENCE = TOOL / "reference"
CATALOG = TOOL.parent.parent / "packages" / "catalog" / "data"

# Produced by the normalizers; deliberately withheld from the catalog
# package bc the localized text bundle is literally the game's own copy (& it
# waits to be given a takedown path before it actually ships anywhere).
# The clause report is withheld for a different reason: it describes an
# extraction rather than the game, so it is something a person reads after a
# run and nothing the app has any use for.
NOT_SHIPPED = {"text.json", "_clause_report.json"}

GAMES = [("hades1", "h1"), ("hades2", "h2")]


def fail(message):
    print(f"  FAIL  {message}")
    return False


def redump(raw_out):
    """Rebuild the raw dumps from the installed games."""
    if shutil.which("lua") is None:
        sys.exit("--redump needs a lua interpreter on PATH (brew install lua)")
    for _, short in GAMES:
        env = dict(os.environ, EXTRACT_RAW=str(raw_out) + os.sep)
        result = subprocess.run(
            ["lua", str(LUA / f"dump_{short}.lua"), str(LUA) + os.sep],
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            sys.exit(f"dump_{short}.lua failed:\n{result.stderr}")
    print(f"re-dumped both games into {raw_out}")


def normalize(raw_dir, out_root):
    for _, short in GAMES:
        env = dict(
            os.environ,
            PYTHONPATH=str(SRC),
            EXTRACT_RAW=str(raw_dir) + os.sep,
            EXTRACT_OUT=str(out_root),
        )
        result = subprocess.run(
            [sys.executable, str(SRC / f"normalize_{short}.py")],
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            sys.exit(f"normalize_{short}.py failed:\n{result.stderr}")


def compare_tree(produced_root, reference_root, label):
    """Byte-compare every JSON file the reference carries."""
    ok = True
    for game, _ in GAMES:
        ref_dir = reference_root / game
        if not ref_dir.is_dir():
            ok = fail(f"no reference for {game} at {ref_dir}")
            continue
        for ref_file in sorted(ref_dir.glob("*.json")):
            # version.json carries an extraction timestamp while validation.json
            # is written by a completely separate pass, so neither are a fn
            # of "just the normalizers" & neither belong here in this comparison.
            if ref_file.name in {"version.json", "validation.json"}:
                continue
            produced = produced_root / game / ref_file.name
            if not produced.exists():
                ok = fail(f"{game}/{ref_file.name} was not produced")
            elif produced.read_bytes() != ref_file.read_bytes():
                ok = fail(f"{game}/{ref_file.name} differs from {label}")
            else:
                print(f"  ok    {game}/{ref_file.name}")
    return ok


def compare_shipped():
    """Check that the catalog package ships what the extractor produced.

    Nothing enforces this copy (it's made by hand after an extraction), so a
    run that regenerated `reference/` and then just erm stopped there would
    leave the app serving the previous extraction w/ nothing to actually flag
    that (so it would be a divergence between the two things this tool
    literally exists to check which is erm well not cool :thumbs-down:
    :thumbs-down:). Since the comparison (up there lol) only looks at
    `reference/`, this kind of divergence wouldn't be caught by it. Enter this
    fn :triumph: :triumph: which checks in not one but two directions (both
    directions bc "a file shipped that the extractor no longer produces" is ermm
    the same problem just uh looked at from the opposite side)!
    """
    ok = True
    for game, _ in GAMES:
        ref_dir = REFERENCE / game
        shipped_dir = CATALOG / game
        if not shipped_dir.is_dir():
            ok = fail(f"nothing shipped for {game} at {shipped_dir}")
            continue
        produced = {p.name for p in ref_dir.glob("*.json")} - NOT_SHIPPED
        shipped = {p.name for p in shipped_dir.glob("*.json")}
        for name in sorted(produced | shipped):
            if name not in shipped:
                ok = fail(f"{game}/{name} was extracted but is not in the catalog package")
            elif name not in produced:
                ok = fail(f"{game}/{name} ships but the extractor does not produce it")
            elif (ref_dir / name).read_bytes() != (shipped_dir / name).read_bytes():
                ok = fail(f"{game}/{name} ships a different copy than the extraction — "
                          "re-copy it into packages/catalog/data/")
            else:
                print(f"  ok    {game}/{name}")
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--redump",
        action="store_true",
        help="re-dump from the game install before normalizing (detects a patch)",
    )
    args = parser.parse_args()

    if not REFERENCE.is_dir():
        sys.exit(
            f"no reference tree at {REFERENCE}. It is deliberately not committed; "
            "run a full extraction locally first."
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if args.redump:
            raw = tmp / "raw"
            raw.mkdir()
            redump(raw)
            # With a fresh dump, the raw JSON is the thing under test too.
            print("comparing raw dumps against the stored ones")
            raw_ok = True
            for ref_file in sorted((REFERENCE / "raw").glob("*.json")):
                produced = raw / ref_file.name
                if not produced.exists():
                    raw_ok = fail(f"raw/{ref_file.name} was not produced")
                elif produced.read_bytes() != ref_file.read_bytes():
                    raw_ok = fail(f"raw/{ref_file.name} differs — the game data changed")
                else:
                    print(f"  ok    raw/{ref_file.name}")
        else:
            raw = REFERENCE / "raw"
            raw_ok = True

        out = tmp / "out"
        normalize(raw, out)
        print("comparing normalized output against the stored extraction")
        norm_ok = compare_tree(out, REFERENCE, "the stored extraction")

    print("comparing the shipped catalog against the stored extraction")
    shipped_ok = compare_shipped()

    if raw_ok and norm_ok and shipped_ok:
        print("\nno drift: the extraction reproduces the reference exactly, "
              "and the catalog package ships it")
        return 0
    print("\ndrift detected — read the diffs above before regenerating anything")
    return 1


if __name__ == "__main__":
    sys.exit(main())
