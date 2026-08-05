"""Refuse to normalize a dump that came from a different build than the install
being cited against.

The extraction reads two sources at two different times and nothing used to
notice when they drifted apart. The raw data comes from `reference/raw/`, dumped
whenever somebody last ran the Lua step; the `file:line` citations on every
record are read from the game's live `Scripts/` directory at normalize time, and
the version stamp is read from Steam's live manifest. Patch the game between
those two moments and the result is a catalog whose data is one build, whose
citations are another, and whose stamp claims the second — all of it exiting 0
and looking exactly like a clean run.

That is not hypothetical. A stored dump once sat seven weeks behind the install
without anything being able to tell, and the catalog shipped in that split state
before anyone noticed. The drift check cannot see it either, because without a
re-dump it compares this code's output against this code's stored output, and
the stale dump is the input to both sides of that comparison.

So the dumpers now record which build they read, and this refuses the run when
that disagrees with what is installed. The check needs both halves, and a
missing half is treated the same as a mismatched one: a dump taken before
provenance existed is indistinguishable, from the inside, from a dump taken
seven weeks ago.

None of this applies when the citations do not point at an installed game. The
fixture tests set the scripts directory to committed synthetic input, where
there is no build id and nothing to disagree with, so the guard stands down.
What decides that is whether a manifest was named, not whether a scripts
directory was — an install that lives anywhere but the default Steam library
has to override both, and keying on the scripts directory stood the guard down
on precisely that run. See `reads_the_installed_game`.
"""

import json

from config import appmanifest, raw_dir, reads_the_installed_game

# Written by the Lua dumpers beside the data they dump, one per game.
PROVENANCE = {"hades1": "h1_provenance.json", "hades2": "h2_provenance.json"}

# Deliberately not part of the message below: telling someone to re-dump is
# actionable, and every path involved is machine-specific and already printed
# by the step that fails.
REDUMP = "re-dump the game before normalizing:  lua lua/dump_%s.lua lua/"


class BuildMismatch(Exception):
    """The dump and the installed game are not the same build."""


def installed_build_id(game):
    """The build id Steam records for what is installed right now.

    Returns None when the manifest cannot be read at all, which the caller
    treats as a failure rather than as a pass: an unreadable manifest means the
    comparison could not be made, not that it succeeded.
    """
    try:
        with open(appmanifest(game), encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return None
    build_id = None
    for line in lines:
        parts = line.strip().split('"')
        # Steam writes `"key"<tab>"value"`, which splits into a leading empty
        # field, the key, the separator, and the value.
        if len(parts) >= 5 and parts[1] == "buildid":
            build_id = parts[3]
    return build_id


def dumped_build_id(game):
    """The build id recorded by whichever dumper run produced the stored data."""
    path = raw_dir() + PROVENANCE[game]
    try:
        with open(path, encoding="utf-8") as f:
            recorded = json.load(f)
    except (OSError, ValueError):
        return None
    return recorded.get("steamBuildId")


def check(game):
    """Raise unless the stored dump and the installed game agree on the build.

    A no-op when this run is not citing an installed game.
    """
    if not reads_the_installed_game(game):
        return

    installed = installed_build_id(game)
    dumped = dumped_build_id(game)
    short = "h1" if game == "hades1" else "h2"

    if installed is None:
        raise BuildMismatch(
            "%s: cannot read the installed build id from %s.\n"
            "The citations on every record are about to be read from this "
            "install, so a run that cannot identify it cannot say which build "
            "it described. Point EXTRACT_APPMANIFEST_%s at the right manifest. "
            "If this run is not meant to be citing an install at all, unset "
            "EXTRACT_APPMANIFEST_%s and point EXTRACT_SCRIPTS_%s at the input "
            "it does cite -- naming a manifest is what says there is an "
            "install here to disagree with."
            % (game, appmanifest(game), game.upper(), game.upper(), game.upper())
        )

    if dumped is None:
        raise BuildMismatch(
            "%s: the stored dump does not record which build it was taken "
            "from, and the installed game is build %s.\n"
            "Dumps taken before that was recorded cannot be told apart from "
            "dumps taken several patches ago, which is the failure this check "
            "exists for, so the run stops rather than guessing. Fix it by "
            "re-dumping -- %s"
            % (game, installed, REDUMP % short)
        )

    if dumped != installed:
        raise BuildMismatch(
            "%s: the stored dump is build %s but the installed game is build "
            "%s.\n"
            "Normalizing now would emit records whose data came from the first "
            "and whose file:line citations and version stamp come from the "
            "second, which is worse than either build on its own and looks "
            "like a clean run. Fix it by re-dumping -- %s"
            % (game, dumped, installed, REDUMP % short)
        )
