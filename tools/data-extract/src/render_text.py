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
#
# A question mark rather than a dash, because the mark lands in three positions
# and has to read in all of them: after a `+`, before a `%`, and alone where the
# value was itself a percentage. `+—` and `—%` read as typos in the first two.
VALUE = "?"

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

# Icon keys the bundle names somewhere other than under their own stem, so the
# suffix ladder cannot reach them. The five elements are the whole list: their
# word is on the `<Element>Boon` keyword entry and nothing named `Air` exists,
# which left *Tall Order* reading "at least -, -, - or - Elements".
ICON_ALIASES = {
    "EarthNoTooltip": "EarthBoon",
    "WaterNoTooltip": "WaterBoon",
    "AirNoTooltip": "AirBoon",
    "FireNoTooltip": "FireBoon",
    "AetherNoTooltip": "AetherBoon",
}


# Icons that are the word rather than decoration around one. Hades II's Omega
# marks a different move: Attack and Omega Attack are two things a boon can be
# about, and dropping the mark turns a sentence about one into a sentence about
# the other. 52 of the 334 records a page draws said the wrong move.
GLYPHS = {"Omega": "\u03a9"}


def _glyph(key):
    """The character an icon stands for, or nothing where it stands for none.

    Same suffix ladder `icon_word` walks, since the variants are spelled the
    same way here -- the Omega arrives as `Omega_NoTooltip` from a keyword
    title and as `Omega` on its own.
    """
    candidate = ICON_ALIASES.get(key, key)
    while True:
        if candidate in GLYPHS:
            return GLYPHS[candidate]
        for suffix in ICON_SUFFIXES:
            if candidate.endswith(suffix) and len(candidate) > len(suffix):
                candidate = candidate[: -len(suffix)]
                break
        else:
            return None


def _bare(name):
    """A resolved name with its decorative glyphs dropped.

    A tooltip title is written `{!Icons.Mana} Magick`: the glyph prefixes the
    word rather than standing for it, so substituting it would give the icon's
    own title back where the word belongs. A glyph in `GLYPHS` is the exception
    and stays, being part of the name rather than an ornament on it.
    """
    name = ICON.sub(lambda m: _glyph(m.group(1)) or "", name)
    return re.sub(r"\s+", " ", ANY_ICON.sub("", name)).strip()


# A title that opens with a glyph and a space is written to sit after something:
# `{!Icons.PomLevel_NoTooltip} Lv.` follows a number. Dropping the glyph took the
# separator with it, which is where "+3Lv." and "at least 2Elements" came from.
# Seven of the thirteen icon-carrying titles a shipped description quotes are
# this shape; the other six open with the Omega, which stays and separates.
LEADING_GLYPH = re.compile(r"\s*\{!Icons\.([A-Za-z0-9_]+)\}\s")


def keyword_word(keywords, key):
    """The word the game shows for a keyword reference, or nothing."""
    name = resolve_display_name(keywords, key)
    if not name:
        return ""
    # One nested hop: a few titles quote another keyword rather than a word.
    name = KEYWORD.sub(lambda m: resolve_display_name(keywords, m.group(1)) or "", name)
    word = _bare(name)
    opening = LEADING_GLYPH.match(name)
    if word and opening and _glyph(opening.group(1)) is None:
        return " " + word
    return word


def icon_word(keywords, key):
    """The noun an inline icon stands for, read off the game's own entry for it.

    An icon in a description body is the thing itself -- "Foes drop {!Icons.Ammo}
    stuck in them" -- so dropping it changes what the sentence claims. The word
    is the game's, not ours: the bundle has an entry under the icon's own key.
    """
    glyph = _glyph(key)
    if glyph is not None:
        return glyph
    candidate = ICON_ALIASES.get(key, key)
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


