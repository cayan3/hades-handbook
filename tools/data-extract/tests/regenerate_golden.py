"""Rewrite the golden snapshots from the current normalizers.

Run this only when a normalizer change is supposed to change output; also, read
the resulting diff before committing it since the whole point of the snapshot
is to make an accidental change show up as an actual failure instead of just
like flying by unannounced :sobbing: :sobbing:.

    python3 tests/regenerate_golden.py
"""

import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_golden import SHAPES, TOOL, run_normalizer  # noqa: E402


def main():
    for shape, script, game in SHAPES:
        golden = TOOL / "fixtures" / shape / "golden"
        with tempfile.TemporaryDirectory() as tmp:
            run_normalizer(shape, script, Path(tmp))
            produced = Path(tmp) / game
            if golden.exists():
                shutil.rmtree(golden)
            golden.mkdir(parents=True)
            for path in sorted(produced.glob("*.json")):
                shutil.copy2(path, golden / path.name)
        names = ", ".join(sorted(p.name for p in golden.glob("*.json")))
        print(f"{shape}: {names}")


if __name__ == "__main__":
    main()
