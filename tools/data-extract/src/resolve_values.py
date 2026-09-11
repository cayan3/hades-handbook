"""The numbers a description leaves to the engine, worked out from the tables.

A Codex sentence writes `{$TooltipData.ExtractData.Damage}` where the game will
draw a value off the run. About four fifths of those are recoverable here: the
games compute them from the trait's own record by a fixed path -- ramp the
values by the rarity multiplier, report the nested ones up to the top of the
record, then read and format them -- and none of that path needs the run.

What is left needs something this pipeline does not carry: a projectile's or
effect's base stat, a total across the traits already held, or a roll the run
has already made. Those come back as nothing and the caller keeps its mark.

Both games roll inside a band rather than picking a number: Hades I gives most
rarities a `MinMultiplier`/`MaxMultiplier` pair, and either game's `BaseMin`/
`BaseMax` is a range. So a value here is a band whose ends are the two draws the
game can make, and a band whose ends are equal is an exact number.
"""

import copy
import math

# Keys Hades II's ProcessTraitData will not descend into. Hades I has no such
# list and skips three change tables by name instead.
H2_UNPROCESSED = frozenset({
    "InheritFrom", "ExtractValues", "ReportValues", "WeaponDataOverride",
    "ConsumedVoiceLines", "OnSpawnVoiceLines", "GiftTextLineSets",
    "InteractTextLineSets", "UpgradeMenuOpenVoiceLines", "UseFunctionNames",
    "UseFunctionArgs", "PurchaseRequirements", "GameStateRequirements",
    "ValidWeapons",
})
H1_UNPROCESSED = frozenset({"PropertyChanges", "EnemyPropertyChanges", "WeaponDataOverride"})
CHANGE_KEYS = {
    "hades1": ("PropertyChanges", "EnemyPropertyChanges"),
    "hades2": ("PropertyChanges", "ActivatedPropertyChanges"),
}


class Unresolved(Exception):
    """Raised where a value depends on something the pipeline does not carry."""

    def __init__(self, why):
        self.why = why
        super().__init__(why)


class Band:
    """The two draws the game can make for one value; equal ends mean exact."""

    __slots__ = ("lo", "hi")

    def __init__(self, lo, hi=None):
        self.lo = lo
        self.hi = lo if hi is None else hi

    @property
    def exact(self):
        return self.lo == self.hi

    def map(self, f):
        """Apply a monotonic step to both ends, keeping them in order."""
        a, b = f(self.lo), f(self.hi)
        return Band(min(a, b), max(a, b))

    def __repr__(self):
        return format_band(self)


def format_band(band):
    """The band as the sentence shows it: one number, or the two ends joined."""
    lo, hi = _trim(band.lo), _trim(band.hi)
    return lo if lo == hi else "%s-%s" % (lo, hi)


def _trim(value):
    value = round(value, 2)
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return ("%.2f" % value).rstrip("0").rstrip(".")


def _as_number(value):
    """Lua coerces a numeric string in arithmetic, and a few records rely on it."""
    if isinstance(value, bool):
        raise Unresolved("non-numeric")
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            raise Unresolved("non-numeric")
    raise Unresolved("non-numeric")


def _round(value, places=0):
    """Lua's round in both games: half away from zero at a decimal place."""
    factor = 10 ** places
    return math.floor(value * factor + 0.5) / factor


def merged_record(defs, trait_id, _seen=None, _depth=0):
    """A record's own fields plus the ones it inherits, child first.

    Top-level keys only, which is the rule the rest of the extractor already
    follows. It loses the levels a parent adds to a `RarityLevels` a child also
    declares, so callers ask only for rarities the record itself declares.
    """
    if _depth > 8:
        return {}
    _seen = _seen or set()
    if trait_id in _seen:
        return {}
    _seen.add(trait_id)
    data = defs.get(trait_id)
    if not isinstance(data, dict):
        return {}
    out = dict(data)
    for parent in data.get("InheritFrom") or []:
        if isinstance(parent, str):
            for key, value in merged_record(defs, parent, _seen, _depth + 1).items():
                out.setdefault(key, value)
    return out


