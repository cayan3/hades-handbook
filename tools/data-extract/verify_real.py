"""Drift check: re-run the extraction and diff it against the last known-good.

This is the half of the coverage the synthetic fixtures cannot provide. They
prove the parser handles the shapes it was written for; only this proves those
shapes are still the ones the shipped games use. A patch that renames a field or
restructures a file leaves every fixture green and shows up here as a diff.

It runs locally and nowhere else, because the reference tree is deliberately not
committed and the two game installs are the input. Two modes:

    python3 verify_real.py              re-normalize the stored dump
    python3 verify_real.py --redump     re-dump from the game install first

The default mode needs no game install for the data itself and answers "do the
normalizers still turn this dump into this output" -- which is what catches an
accidental change to the parsers. `--redump` needs both games and a Lua
interpreter, and is the mode that actually detects a patch: it rebuilds the raw
dump from the installed scripts, so a changed field reaches the diff.

Exit status is 0 when everything matches and 1 on the first difference, so it
can gate a commit.
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
            # version.json carries an extraction timestamp and validation.json is
            # written by a separate pass, so neither is a function of the
            # normalizers alone and neither belongs in this comparison.
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
            # With a fresh dump, the raw JSON is the thing under test as well.
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

    if raw_ok and norm_ok:
        print("\nno drift: the extraction reproduces the reference exactly")
        return 0
    print("\ndrift detected — read the diffs above before regenerating anything")
    return 1


if __name__ == "__main__":
    sys.exit(main())
