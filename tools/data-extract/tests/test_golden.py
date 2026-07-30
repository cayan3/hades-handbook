"""Golden-output snapshot over the synthetic fixtures.

This lil guy checks that a change to the normalizers doesn't change their output
for input that hasn't also changed. Since the golden files record what the tool
outputs (including anywhere that doesn't match what the fixture set was like
originally written to specify (i.e. `expected.json`; which btw is a "target",
not an "assertion" (read `fixtures/README.md` for more lol))), this is a
regression net (& not like a correctness proof or anything :pensive: :pensive:).

It starts from committed raw JSON instead of the Lua sources bc running the
dumpers needs well a Lua interpreter lol, and CI doesn't (& shouldn't have to)
actually install. The dump step itself is deterministic and separately verified
against the actual game install(s) by the (hashtag) drift check(k), which means
freezing its output here doesn't reduce coverage at all (:sunglasses:
:sunglasses:) and lets the parser half of the pipeline be used basically
anywhere that can run Python lol.

Regenerate after a deliberate behavior change w/:
    python3 tests/regenerate_golden.py
"""

import json
import re
import os
import subprocess
import sys
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent.parent
SRC = TOOL / "src"

# (i.e. fixture directory, normalizer script, game key its output lands under)
SHAPES = [
    ("h1-shape", "normalize_h1.py", "hades1"),
    ("h2-shape", "normalize_h2.py", "hades2"),
]


def run_normalizer(shape, script, out_root):
    """Run one normalizer against a fixture, writing into `out_root`."""
    fixture = TOOL / "fixtures" / shape
    env = dict(os.environ)
    env.update(
        {
            "PYTHONPATH": str(SRC),
            "EXTRACT_RAW": str(fixture / "raw") + os.sep,
            "EXTRACT_OUT": str(out_root),
            # The fixtures put their Lua sources and (absent) text bundle in one
            # directory; both games' variables are set so either normalizer
            # can find it w/o the test actually needing to know which game it is.
            "EXTRACT_SCRIPTS_HADES1": str(fixture / "input") + os.sep,
            "EXTRACT_SCRIPTS_HADES2": str(fixture / "input") + os.sep,
            "EXTRACT_TEXT_HADES1": str(fixture / "input") + os.sep,
            "EXTRACT_TEXT_HADES2": str(fixture / "input") + os.sep,
        }
    )
    result = subprocess.run(
        [sys.executable, str(SRC / script)],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"{script} failed:\n{result.stderr}"


@pytest.mark.parametrize("shape,script,game", SHAPES)
def test_output_matches_golden(shape, script, game, tmp_path):
    run_normalizer(shape, script, tmp_path)
    produced_dir = tmp_path / game
    golden_dir = TOOL / "fixtures" / shape / "golden"

    produced = sorted(p.name for p in produced_dir.glob("*.json"))
    expected = sorted(p.name for p in golden_dir.glob("*.json"))
    assert produced == expected, "the set of emitted files changed"

    for name in expected:
        actual = (produced_dir / name).read_text(encoding="utf-8")
        golden = (golden_dir / name).read_text(encoding="utf-8")
        # Compared as text (not as parsed JSON) bc key order and formatting are
        # inherently part of what ships (the normalized output is yk copied
        # verbatim into the catalog package lol & the drift check against the
        # real extraction is also a byte comparison).
        assert actual == golden, f"{shape}/{name} differs from its golden copy"


@pytest.mark.parametrize("shape,script,game", SHAPES)
def test_golden_is_well_formed_json(shape, script, game):
    """A golden file that stopped being valid JSON would still compare equal to
    itself, so the snapshot alone can't catch it."""
    for path in sorted((TOOL / "fixtures" / shape / "golden").glob("*.json")):
        json.loads(path.read_text(encoding="utf-8"))


def test_fixtures_carry_no_real_game_identifiers():
    """The fixtures are committed to a public repository and every identifier in
    them is invented. A real god name appearing in one means real game content
    has leaked in, which is the thing their synthetic-ness exists to prevent."""
    real_gods = [
        "Aphrodite", "Apollo", "Ares", "Artemis", "Athena", "Chaos", "Demeter",
        "Dionysus", "Hephaestus", "Hera", "Hermes", "Hestia", "Poseidon",
        "Selene", "Zeus", "Melinoe", "Zagreus",
    ]
    offenders = []
    for path in (TOOL / "fixtures").rglob("*"):
        if not path.is_file() or path.suffix not in {".lua", ".json"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if path.suffix == ".lua":
            # Comments are stripped first, before the scan (instead of
            # sanitized). A fixture is allowed to like "explain
            # itself" by giving the real in-game mechanic it's representing, but
            # there should be no real names in any position the extractor reads
            # (e.g. identifiers, field values, table keys). Rewriting it to
            # satisfy this check would mean sacrificing the analogy.
            text = re.sub(r"--[^\n]*", "", text)
        for god in real_gods:
            if god in text:
                offenders.append(f"{path.relative_to(TOOL)}: {god}")
    assert not offenders, "real game identifiers in the synthetic fixtures: " + "; ".join(offenders)