def multiplier_of(rarity_data):
    """One rarity's multiplier, as a band where the game rolls between two."""
    if not isinstance(rarity_data, dict):
        return Band(1.0)
    if rarity_data.get("Multiplier") is not None:
        return Band(_as_number(rarity_data["Multiplier"]))
    low = rarity_data.get("MinMultiplier")
    if low is None:
        return Band(1.0)
    high = _as_number(rarity_data.get("MaxMultiplier", low))
    low = _as_number(low)
    return Band(min(low, high), max(low, high))


def _process_value(band, ramp, game):
    """The rounding and clamping every ramped value passes through."""
    def one(value):
        if ramp.get("AsInt"):
            value = _round(value)
        elif ramp.get("ToNearest"):
            value = math.floor(value / ramp["ToNearest"]) * ramp["ToNearest"]
        if ramp.get("DecimalPlaces") is not None:
            value = _round(value, ramp["DecimalPlaces"])
        else:
            value = _round(value, 2)
        if game == "hades2":
            if ramp.get("MaximumValue") is not None:
                value = min(value, ramp["MaximumValue"])
            if ramp.get("MinimumSourceValue") is not None:
                value = max(value, ramp["MinimumSourceValue"])
        return value

    return band.map(one)


def _ramp(table, multiplier, rarity, game):
    """One table's value scaled by the rarity, or None if it carries no base.

    The authors decide what scales by wrapping it: `BaseAmount = 30` beside a
    `ReportValues` is a flat 30 at every rarity, while `{ BaseValue = 30 }` is
    the same number on the ladder. Reading the ladder onto both is the way to
    print a number that is wrong and looks right.
    """
    if table.get("CustomRarityMultiplier") and rarity:
        override = table["CustomRarityMultiplier"].get(rarity)
        if isinstance(override, dict):
            multiplier = multiplier_of(override)
    if table.get("MultipliedByElement"):
        raise Unresolved("element-scaled")
    if game == "hades1":
        if table.get("IgnoreRarity"):
            multiplier = Band(1.0)
        if table.get("DepthMult"):
            raise Unresolved("depth-scaled")

    if table.get("BaseValue") is not None:
        base = Band(_as_number(table["BaseValue"]))
    elif table.get("BaseMin") is not None:
        low = _as_number(table["BaseMin"])
        high = _as_number(table.get("BaseMax", table["BaseMin"]))
        base = Band(min(low, high), max(low, high))
    else:
        return None

    def combine(value, factor):
        if table.get("SourceIsMultiplier"):
            return 1 + (value - 1) * factor
        if table.get("SourceIsNegativeMultiplier"):
            return 1 + (1 - value * factor)
        if game == "hades2" and table.get("SourceIsDivisor"):
            return 1 - ((1 - value) / factor)
        return value * factor

    corners = [combine(b, m) for b in (base.lo, base.hi) for m in (multiplier.lo, multiplier.hi)]
    return _process_value(Band(min(corners), max(corners)), table, game)


def _descend(node, multiplier, rarity, game):
    """Replace every ramp table under a node with the value it ramps to."""
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if game == "hades2" and key in H2_UNPROCESSED:
                out[key] = value
            elif isinstance(value, dict):
                out[key] = _ramped_or_deeper(value, multiplier, rarity, game)
            elif isinstance(value, list):
                out[key] = _descend(value, multiplier, rarity, game)
            else:
                out[key] = value
        return out
    if isinstance(node, list):
        return [
            _descend(item, multiplier, rarity, game) if isinstance(item, (dict, list)) else item
            for item in node
        ]
    return node


def _ramped_or_deeper(table, multiplier, rarity, game):
    try:
        band = _ramp(table, multiplier, rarity, game)
    except Unresolved:
        band = None
    return band if band is not None else _descend(table, multiplier, rarity, game)


