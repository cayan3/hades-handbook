# Hades / Hades II boon-prerequisite catalog extraction

Versioned JSON extraction of both games' boon/trait, god, and keepsake data,
built directly from the shipped Lua script files (not hand-transcribed).
This document explains methodology, schema, and — per the task's explicit
requirement — flags everything that involved judgment or inference rather
than a direct field read.

## How it was built

1. `lua/dump_h1.lua` / `lua/dump_h2.lua` load the real `Color.lua`/`ColorData.lua`,
   `TraitData*.lua`, `LootData*.lua`, and `GiftData.lua`/`KeepsakeData.lua`
   files through an actual Lua 5.5 interpreter (`brew install lua`), using
   `lua/engine_stub.lua` to stand in for the small number of engine helper
   functions those files call while building their tables
   (`OverwriteTableKeys`, `ToLookup`, `ShallowCopyTable`, `CombineTables`,
   `ConcatTableValues`, `math.rad`). Any OTHER undefined global read
   (`WeaponSets`, `Keywords`, `EffectData`, ...) resolves to a placeholder
   "proxy" object instead of erroring, which serializes to a tagged string
   like `"<unresolved:G.WeaponSets.HeroPrimaryWeapons>"` in the raw dumps —
   this preserves the fact that a reference existed without fabricating its
   value, since we didn't load the (large, presentation-only) files that
   actually define those tables.
2. `lua/json_encode.lua` serializes the resulting Lua tables straight to
   JSON — these raw dumps live in `raw/*.json` and are the ground truth
   everything else derives from.
3. `normalize_h1.py` / `normalize_h2.py` turn the raw dumps into the
   requested per-record schema, cross-referencing:
   - `parse_text_bundle.py` for localized names/descriptions
     (`Game/Text/en/HelpText.en.sjson` for Hades I,
     `Game/Text/en/TraitText.en.sjson` for Hades II — confirmed by direct
     search, not assumed; Hades I has no separate `TraitText` file).
   - `line_index.py` for exact source `file:line` citations, via regex over
     the actual `.lua` source at the correct tab-indentation depth (not
     full Lua parsing — deliberately, since these files' Description-like
     string fields contain literal `{`/`}` UI markup that would break a
     naive brace-matching scanner; indentation + `Key = ` is a reliable,
     hand-verified signature throughout this codebase).
4. `validate.py` cross-checks the normalized catalogs and writes
   `validation.json` per game.

Re-run order: `dump_h1.lua`/`dump_h2.lua` (via `lua`) → `normalize_h1.py` /
`normalize_h2.py` → `write_version_stamps.py` → `validate.py`.

## Files per game (`out/hades1/`, `out/hades2/`)

| File | Contents |
|---|---|
| `boons.json` | Every boon/trait record (schema below) |
| `gods.json` | God records: id, name, kind, iconKey, source |
| `keepsakes.json` | Keepsake records: id, name, associatedGod, iconKey, source |
| `named_sets.json` | Named prerequisite/grouping sets the data itself defines |
| `text.json` | Localized display text bundle, **separate** from `boons.json`, keyed by the same id used in `descriptionRef` |
| `version.json` | Build/version stamp (Steam buildid + LastUpdated, bundle version, extraction timestamp) |
| `validation.json` | Validation report (see below) |
| `_skipped_base_archetypes.json` (Hades II only) | Base trait templates (`BaseTrait`, `FireBoon`, `LegendaryTrait`, `SynergyTrait`, `UnityTrait`, ...) excluded from `boons.json` because they are not themselves offerable boons — kept here for transparency |

## `boons.json` record schema

