"""Every filesystem path the extractor touches, resolved in one handy-dandy place.

There are three situations in which this lil tool guy is run (they all need
different paths lol, so no paths are just like baked into the script itself):

  1) a **full re-extraction** after a game patch reads a real game install &
    writes a fresh dump plus normalized output (mostly for Hades II),
  2) **re-normalizing an existing dump** (this is the hashtag drift checkk)
    reads the committed raw JSON & needs no game install for the data itself
    (only for `file:line` citations & localized text),
  3) the **golden fixture test** points every path at synthetic input committed
    along w/ this file, which allows it to run anywhere (including CI, which
    doesn't yk have any game installs or Lua interpreters).

Environment variables override each path independently. Any defaults are a
standard macOS Steam install and this tool's own lil `reference/` tree (which is
what a full local re-run wants); this lets an unconfigured run behave exactly
the same as before these paths were lifted out of the scripts.

Paths come back as strings w/ a trailing separator (bc every caller builds
filenames by well concatenation lol).
"""

import os
from pathlib import Path

_TOOL = Path(__file__).resolve().parent.parent

# A standard macOS Steam library. Path is for the individual user instead of
# just being like hard-coded to my machine lol :cowboy: :cowboy:.
_STEAM = Path.home() / "Library" / "Application Support" / "Steam" / "steamapps"
_INSTALL = {
    "hades1": _STEAM / "common" / "Hades" / "Game.macOS.app" / "Contents",
    "hades2": _STEAM / "common" / "Hades II" / "Hades II.app" / "Contents",
}
# Steam's per-app manifest (this is what gives us the buildid that's reported
# by the version stamp).
APPMANIFEST = {
    "hades1": _STEAM / "appmanifest_1145360.acf",
    "hades2": _STEAM / "appmanifest_1145350.acf",
}


def _resolve(env, default):
    value = os.environ.get(env)
    return Path(value).expanduser() if value else default


def _as_dir(path):
    return str(path) + os.sep


def raw_dir():
    """Where the Lua dumpers write and the normalizers read."""
    return _as_dir(_resolve("EXTRACT_RAW", _TOOL / "reference" / "raw"))


def out_dir(game=None):
    """Where normalized JSON lands. Per-game subdirectory when `game` is given."""
    root = _resolve("EXTRACT_OUT", _TOOL / "reference")
    return _as_dir(root / game if game else root)


def scripts_dir(game):
    """The game's `Scripts/` directory, read for source-line citations."""
    return _as_dir(
        _resolve(f"EXTRACT_SCRIPTS_{game.upper()}", _INSTALL[game] / "Resources" / "Content" / "Scripts")
    )


def text_dir(game):
    """The game's localized text directory (`Game/Text/en/`)."""
    return _as_dir(
        _resolve(
            f"EXTRACT_TEXT_{game.upper()}",
            _INSTALL[game] / "Resources" / "Content" / "Game" / "Text" / "en",
        )
    )


def info_plist(game):
    """The app bundle's Info.plist, read for the shipped version string."""
    return str(_resolve(f"EXTRACT_PLIST_{game.upper()}", _INSTALL[game] / "Info.plist"))