def process_trait(record, rarity, game):
    """A record with its rarity applied, which is what the tooltip reads from."""
    record = copy.deepcopy(record)
    multiplier = Band(1.0)
    levels = record.get("RarityLevels")
    if rarity and isinstance(levels, dict) and isinstance(levels.get(rarity), dict):
        multiplier = multiplier_of(levels[rarity])

    changes = CHANGE_KEYS[game]
    out = {}
    for key, value in record.items():
        skipped = key in changes or (
            key in H2_UNPROCESSED if game == "hades2" else key in H1_UNPROCESSED
        )
        if skipped or not isinstance(value, (dict, list)):
            out[key] = value
        elif isinstance(value, dict):
            out[key] = _ramped_or_deeper(value, multiplier, rarity, game)
        else:
            out[key] = _descend(value, multiplier, rarity, game)

    # A change entry is ramped into its own ChangeValue rather than in place,
    # and Hades I writes the result back over BaseValue as well.
    for change_key in changes:
        entries = record.get(change_key)
        if not isinstance(entries, list):
            continue
        processed = _descend(entries, multiplier, rarity, game)
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            if entry.get("BaseMin") is None and entry.get("BaseValue") is None:
                continue
            own = multiplier
            if entry.get("CustomRarityMultiplier") and rarity:
                override = entry["CustomRarityMultiplier"].get(rarity)
                if isinstance(override, dict):
                    own = multiplier_of(override)
            try:
                band = _ramp(entry, own, rarity, game)
            except Unresolved:
                continue
            if band is None:
                continue
            processed[index]["ChangeValue"] = band
            if game == "hades1":
                processed[index]["BaseValue"] = band
        out[change_key] = processed
    return out


# Formats that are arithmetic on the value and nothing else.
PURE_FORMATS = {
    "Percent": lambda v: v * 100,
    "TimesOneHundred": lambda v: v * 100,
    "TimesOneHundredPercent": lambda v: v * 100 * 100,
    "FlatPercent": lambda v: abs(v * 100),
    "PercentDelta": lambda v: (v - 1) * 100,
    "FlatPercentDelta": lambda v: abs((v - 1) * 100),
    "NegativePercentDelta": lambda v: (1 - v) * 100,
    "PercentReciprocalDelta": lambda v: _reciprocal(v),
    "TotalTargets": lambda v: v,
}


def _reciprocal(value):
    """The one format that can divide by its own input, which a ladder can reach."""
    if value == 0:
        raise Unresolved("divide-by-zero")
    return (1 / value) * 100 - 100

# Formats that scale by something the run accumulates. The factor is exactly one
# for a run holding nothing else, which is the value the game shows at the offer
# and the only one a static catalog can mean.
BASELINE_FORMATS = {
    "LuckModifiedPercent": lambda v: min(v * 100, 100),
    "PercentHeal": lambda v: v * 100,
    "SpeedModifiedDuration": lambda v: v,
    "FlatHeal": lambda v: v,
    "FlatHealBonusOnly": lambda v: v,
    "MultipliedMoney": lambda v: _round(v),
}

# Formats read off the run itself rather than off a trait it scales.
# `ManaSpendCost` and `AdjustedBaseManaSpendCost` used to sit here and do not
# belong: the game's branch for them forks on whether it is drawing a boon-info
# panel, and that arm reads the weapon table and the record rather than the run.
# Only the other arm sums modifiers over the traits a run holds.
RUN_FORMATS = frozenset({
    "TotalDamageTaken", "EasyModeMultiplier",
    "SlottedBoon", "FinalBoss", "TotalHeroTraitValuePercent", "TotalHeroTraitValue",
    "ResourceAmount", "TotalMetaUpgradeChangeValue", "ExistingAmmoDropDelay",
    "ExistingAmmoReloadDelay", "ExistingWrathStocks", "EXWrathDuration", "MaxHealth",
    "MaxHealthIgnoreCap", "MaxMana", "PercentPlayerHealth", "PercentPlayerHealthFountain",
    "UniqueGodPercentDelta", "RemainingBiomes", "CardRarity",
    "AmmoDelayDivisor", "AmmoReloadDivisor", "WrathStocks", "HealingDrop",
})

# The ladder the game indexes for `Format: "Rarity"`, transcribed from
# `TraitRarityData.RarityUpgradeOrder`. The dump does not carry that table, so
# the oracle calls the game's own `GetRarityKey` over the game's own copy and
# the check fails if this and it ever disagree.
RARITY_ORDER = ("Common", "Rare", "Epic", "Heroic")