```
id                internal Lua table key, verbatim (never invented/localized)
god               pantheon god name if the boon belongs to one god's file, else null
duoGods           [GodA, GodB] for Hades II Duo boons, parsed from the `-- GodA x GodB`
                  comment on the definition line (Hades II TraitData_Duo.lua only) —
                  FLAGGED: this is read from a source comment, not a structured field
name              short display name, resolved from the text bundle (may be null)
descriptionRef    the same id, IF a text-bundle entry exists for it; else null.
                  Kept separate from the full description text on purpose —
                  look up the actual Description string in text.json.
icon              the Icon asset KEY STRING only (e.g. "BoonSymbolZeus") -- no image files touched
boonCategory      StandardOlympian | NonStandard | NpcAlly
                  FLAGGED: this is NOT a literal field in the game data. See
                  "boonCategory methodology" below for the exact rule used.
godKind           PoolSlot | NonPoolSlot, derived from the god's own GodLoot
                  flag (resolved through InheritFrom); null if god is null
slot              weapon/ability slot (Melee/Secondary/Ranged/Rush/Mana/...), resolved
                  through InheritFrom chains; null if not applicable (Duo/Legendary
                  boons, keepsakes-in-main-list excluded, etc.)
rarity            array of RarityLevels keys available for this boon (a boon can
                  usually drop at several rarities; Duo/Legendary boons show a
                  single-element array since they only have one RarityLevels key)
exclusiveGroup    sorted array including this id + every id it's mutually exclusive
                  with, or null. Hades II: derived ONLY from GameStateRequirements
                  HasNone entries whose Path ends in "TraitDictionary" (see
                  validation notes — HasNone is a generic primitive also reused for
                  unrelated room-flag checks, which are correctly excluded here).
                  Hades I: derived from RequiredFalseTrait(s); NOT confirmed
                  symmetric the way Hades II's is (see validation.json).
elementAffinity   Air | Fire | Earth | Water | Aether (Hades II only; resolved
                  through InheritFrom to the *Boon element-tag base traits).
                  Always null for Hades I (no elemental-infusion mechanic exists).
elementCost       {Element: minCount, ...} for Infusion/Unity boons (Hades II
                  only), read from their GameStateRequirements Path=[...,
                  "Elements", <Element>] Comparison/Value triples. Always null
                  for Hades I.
prereq            the requirement expression, structure preserved (see below)
source            "Scripts/<file>.lua:<line>" where this boon is DEFINED
```

### `prereq` shape

**Hades II** — one unified shape:
```
prereq: {
  "expr": { "OneOf": [...] }  or  { "OneFromEachSet": [[...], [...], ...] }
          or  { "GameStateRequirements": [...] }  (inline negation/threshold checks
              not registered in the central table),
  "source": "Scripts/TraitData.lua:<line>",   -- where the requirement itself is declared
  "note": present only for the inline-GameStateRequirements case
}
```
`null` if the boon has no prerequisite at all (core god boons, most Talents,
most Keepsakes/Aspects — see `boonsWithNoPrereq` in `validation.json`).

**Hades I** — requirements are NOT centralized (see the earlier spike
finding); a boon's prerequisite can appear in more than one god's
`LootData.lua` `LinkedUpgrades` block (e.g. a boon offered by either of two
gods), plus/instead an inline field directly on the trait:
```
prereq: {
  "linkedUpgradesOccurrences": [
    { "expr": {...}, "definingGod": "Zeus", "source": "Scripts/LootData.lua:<line>" },
    ...  -- one entry per god whose LootData.lua LinkedUpgrades block mentions this id
  ],
  "inline": { "RequiredOneOfTraits": [...], "RequiredFalseTrait": "...", ... },
  "inlineSource": "Scripts/TraitData.lua:<line>"
}
```
Either sub-key may be absent; the whole `prereq` is `null` if neither exists.

## `boonCategory` methodology (Hades II) — FLAGGED AS INFERRED

Not a literal data field. Rule, in priority order, using each boon's
`InheritFrom` chain and source file:
1. `CostumeTrait` in chain → `NonStandard` (cosmetic skin unlock, not gameplay)
2. Source file ties it to one specific non-Olympian NPC (Circe/Icarus/Medea/
   Narcissus/Arachne/Echo) → `NpcAlly`
3. Source file is `TraitData_Duo.lua` → `StandardOlympian` (pantheon-sourced,
   just combines two gods)
4. `InPersonOlympianTrait` or `LegacyTrait` in chain → `NonStandard` (Athena/
   Artemis/Dionysus one-off narrative cameo boons — confirmed these three
   are NOT pool gods in Hades II, per `GodLoot`)
5. Source file is `TraitData_Elementals.lua` → `StandardOlympian` if a god
   could be identified from its leading comment, else `NonStandard`
6. God is a pool god (`GodLoot == true`) → `StandardOlympian`
7. Everything else (Talent/MetaUpgrade/Store/Spell/Keepsake-base/Aspect/
   Chaos/Hermes/unclassified) → `NonStandard`

## `boonCategory` methodology (Hades I) — FLAGGED AS INFERRED

1. `id` matches `^[A-Za-z]+Assist` and has no `God` field/LootData
   membership → `NpcAlly`
2. `God` field (read directly — Hades I sets this natively on most traits,
   unlike Hades II) or LootData-list membership resolves to a pool god
   (`GodLoot == true`) → `StandardOlympian`
3. God resolves to a non-pool "god" (Hermes) or Chaos → `NonStandard`
4. No god at all (companion buffs, meta/debug traits, etc.) → `NonStandard`

## Known limitations / explicitly flagged inferences

- **`duoGods`** (Hades II): parsed from a source-code comment
  (`-- GodA x GodB`), not a structured field. If Supergiant ever reformats
  that comment, this will silently return null — check `validation.json`'s
  `boonsWithNoPrereq`/inspect `TraitData_Duo.lua` directly if in doubt.
