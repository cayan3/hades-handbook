"""Tests for the check that refuses a dump and an install from different builds.

The failure this guards against produced a shipped catalog once already, and it
produced one that looked entirely healthy: data from a build seven weeks old,
file:line citations read from the current install, a version stamp naming the
current build, and exit 0 throughout. Nothing downstream could see it, least of
all the drift check, whose default mode feeds the stale dump into both sides of
its own comparison.

So the cases below are mostly refusals. Each one builds the smallest pair of
inputs that exhibits the split and asserts the run stops, because a guard that
has never been observed to fire is most of the way back to not having one.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOL / "src"))

import build_guard  # noqa: E402


def write_manifest(path, build_id):
    """A Steam app manifest, cut down to the shape the reader actually walks."""
    path.write_text(
        '"AppState"\n'
        "{\n"
        '\t"appid"\t\t"1145360"\n'
        '\t"name"\t\t"Hades"\n'
        f'\t"buildid"\t\t"{build_id}"\n'
        '\t"LastUpdated"\t\t"1770000000"\n'
        "}\n",
        encoding="utf-8",
    )
    return path


def write_provenance(raw_dir, game, build_id):
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / build_guard.PROVENANCE[game]
    path.write_text(
        json.dumps({"game": game, "steamAppId": "1145360", "steamBuildId": build_id}),
        encoding="utf-8",
    )
    return path


@pytest.fixture
def citing_an_install(monkeypatch, tmp_path):
    """Put the guard in the situation it exists for: real install, stored dump.

    `EXTRACT_SCRIPTS_HADES1` is deleted rather than left alone, since an
    ambient value would silently exempt every test in this file.
    """
    raw = tmp_path / "raw"
    raw.mkdir()
    manifest = tmp_path / "appmanifest_1145360.acf"
    monkeypatch.delenv("EXTRACT_SCRIPTS_HADES1", raising=False)
    monkeypatch.setenv("EXTRACT_RAW", str(raw) + os.sep)
    monkeypatch.setenv("EXTRACT_APPMANIFEST_HADES1", str(manifest))
    return raw, manifest


def test_same_build_passes(citing_an_install):
    raw, manifest = citing_an_install
    write_manifest(manifest, "24556151")
    write_provenance(raw, "hades1", "24556151")
    build_guard.check("hades1")


def test_a_dump_from_an_older_build_is_refused(citing_an_install):
    """The case that shipped: the dump is stale and every other input is live."""
    raw, manifest = citing_an_install
    write_manifest(manifest, "24556151")
    write_provenance(raw, "hades1", "24432219")

    with pytest.raises(build_guard.BuildMismatch) as refusal:
        build_guard.check("hades1")

    # Both builds belong in the message: knowing only that they disagree does
    # not tell anyone which side is behind, which is the first thing wanted.
    assert "24432219" in str(refusal.value)
    assert "24556151" in str(refusal.value)


def test_a_dump_that_records_no_build_is_refused(citing_an_install):
    """A dump from before provenance existed reads exactly like a stale one.

    There is no version of this the guard can wave through: absent provenance
    and provenance naming a build seven weeks old are the same evidence from
    inside the normalizer, so treating absence as consent would exempt precisely
    the dumps most likely to be stale.
    """
    _, manifest = citing_an_install
    write_manifest(manifest, "24556151")

    with pytest.raises(build_guard.BuildMismatch) as refusal:
        build_guard.check("hades1")
    assert "re-dump" in str(refusal.value)


def test_an_unreadable_manifest_is_refused_rather_than_skipped(citing_an_install):
    """Not being able to check is not the same as having checked."""
    raw, manifest = citing_an_install
    write_provenance(raw, "hades1", "24556151")
    assert not manifest.exists()

    with pytest.raises(build_guard.BuildMismatch):
        build_guard.check("hades1")


def test_a_manifest_with_no_buildid_line_is_refused(citing_an_install):
    """A manifest that parses but carries no build id yields None, not a crash,
    so it has to be caught by the same branch as a missing file."""
    raw, manifest = citing_an_install
    manifest.write_text('"AppState"\n{\n\t"appid"\t\t"1145360"\n}\n', encoding="utf-8")
    write_provenance(raw, "hades1", "24556151")

    with pytest.raises(build_guard.BuildMismatch):
        build_guard.check("hades1")


def test_the_guard_stands_down_when_nothing_is_being_cited(monkeypatch, tmp_path):
    """The fixture runs have no install, no manifest and no build id.

    They point the scripts directory at committed synthetic input, so there is
    no installed build for a dump to disagree with. The guard has to be a no-op
    there or the golden tests could not run at all -- including in CI, which has
    neither game.
    """
    monkeypatch.setenv("EXTRACT_SCRIPTS_HADES1", str(tmp_path) + os.sep)
    monkeypatch.setenv("EXTRACT_RAW", str(tmp_path) + os.sep)
    monkeypatch.setenv("EXTRACT_APPMANIFEST_HADES1", str(tmp_path / "nope.acf"))

    build_guard.check("hades1")


def test_build_id_is_read_from_the_manifest_format_steam_writes(citing_an_install):
    _, manifest = citing_an_install
    write_manifest(manifest, "10929685")
    assert build_guard.installed_build_id("hades1") == "10929685"


def test_normalize_stops_before_writing_anything(citing_an_install, tmp_path):
    """The wiring, not just the check: a stale dump must stop the real script.

    Placed ahead of every read and every write in the normalizer, so this also
    pins that the refusal arrives before an output directory is populated with
    records nobody should trust.
    """
    raw, manifest = citing_an_install
    write_manifest(manifest, "24556151")
    write_provenance(raw, "hades1", "24432219")
    out = tmp_path / "out"

    env = dict(os.environ)
    env.update(
        {
            "PYTHONPATH": str(TOOL / "src"),
            "EXTRACT_RAW": str(raw) + os.sep,
            "EXTRACT_OUT": str(out),
            "EXTRACT_APPMANIFEST_HADES1": str(manifest),
        }
    )
    env.pop("EXTRACT_SCRIPTS_HADES1", None)

    result = subprocess.run(
        [sys.executable, str(TOOL / "src" / "normalize_h1.py")],
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "24432219" in result.stderr and "24556151" in result.stderr
    # The raw dump in this test carries nothing but a provenance file, so a run
    # that got past the guard would have died on a missing table instead. That
    # the output directory was never even created is what says the guard is
    # first rather than merely present.
    assert not out.exists()