def _rarity_keyword(band):
    """`Format: "Rarity"` answers a word, and the game answers it as markup.

    `GetRarityKey` is a plain index into a record-data table, so this needs
    nothing from the run -- but the game returns `{$Keywords.<Rarity>}` and
    leaves its text engine to resolve the reference, so this returns the same
    thing and the renderer does that hop.
    """
    if not band.exact:
        raise Unresolved("rarity-band")
    index = int(_round(band.lo))
    if not 1 <= index <= len(RARITY_ORDER):
        raise Unresolved("rarity-index:%d" % index)
    return "{$Keywords.%s}" % RARITY_ORDER[index - 1]


# An un-upgraded aspect is rank 1, and rank 1 of `TraitRarityData
# .WeaponRarityUpgradeOrder` is Common. Transcribed rather than dumped, like the
# boon ladder beside it, and held honest the same way: the oracle runs the
# game's own lookup over the game's own table, so the check fails if the two
# ever disagree.
WEAPON_BASE_RANK = "Common"

# Formats that say which table the value comes out of rather than how to shape
# it. `_read_value` has already done the work by the time the format branch runs.
READ_FORMATS = frozenset({"ManaSpendCost", "AdjustedBaseManaSpendCost"})


def _mana_spend_cost(weapons, defs, table, entry):
    """What a spell costs, the way the game's own boon-info panel works it out.

    The game forks here on whether it is drawing that panel. This is the arm it
    takes there, which reads the weapon's own cost and the linked aspect's
    record; the other arm sums modifiers over the traits a run holds and is the
    reason this pair was filed as run-dependent to begin with.

    The adjustment is computed rather than assumed zero. It is zero today --
    the only aspect that declares one multiplies it by its Common rank, which
    is 0 -- but that is a number in the game's data, not a property of the
    mechanic, so reading it is what keeps a patch from moving it silently.
    """
    weapon = (weapons or {}).get(entry.get("WeaponName"))
    if not isinstance(weapon, dict):
        raise Unresolved("external:WeaponData")
    if weapon.get("ManaSpendCost") is None:
        raise Unresolved("no-source")
    cost = _as_number(weapon["ManaSpendCost"])
    if entry.get("Format") == "AdjustedBaseManaSpendCost":
        # The record's own reported adjustment, already on the rarity ladder.
        key = entry.get("Key") or "ChangeValue"
        if table.get(key) is None:
            raise Unresolved("no-source")
        reported = table[key]
        reported = reported if isinstance(reported, Band) else Band(_as_number(reported))
        return reported.map(lambda v: cost + v)
    linked = weapon.get("LinkedTraitManaSpendAdjustment")
    if linked:
        record = merged_record(defs, linked)
        rank = (record.get("RarityLevels") or {}).get(WEAPON_BASE_RANK) or {}
        add = ((record.get("ManaSpendCostModifiers") or {}).get("Add") or {}).get("BaseValue")
        if rank.get("Multiplier") is None or add is None:
            raise Unresolved("no-source")
        cost += _as_number(add) * _as_number(rank["Multiplier"])
    return Band(cost)


RUN_MULTIPLIERS = (
    "MultiplyByMissingHealth", "MultiplyByOlympianBoonCount",
    "MultiplyByMissingLastStands", "MultiplyBySpentLastStands",
)


def _format_extracted(band, entry, game):
    """The format branch, then the tail every branch falls through to."""
    for flag in RUN_MULTIPLIERS:
        if entry.get(flag):
            raise Unresolved("run-multiplier")
    fmt = entry.get("Format")
    if fmt == "Rarity":
        return _rarity_keyword(band)
    if fmt in READ_FORMATS:
        # Named where to read the value, not what to do to it afterwards; the
        # tail below still applies.
        fmt = None
    if fmt is not None:
        if fmt in PURE_FORMATS:
            band = band.map(PURE_FORMATS[fmt])
        elif fmt in BASELINE_FORMATS:
            band = band.map(BASELINE_FORMATS[fmt])
        else:
            raise Unresolved("format:%s" % fmt)
    if entry.get("AbsoluteValue") is not None:
        band = band.map(abs)
    if game == "hades2" and entry.get("MaximumValue") is not None:
        band = band.map(lambda v: min(entry["MaximumValue"], v))
    places = entry.get("DecimalPlaces") or 0
    return band.map(lambda v: _round(v, places))