- **`elementAffinity` for `TraitData_Elementals.lua` entries' `god` field**:
  when set, it's parsed from a leading `-- <God>, all elements`-style
  comment, not a structured field (marked with `"_godInferredFromComment":
  true` on the record itself).
- **Godsent Hex / Selene's Hex-Infusion mechanic**: as found in the earlier
  spike, this narrative/meta-progression feature (`Game/Text/en/
  HelpText.en.sjson` calls it "Godsent Hexes") has no corresponding
  `Scripts/*.lua` data structure that was found. Selene is represented here
  via her actual `LootData_Selene.lua` `SpellDrop` table (an irregular
  structure compared to the other gods — see `gods.json`'s note field),
  not via any "Hex" catalog, because no such catalog was located.
- **`RequiredSlottedTrait` (Hades I)** is a **slot name** (e.g. `"Shout"`),
  not a trait id — confirmed by this extraction's own validation pass
  (it showed up as a dangling reference against every real trait id before
  being excluded). Not included in `exclusiveGroup`/reference validation.
- **`HasNone` (Hades II)** is a generic "this GameState list contains none
  of these strings" primitive reused for unrelated purposes depending on
  its sibling `Path` — confirmed by this extraction's validation pass
  surfacing `BlockGiftBoons` (a room flag, `Path=[...,"CurrentRoom"]`) as a
  false-positive trait reference before the fix. Only `HasNone` entries
  whose `Path` ends in `"TraitDictionary"` are treated as trait
  cross-references (`exclusiveGroup`, prereq validation).
- **Unresolved external references** (`WeaponSets.X`, `Keywords.X`,
  `EffectData.X`, etc.) inside a boon's raw table appear as
  `"<unresolved:...>"` strings if you inspect `raw/*.json` directly — these
  never leak into the normalized `boons.json` schema fields themselves
  (they'd only ever land in `icon`/other resolved fields, and both are
  explicitly filtered to null if unresolved).
- **`Color.X` references**: resolved to their concrete RGBA values in the
  raw dumps (`raw/h1_Color.json` / `raw/h2_Color.json` are themselves the
  resolved source of truth); anywhere a boon or god record's data pointed
  at `Color.SomeName`, the raw dump already contains the resolved numeric
  array, not the reference — this extraction does not carry a "this field
  was originally a Color.X reference" breadcrumb on the boon/god records
  themselves (colors mostly appear in LootData frame/lighting fields, not
  on individual boon trait records, so this rarely applies at the boon
  level; it mattered for the earlier token-pass deliverable instead).
- **Hades I text bundle coverage gap**: 91/449 boon records and 93/449
  names have no `HelpText.en.sjson` entry (see `boonsWithNoDescriptionRef`
  / `boonsWithNoName` in `validation.json`) — likely debug-only or
  cut-content traits (many have `DebugOnly = true` in the raw data) that
  never shipped with player-facing text. Hades II's gap is smaller
  (22/612, 52/612) for the same likely reason.

## Validation report highlights (see `validation.json` for full detail)

- **Dangling prerequisite references**: 0 in both games, after fixing the
  two false-positive classes above (`BlockGiftBoons`, `RequiredSlottedTrait`
  values) — every trait id actually referenced by a prereq expression exists
  somewhere in the combined boon+keepsake catalog.
- **Rarities with no consumer**: Hades II's `Legacy` rarity color is
  declared in `ColorData.lua` and never referenced anywhere else in
  `Scripts/*.lua` — confirmed dead, consistent with the earlier token-pass
  finding. `Elemental` looked unused by the RarityLevels-key check but IS
  consumed via `UnityTrait`'s `CustomRarityColor` override — not dead,
  just a different mechanism than the one being checked (see
  `raritiesNeverUsedByAnyBoon_notes`). Hades I's `Duo` "rarity" doesn't
  exist as a RarityLevels key at all by design (Duo boons use the
  `Legendary` RarityLevels key + a `Frame="Duo"` tag) — expected, not a gap.
- **Re-verified token-pass findings** against this independently-built
  extraction (see `hades2/validation.json`'s `knownFindingsReverified`):
  `BoonPatchPerfect == BoonPatchDuo` ✓, `ApolloDamage(Light) ==
  AthenaDamage(Light)` ✓, Ares's `Color`/`LightingColor`/`LootColor` all
  identical ✓, Hephaestus/Hermes frame colors identical ✓, Selene's
  placeholder color matches Chaos's ✓ — all confirmed true again,
  independently, from the boon/god extraction rather than the earlier
  manual grep pass.
- **Hades I asymmetric exclusion pairs**: 86 cases where `RequiredFalseTrait(s)`
  isn't mirrored back — read as one-directional soft blocks by default
  design (Hades I doesn't appear to maintain a Hades-II-style symmetric
  mutual-exclusion convention); do not assume symmetry without checking
  the specific pair.
