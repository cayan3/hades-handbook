"""Turning a Codex entry's markup into the sentence a reader can be shown.

The games write a description as display markup: keyword references, colour and
icon directives, and substitutions the engine fills in at runtime from the run's
own numbers. Rendering it raw would put `{$Keywords.AttackSet}` on the card, and
resolving it in the app would mean shipping the markup and a renderer for it, so
the resolution happens here and the catalog carries prose.
"""

import re

from parse_text_bundle import resolve_display_name

# What the engine would draw from the run's own numbers. Every value in the game
# is rarity-dependent, so there is no single right number to bake in and this
# marks the gap instead.
VALUE = "\u2014"

KEYWORD = re.compile(r"\{\$Keywords\.([A-Za-z0-9_]+)\}")
ICON = re.compile(r"\{!Icons\.([A-Za-z0-9_]+)\}")
ANY_ICON = re.compile(r"\{![^}]*\}")
FORMAT = re.compile(r"\{#[^}]*\}")
SUBSTITUTION = re.compile(r"\{\$[^}]*\}")
BUTTON = re.compile(r"\{[A-Z][A-Za-z0-9]*\}")
COLUMN = re.compile(r"\\Column\s*\d+")
BEFORE_PUNCTUATION = re.compile(r"\s+([.,;:%])")

# An icon key is usually an entry of its own, but the variants are spelled by
# suffix -- `ArmorTotal_NoTooltip` is `Armor` two hops down. Stripped one at a
# time to a fixed point so an unknown combination still lands on the base name.
ICON_SUFFIXES = (
    "_Small_Tooltip",
    "_NoTooltip",
    "_Tooltip",
    "_Small",
    "NoTooltip",
    "IconAlt",
    "Icon",
    "Alt",
    "Misc",
    "Home",
    "Total",
    "Small",
)


def _bare(name):
    """A resolved name with its decorative glyphs dropped.

    A tooltip title is written `{!Icons.Mana} Magick`: the glyph prefixes the
    word rather than standing for it, so substituting it would give the icon's
    own title back where the word belongs.
    """
    return re.sub(r"\s+", " ", ANY_ICON.sub("", name)).strip()


def keyword_word(keywords, key):
    """The word the game shows for a keyword reference, or nothing."""
    name = resolve_display_name(keywords, key)
    if not name:
        return ""
    # One nested hop: a few titles quote another keyword rather than a word.
    name = KEYWORD.sub(lambda m: resolve_display_name(keywords, m.group(1)) or "", name)
    return _bare(name)


def icon_word(keywords, key):
    """The noun an inline icon stands for, read off the game's own entry for it.

    An icon in a description body is the thing itself -- "Foes drop {!Icons.Ammo}
    stuck in them" -- so dropping it changes what the sentence claims. The word
    is the game's, not ours: the bundle has an entry under the icon's own key.
    """
    candidate = key
    seen = {candidate}
    while True:
        name = resolve_display_name(keywords, candidate)
        if name:
            resolved = KEYWORD.sub(
                lambda m: resolve_display_name(keywords, m.group(1)) or "", name
            )
            return _bare(resolved)
        for suffix in ICON_SUFFIXES:
            if candidate.endswith(suffix) and len(candidate) > len(suffix):
                candidate = candidate[: -len(suffix)]
                break
        else:
            return None
        if candidate in seen:
            return None
        seen.add(candidate)


def render_name(raw, keywords):
    """A display name with its markup resolved, or nothing where none is left.

    A name is usually plain, but thirteen Hades II records and every Mirror
    talent write theirs as markup -- an icon standing in for the word, or a
    keyword reference. Nothing back means the caller should fall back to the id.
    """
    if not raw:
        return None
    text = KEYWORD.sub(lambda m: keyword_word(keywords, m.group(1)), raw)
    text = ICON.sub(lambda m: " %s " % (icon_word(keywords, m.group(1)) or ""), text)
    text = FORMAT.sub("", text)
    text = ANY_ICON.sub("", text)
    text = BUTTON.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def render_description(raw, keywords):
    """The first sentence of a Codex entry, with its markup resolved or dropped.

    Everything after the first line break is the tooltip's stat table -- a stat
    name and a runtime number per line -- which carries nothing a plan is made
    from, so the rendering stops at the prose.
    """
    if not raw:
        return ""
    text = raw.split("\\n")[0]
    text = COLUMN.sub(" ", text)
    text = KEYWORD.sub(lambda m: keyword_word(keywords, m.group(1)), text)
    text = ICON.sub(lambda m: " %s " % (icon_word(keywords, m.group(1)) or ""), text)
    text = FORMAT.sub("", text)
    text = ANY_ICON.sub("", text)
    text = SUBSTITUTION.sub(VALUE, text)
    text = BUTTON.sub("", text)
    text = text.replace("\\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return BEFORE_PUNCTUATION.sub(r"\1", text)


def descriptions_for(refs, bundle, keywords):
    """The rendered bundle, keyed by the ref a record names.

    Only the refs some shipped record points at: a description nothing can reach
    is game text carried for nothing, which is the exposure this pipeline is
    supposed to keep to a minimum.
    """
    out = {}
    for ref in sorted(set(refs)):
        rendered = render_description((bundle.get(ref) or {}).get("description"), keywords)
        if rendered:
            out[ref] = rendered
    return out