def _read_value(table, entry, weapons=None, defs=None):
    """The value an extract entry names, from the table it reads."""
    if entry.get("External"):
        raise Unresolved("external:%s" % entry.get("BaseType"))
    if entry.get("Format") in ("ManaSpendCost", "AdjustedBaseManaSpendCost"):
        return _mana_spend_cost(weapons, defs, table, entry)
    if entry.get("Format") in RUN_FORMATS:
        raise Unresolved("run-format:%s" % entry.get("Format"))
    value = table.get(entry.get("Key") or "ChangeValue")
    if value is None:
        raise Unresolved("no-source")
    if isinstance(value, Band):
        return value
    if isinstance(value, bool):
        raise Unresolved("non-numeric")
    if isinstance(value, (int, float)):
        return Band(value)
    if isinstance(value, str) and not value.startswith("<unresolved:"):
        try:
            return Band(float(value))
        except ValueError:
            pass
    raise Unresolved("non-numeric")


def _take(values, why, table, entry, game, weapons=None, defs=None):
    """Record one extract entry's answer, or why there isn't one.

    A later entry writing the same name overwrites an earlier one, so when the
    later one cannot be resolved the earlier value is not this name's answer.
    Keeping it would print a number the game replaces.
    """
    name = entry.get("ExtractAs")
    if not name:
        return
    try:
        values[name] = _format_extracted(_read_value(table, entry, weapons, defs), entry, game)
        why.pop(name, None)
    except Unresolved as unresolved:
        why[name] = unresolved.why
        values.pop(name, None)


def _extract_hades2(top, weapons=None, defs=None):
    """Report nested values up to the top of the record, then read them off it."""
    def walk(node, depth):
        if isinstance(node, dict):
            # A report at any depth writes into the top of the record, so the
            # top's own keys are snapshotted before descending into them.
            for key, value in list(node.items()):
                if key != "ReportValues" and isinstance(value, (dict, list)):
                    walk(value, depth + 1)
            reports = node.get("ReportValues")
            if depth >= 1 and isinstance(reports, dict):
                for name, source in reports.items():
                    if node.get(source) is not None:
                        top[name] = node[source]
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, (dict, list)):
                    walk(item, depth + 1)

    walk(top, 0)
    values, why = {}, {}
    for entry in top.get("ExtractValues") or []:
        if isinstance(entry, dict):
            _take(values, why, top, entry, "hades2", weapons, defs)
    _combine(values, why, top)
    return values, why


def _combine(values, why, top):
    """The three arithmetic links one extract entry can declare on another."""
    for entry in top.get("ExtractValues") or []:
        if not isinstance(entry, dict):
            continue
        name = entry.get("ExtractAs")
        if name not in values or not isinstance(values[name], Band):
            continue
        try:
            if entry.get("Subtractor"):
                other = values[entry["Subtractor"]]
                values[name] = Band(values[name].lo - other.hi, values[name].hi - other.lo)
            if entry.get("Multiplier"):
                other = values[entry["Multiplier"]]
                corners = [a * b for a in (values[name].lo, values[name].hi)
                           for b in (other.lo, other.hi)]
                values[name] = Band(min(corners), max(corners))
            if entry.get("Negative"):
                values[name] = Band(-values[name].hi, -values[name].lo)
        except KeyError:
            why[name] = "combinator"
            values.pop(name, None)


def _extract_hades1(top, weapons=None, defs=None):
    """Hades I has no report step: an entry reads the table it sits in."""
    values, why = {}, {}

    def walk(node):
        if isinstance(node, dict):
            for entry in node.get("ExtractValues") or []:
                if isinstance(entry, dict):
                    _take(values, why, node, entry, "hades1")
            single = node.get("ExtractValue")
            if isinstance(single, dict):
                _take(values, why, node, single, "hades1")
            for key, value in node.items():
                if key not in ("ExtractValues", "ExtractValue") and isinstance(value, (dict, list)):
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(top)
    return values, why


EXTRACT = {"hades1": _extract_hades1, "hades2": _extract_hades2}