def render_description(raw, keywords, fill=None):
    """The first sentence of a Codex entry, with its markup resolved or dropped.

    Everything after the first line break is the tooltip's stat table -- a stat
    name and a runtime number per line -- which carries nothing a plan is made
    from, so the rendering stops at the prose.

    `fill` is asked what each runtime substitution should become and answers the
    mark where it has nothing, so a caller that passes none gets the sentence
    every substitution marked.
    """
    if not raw:
        return ""
    text = raw.split("\\n")[0]
    text = COLUMN.sub(" ", text)
    text = KEYWORD.sub(lambda m: keyword_word(keywords, m.group(1)), text)
    text = ICON.sub(lambda m: " %s " % (icon_word(keywords, m.group(1)) or ""), text)
    text = FORMAT.sub("", text)
    text = ANY_ICON.sub("", text)
    text = SUBSTITUTION.sub((lambda m: fill(m.group(0))) if fill else VALUE, text)
    text = BUTTON.sub("", text)
    text = text.replace("\\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return BEFORE_PUNCTUATION.sub(r"\1", text)


# A substitution naming another record's display name rather than a number.
# The record does not carry one -- the game's text engine looks it up -- so the
# resolver cannot answer it and this does, off the bundle already in hand.
NAME_SPEC = re.compile(r"^TraitData\.([A-Za-z0-9_]+)\.Name$")


def _prose(value, keywords):
    """A filled value with any markup the game's own answer carried resolved.

    The `Rarity` format answers `{$Keywords.Rare}` and not a number, because
    that is what the game returns for it and its text engine resolves the
    reference afterwards. Everything else arrives as digits and passes through.
    """
    if "{" not in value:
        return value
    value = KEYWORD.sub(lambda m: keyword_word(keywords, m.group(1)), value)
    value = FORMAT.sub("", value)
    value = ANY_ICON.sub("", value)
    return re.sub(r"\s+", " ", value).strip()


def _entry(raw, bundle, keywords, resolver, trait_id, rarities):
    """One sentence, plus the numbers each rarity fills it with where they exist.

    A slot becomes a placeholder only when every rarity can answer it. The
    reasons one cannot are structural rather than per-rarity, so a slot that
    splits is a sign the record is being read wrong rather than a mixed answer
    worth shipping.
    """
    slots = []
    keys = list(rarities) or [None]

    def answer(spec, rarity):
        named = NAME_SPEC.match(spec)
        if named:
            return render_name(resolve_display_name(bundle, named.group(1)), keywords)
        found = resolver.value(trait_id, rarity, spec)
        return None if found is None else _prose(found, keywords)

    def fill(spec):
        answers = {key: answer(spec[2:-1], key) for key in keys}
        if any(found is None for found in answers.values()):
            return VALUE
        slots.append(answers)
        return "{%d}" % (len(slots) - 1)

    text = render_description(raw, keywords, fill)
    if not text or not slots:
        return text
    fallback = "Common" if "Common" in keys else keys[0]
    values = {"default": [slot[fallback] for slot in slots]}
    for key in keys:
        row = [slot[key] for slot in slots]
        if key is not None and row != values["default"]:
            values[key] = row
    return {"text": text, "values": values}


# A Hades I stat line is one tail segment, with the label and the value either
# side of a column stop. Requiring exactly one is what tells a stat line from the
# other thing that can follow the first line break: `HarvestBoonTrait` ends on a
# bare `{$TooltipData.TraitListTextString}`, a runtime list of affected boons
# with no label and no stop, and rendering that as a stat line would print a
# labelled blank. 171 of the 172 god-page segments have the stop.
COLUMN_SPLIT = re.compile(r"\\Column\s*\d+")


def _stat_sources(raw, record, bundle, game):
    """Each stat line as the (label, value) markup pair the game draws it from.

    The two games encode the same tooltip row differently. Hades II names text
    entries from the record and keeps the label and the value in two fields of
    each; Hades I writes both into the description after the first line break,
    split by a column stop.
    """
    if game == "hades2":
        pairs = []
        for line_id in (record or {}).get("StatLines") or []:
            entry = bundle.get(line_id) or {}
            if entry.get("displayName") and entry.get("description"):
                pairs.append((entry["displayName"], entry["description"]))
        return pairs
    pairs = []
    for segment in (raw or "").split("\\n")[1:]:
        halves = COLUMN_SPLIT.split(segment)
        if len(halves) == 2:
            pairs.append((halves[0], halves[1]))
    return pairs


def _stat_entry(raw, record, bundle, keywords, resolver, trait_id, rarities, game):
    """A record's stat lines, minus any whose value we cannot work out.

    Dropped rather than marked: a label is a field name, so "Blitz Damage: ?"
    is a row that says nothing. A description is the other way round -- it
    still reads without its number.

    Per line rather than per record. Hades I's Calls write two lines each, and
    three of them pair an unreadable first line with a Max Gauge Bonus that
    resolves fine. A line is still all-or-nothing across the rarities though:
    `?` at Common and a number at Epic reads as the boon doing nothing there.
    """
    pairs = _stat_sources(raw, record, bundle, game)
    keys = list(rarities) or [None]
    labels, rows = [], {key: [] for key in keys}
    for label_raw, value_raw in pairs:
        label = render_name(label_raw, keywords)
        if not label:
            continue
        # A few labels carry a substitution of their own, which render_name
        # leaves as markup. Fill it or drop the line -- a brace must never
        # reach a card. Labels don't move with rarity, so the first one does.
        if SUBSTITUTION.search(label):
            filled = []

            def label_fill(match, _filled=filled):
                found = resolver.value(trait_id, keys[0], match.group(0)[2:-1])
                if found is None:
                    _filled.append(None)
                    return ""
                return _prose(found, keywords)

            label = SUBSTITUTION.sub(label_fill, label)
            if None in filled:
                continue
            label = re.sub(r"\s+", " ", label).strip()
            if not label:
                continue
        # Buffered until every rarity answers, so a line cannot half-fill the
        # rows.
        answered = {}
        for key in keys:
            missing = []

            def fill(spec, _missing=missing, _key=key):
                found = resolver.value(trait_id, _key, spec[2:-1])
                if found is None:
                    _missing.append(spec)
                    return VALUE
                return _prose(found, keywords)

            value = render_description(value_raw, keywords, fill)
            if missing or not value:
                break
            answered[key] = value
        if len(answered) != len(keys):
            continue
        for key in keys:
            rows[key].append(answered[key])
        labels.append(label)
    if not labels:
        return None
    fallback = "Common" if "Common" in keys else keys[0]
    values = {"default": rows[fallback]}
    for key in keys:
        if key is not None and rows[key] != values["default"]:
            values[key] = rows[key]
    return {"labels": labels, "values": values}


def descriptions_for(refs, bundle, keywords, resolver=None, rarities=None,
                     records=None, game=None):
    """The rendered bundle, keyed by the ref a record names.

    Only the refs some shipped record points at: a description nothing can reach
    is game text carried for nothing, which is the exposure this pipeline is
    supposed to keep to a minimum.

    An entry whose numbers were all recovered carries a template and a row of
    values per rarity instead of a sentence; one where none were stays a string,
    so the bundle only grows where it gained something.

    A record's stat lines ride on the same entry under `stats`, which is where
    a god boon's number actually is: 160 of Hades II's 218 god-page sentences
    carry no number at all, and none of the 58 that do moves with the rarity.
    An entry that gained only stat lines is promoted from a bare string to an
    object so there is somewhere to put them.
    """
    out = {}
    for ref in sorted(set(refs)):
        raw = (bundle.get(ref) or {}).get("description")
        if resolver is None:
            rendered = render_description(raw, keywords)
        else:
            rendered = _entry(raw, bundle, keywords, resolver, ref,
                              (rarities or {}).get(ref) or [])
        if rendered and resolver is not None and records is not None:
            stats = _stat_entry(raw, records.get(ref), bundle, keywords, resolver, ref,
                                (rarities or {}).get(ref) or [], game)
            if stats:
                if isinstance(rendered, str):
                    rendered = {"text": rendered}
                rendered["stats"] = stats
        if rendered:
            out[ref] = rendered
    return out