def extracted_for(defs, trait_id, rarity, game, weapons=None):
    """Every value a description could ask this record for, at one rarity."""
    top = process_trait(merged_record(defs, trait_id), rarity, game)
    values, why = EXTRACT[game](top, weapons, defs)
    return top, values, why


# ---------------------------------------------------------------------------
# What a substitution in a description names
# ---------------------------------------------------------------------------

import re  # noqa: E402  -- kept beside the parsing this half does

SPEC = re.compile(r"\{\$([^}]*)\}")
INDEX = re.compile(r"^\[?(\d+)\]?$")
STAT_DISPLAY = re.compile(r"^StatDisplay(\d+)$")

# Percent formats decide whether a StatDisplay line carries a percent sign.
PERCENT_FORMATS = frozenset({
    "LuckModifiedPercent", "Percent", "PercentHeal", "PercentDelta",
    "NegativePercentDelta", "PercentOfBase", "TimesOneHundredPercent",
    "Divisor", "PercentReciprocalDelta",
})

# The two constants Hades II lets a description name directly.
CONSTANTS = {"Two": 2, "OneHundred": 100}


def _walk_path(root, parts):
    """A dotted path into a record; a numeric segment indexes a list, from one."""
    node = root
    for part in parts:
        index = INDEX.match(part)
        if index and isinstance(node, list):
            position = int(index.group(1)) - 1
            if position < 0 or position >= len(node):
                return None
            node = node[position]
        elif isinstance(node, dict):
            node = node.get(part)
        else:
            return None
        if node is None:
            return None
    return node


def _as_band(value):
    if isinstance(value, Band):
        return value
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return Band(value)
    return None


def _stat_display(top, values, position):
    """StatDisplayN indirects to the Nth entry the tooltip lists automatically."""
    seen = 0
    for entry in top.get("ExtractValues") or []:
        if not isinstance(entry, dict) or entry.get("SkipAutoExtract"):
            continue
        seen += 1
        if seen == position:
            band = values.get(entry.get("ExtractAs"))
            return band, entry.get("Format") in PERCENT_FORMATS
    return None, False


class Resolver:
    """One game's answer to "what number goes here", cached per trait and rarity.

    Answers a formatted string so the caller never handles a band: a percent
    suffix in the markup is the engine's sign rather than the value's, so it is
    attached here where the two are both in hand.
    """

    def __init__(self, defs, game, weapons=None):
        self.defs = defs
        self.game = game
        self.weapons = weapons
        self._cache = {}

    def _state(self, trait_id, rarity):
        key = (trait_id, rarity)
        if key not in self._cache:
            self._cache[key] = extracted_for(self.defs, trait_id, rarity, self.game, self.weapons)
        return self._cache[key]

    def value(self, trait_id, rarity, spec):
        """The text a substitution resolves to, or None to leave the mark."""
        path, _, suffix = spec.partition(":")
        parts = path.split(".")
        band, percent = self._band(trait_id, rarity, parts)
        if band is None:
            return None
        if isinstance(band, str):
            # A word rather than a measurement, so the engine's percent sign
            # would be nonsense on it.
            return band
        return format_band(band) + ("%" if percent or suffix in ("P", "F") else "")

    def _band(self, trait_id, rarity, parts):
        top, values, _ = self._state(trait_id, rarity)
        root = parts[0]
        if root == "TooltipData":
            if len(parts) > 2 and parts[1] == "ExtractData":
                return values.get(parts[2]), False
            if len(parts) == 2:
                stat = STAT_DISPLAY.match(parts[1])
                if stat:
                    return _stat_display(top, values, int(stat.group(1)))
            band = _as_band(_walk_path(top, parts[1:]))
            if band is not None:
                return band, False
            # Hades I merges what it extracts back over the record itself, so a
            # bare name is an extracted value rather than a field.
            return (values.get(parts[1]) if len(parts) == 2 else None), False
        if root == "TraitData" and len(parts) > 2:
            # Another record's raw table, which the engine never rarity-scales.
            other = merged_record(self.defs, parts[1])
            return _as_band(_walk_path(other, parts[2:])), False
        if root == "ConstantsData" and len(parts) == 2 and parts[1] in CONSTANTS:
            return Band(CONSTANTS[parts[1]]), False
        return None, False
