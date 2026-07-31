# Hades / Hades II boon-prerequisite catalog extraction

The data-extract provides a versioned JSON extraction of both games' boon/trait,
god, and keepsake data, built directly from the shipped Lua script files
(ty Supergiant!). This lil doc just explains the methodology and schema; it also
flags everything that involved judgment or inference instead of a direct field read.

## How it was built

1. `lua/dump_h1.lua` / `lua/dump_h2.lua` load the real `Color.lua`/`ColorData.lua`,
   `TraitData*.lua`, `LootData*.lua`, and `GiftData.lua`/`KeepsakeData.lua`
   files through an actual Lua 5.5 interpreter (`brew install lua`), using
   `lua/engine_stub.lua` to stand in for the small number of engine helper
   functions those files call while building their tables
   (`OverwriteTableKeys`, `ToLookup`, `ShallowCopyTable`, `CombineTables`,
   `ConcatTableValues`, `math.rad`). Any *other* undefined global read
   (`WeaponSets`, `Keywords`, `EffectData`, ...) resolves to a placeholder
   "proxy" object instead of throwing an error, which then serializes to a
   tagged string (e.g. `"<unresolved:G.WeaponSets.HeroPrimaryWeapons>"`) in the
   raw dumps; this denotes that a reference existed without making up its value,
   since we didn't load the (large, presentation-only) files that actually
   define those tables.
2. `lua/json_encode.lua` serializes the resulting Lua tables straight to
   JSON. These raw dumps live in `raw/*.json`, and are the "ground truth"
   that everything else uses.
3. `normalize_h1.py` / `normalize_h2.py` turn the raw dumps into the per-record
   schema, cross-referencing:
   - `parse_text_bundle.py` for localized names/descriptions
     (`Game/Text/en/HelpText.en.sjson` for Hades I,
     `Game/Text/en/TraitText.en.sjson` for Hades II; though
     Hades I doesn't have any separate `TraitText` files).
   - `line_index.py` for exact source `file:line` citations, via regex over the
     actual `.lua` source at the correct tab-indentation depth. This isn't
     full Lua parsing, since the Description-like string fields in these files
     contain literal `{`/`}` UI markup that would break a naive brace-matching
     scanner; instead, we'll use indentation + `Key = `.
     (shoutout to 15-150 for introducing me to regex amidst all the (albeit
     cool & educational) pain & suffering that was "the (first) core course
     dedicated to functional programming instead of imperative" :salute:
     :salute:, i.e. use literally only SML~ :sparkles: :sparkles:)
4. `validate.py` cross-checks the normalized catalogs and writes
   `validation.json` per game.

Re-run order: `dump_h1.lua`/`dump_h2.lua` (via `lua`) → `normalize_h1.py` /
`normalize_h2.py` → `write_version_stamps.py` → `validate.py`.

## Files per game (`reference/hades1/`, `reference/hades2/`)

| File | Contents |
|---|---|
| `boons.json` | Every boon/trait record (schema below) |
| `gods.json` | God records: id, name, kind, iconKey, source |
| `keepsakes.json` | Keepsake records: id, name, associatedGod, iconKey, source |
| `named_sets.json` | Named prerequisite/grouping sets defined by the actual data |
| `text.json` | Localized display text bundle (*separate* from `boons.json`); key is the same id used in `descriptionRef` |
| `version.json` | Build/version stamp (Steam buildid + LastUpdated, bundle version, extraction timestamp) |
| `validation.json` | Validation report (see below) |
| `_skipped_base_archetypes.json` (Hades II only) | Base trait templates (`BaseTrait`, `FireBoon`, `LegendaryTrait`, `SynergyTrait`, `UnityTrait`, ...) are excluded from `boons.json` bc they're not actually offerable boons themselves, and are really just kept here for transparency tbh |

## `boons.json` record schema

```
id                internal Lua table key (verbatim! i.e. never invented/localized)
god               pantheon god name if the boon belongs to one god's file; else null
duoGods           [GodA, GodB] for Hades II Duo boons, parsed from the `-- GodA x GodB`
                  comment on the definition line (Hades II TraitData_Duo.lua only) —
                  FLAGGED: this is read from a source comment, not a structured field
name              short display name, resolved from the text bundle (may be null)
descriptionRef    the same id, *if* a text-bundle entry actually exists for it;
                  else null. Purposefully kept separate from the full description
                  text (actual Description strings can be looked up in text.json).
icon              the Icon asset *key string* only (e.g. "BoonSymbolZeus") (no
                  actual image files were touched)
boonCategory      StandardOlympian | NonStandard | NpcAlly
                  FLAGGED: this isn't a literal field in the game data. See
                  "boonCategory methodology" below for the exact rule used.
godKind           PoolSlot | NonPoolSlot, derived from the god's own GodLoot
                  flag (resolved through InheritFrom); null if god is null
slot              weapon/ability slot (Melee/Secondary/Ranged/Rush/Mana/...), resolved
                  through InheritFrom chains; null if not applicable (Duo/Legendary
                  boons, keepsakes-in-main-list excluded, etc.)
rarity            array of RarityLevels keys available for this boon (most boons
                  have several possible rarities). Duo boons carry exactly one
                  key. Legendary does *not* imply a single-element array; most
                  Legendary carriers list it along with the ordinary tiers, while
                  weapon aspects list six. Note: "Elemental" doesn't appear in
                  any array in either game since it's a display-name/color
                  override, not an actual RarityLevels key (see validation notes).
exclusiveGroup    sorted array including this id + every id it's mutually exclusive
                  with, or null. Hades II: derived *only* from GameStateRequirements
                  HasNone entries whose Path ends in "TraitDictionary" (see
                  validation notes; HasNone is a generic primitive also reused for
                  unrelated room-flag checks that are excluded here).
                  Hades I: derived from RequiredFalseTrait(s); *not* confirmed
                  symmetric the way Hades II's is (see validation.json).
elementAffinity   Air | Fire | Earth | Water | Aether (Hades II only; resolved
                  through InheritFrom to the *Boon element-tag base traits).
                  Always null for Hades I (no element/Infusion mechanic exists).
elementCost       {Element: minCount, ...} for Infusion/Unity boons (Hades II
                  only), read from their GameStateRequirements Path=[...,
                  "Elements", <Element>] Comparison/Value triples. Always null
                  for Hades I.
prereq            the requirement expression, structure preserved (see below)
source            "Scripts/<file>.lua:<line>" where this boon is actually defined
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

**Hades I** — requirements are *not* centralized (see the earlier spike
finding lol); a boon's prerequisite can appear in more than one god's
`LootData.lua` `LinkedUpgrades` block (e.g. Duo boons offered by both gods),
plus/instead an inline field directly on the trait:
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
Either sub-key may be absent; if neither exists, the whole `prereq` is `null`.

## `boonCategory` methodology (Hades II) — FLAGGED: INFERRED

Not a literal data field. Rule (in priority order) using each boon's
`InheritFrom` chain and source file:
1. `CostumeTrait` in chain → `NonStandard` (cosmetic skin unlock, not gameplay)
2. Source file ties it to one specific non-Olympian NPC (Circe/Icarus/Medea/
   Narcissus/Arachne/Echo) → `NpcAlly`
3. Source file is `TraitData_Duo.lua` → `StandardOlympian` (pantheon-sourced,
   just combines two gods)
4. `InPersonOlympianTrait` or `LegacyTrait` in chain → `NonStandard` (Athena/
   Artemis/Dionysus one-off narrative cameo boons in Hades II, which are
   confirmed as *not* pool gods in Hades II specifically per `GodLoot`)
5. Source file is `TraitData_Elementals.lua` → `StandardOlympian` if a god
   could be identified from its leading comment, else `NonStandard`
6. God is a pool god (`GodLoot == true`) → `StandardOlympian`
7. Everything else (Talent/MetaUpgrade/Store/Spell/Keepsake-base/Aspect/
   Chaos/Hermes/unclassified) → `NonStandard`

## `boonCategory` methodology (Hades I) — FLAGGED: INFERRED

1. `id` matches `^[A-Za-z]+Assist` and has no `God` field/LootData
   membership → `NpcAlly`
2. `God` field (read directly since Hades I sets this natively on most traits,
   unlike Hades II) or LootData-list membership resolves to a pool god
   (`GodLoot == true`) → `StandardOlympian`
3. God resolves to a non-pool "god" (Hermes) or Chaos → `NonStandard`
4. No god at all (companion buffs, meta/debug traits, etc) → `NonStandard`

## Known limitations / explicitly flagged inferences

- **`duoGods`** (Hades II): parsed from a source-code comment
  (`-- GodA x GodB`), not a structured field. If that comment is ever
  reformatted, this will silently return null o_0 check `validation.json`'s
  `boonsWithNoPrereq`/inspect `TraitData_Duo.lua` directly to check.
- **`elementAffinity` for `TraitData_Elementals.lua` entries' `god` field**:
  when set, it's parsed from a leading `-- <God>, all elements`-style
  comment, not a structured field (marked with `"_godInferredFromComment":
  true` on the record itself).
- **Godsent Hex / Selene's Hex-Infusion mechanic**: half located, and the
  missing half isn't the half the earlier search reported. The nine Hexes
  themselves are extracted and are ordinary records in `boons.json`, from
  `Scripts/TraitData_Spell.lua`, each `slot: "Spell"` with a `Boon_Selene_*`
  icon: `SpellTimeSlowTrait`, `SpellPolymorphTrait`, `SpellLaserTrait`,
  `SpellLeapTrait`, `SpellPotionTrait`, `SpellSummonTrait`, `SpellMeteorTrait`,
  `SpellTransformTrait`, `SpellMoonBeamTrait`. The earlier search missed them by
  looking for structural names the game doesn't actually use (`Godsent`,
  `SeleneHex`, `HexUpgrade`) instead of display names that are in the text bundle.
  **Still missing: the paired Godsent-Hex boons**: Hex-mechanic doesn't exist
  for Hades I, and Hades II doesn't seem to have any records with the "hold the
  Hex AND a boon-or-keepsake of the paired Olympian" shape. Selene's own loot is
  also represented, via her `LootData_Selene.lua` `SpellDrop` table (irregular
  structure compared to the other gods; see `gods.json`'s note field).
- **`RequiredSlottedTrait` (Hades I)** is a *slot name* (e.g. `"Shout"`),
  not a trait id; confirmed by this extraction's own validation pass
  (it showed up as a dangling reference against every real trait id before
  being excluded). Not included in `exclusiveGroup`/reference validation.
- **`HasNone` (Hades II)** is a generic "this GameState list contains none
  of these strings" primitive reused for unrelated purposes depending on
  its sibling `Path`; confirmed by this extraction's validation pass
  surfacing `BlockGiftBoons` (a room flag, `Path=[...,"CurrentRoom"]`) as a
  false-positive trait reference before the fix. Only `HasNone` entries
  whose `Path` ends in `"TraitDictionary"` are treated as trait
  cross-references (`exclusiveGroup`, prereq validation).
- **Unresolved external references** (`WeaponSets.X`, `Keywords.X`,
  `EffectData.X`, etc.) inside a boon's raw table appear as
  `"<unresolved:...>"` strings if you inspect `raw/*.json` directly. They're
  expected there and mostly harmless bc the fields that carry them are
  filtered (`icon` and the other resolved scalars become `null` instead of
  shipping an actual marker). Two records are exceptions, and they show why the
  filtering has to be a check instead of a habit: `ChaosLastStandBlessing` and
  `ChaosMetaUpgradeCurse` ship `prereq.expr.OneOf` as the *string*
  `"<unresolved:G.LootData.TrialUpgrade.PermanentTraits>"` whereas every other
  record has a list of trait ids (Hades II keeps its loot tables in
  `LootSetData`, so the global `LootData` that `TraitData.lua` looks at is
  never populated and the reference just falls through to the dumper's proxy).
  The data itself is intact in `raw/h2_LootSetData.json` under
  `Chaos.TrialUpgrade.PermanentTraits`, so this is a load-order defect in
  `lua/dump_h2.lua`, not missing game data. It's recorded instead of "repaired"
  since both are Chaos boons and this project doesn't model that (at least right
  now). `validate.py` now walks the emitted boon, god and keepsake records for
  the marker, exempts exactly these two by id, and exits non-zero on any other;
  `validation.json` reports both lists. Note: the dangling-reference couldn't
  have caught this (`collect_prereq_ids` reads `OneOf` only when it
  is a list, so a string contributes no ids and the count returns 0 for precisely
  the broken records). **What the walk doesn't cover yet:** `named_sets.json`,
  `version.json` and `_skipped_base_archetypes.json` are emitted and shipped,
  but not walked. None carry a marker right now, but the point of this check was
  to stop trusting any one field's own guard, which similarly applies to these
  three files that are just one level up from that.
- **`Color.X` references**: resolved to their concrete RGBA values in the
  raw dumps (`raw/h1_Color.json` / `raw/h2_Color.json` are themselves the
  resolved source of truth); anywhere a boon or god record's data pointed
  at `Color.SomeName`, the raw dump already contains the resolved numeric
  array, not the reference (this extraction doesn't carry a "this field
  was originally a Color.X reference" breadcrumb on the boon/god records
  themselves (colors mostly appear in LootData frame/lighting fields, not
  on individual boon trait records, so this rarely applies at the boon
  level)).
- **Hades I text bundle coverage gap**: 91/449 boon records and 93/449
  names have no `HelpText.en.sjson` entry (see `boonsWithNoDescriptionRef`
  / `boonsWithNoName` in `validation.json`); probably debug-only or
  cut-content traits (many have `DebugOnly = true` in the raw data) that
  never shipped with player-facing text. Hades II's gap is smaller
  (22/612, 52/612) for the same inferred reason.

## Validation report highlights (see `validation.json` for full detail)

- **Dangling prerequisite references**: 0 in both games, after fixing the
  two false-positive classes above (`BlockGiftBoons`, `RequiredSlottedTrait`
  values); every trait id actually referenced by a prereq expression exists
  somewhere in the combined boon + keepsake catalog.
- **Rarities with no consumer**: Hades II's `Legacy` rarity color is
  declared in `ColorData.lua`, never referenced anywhere else in
  `Scripts/*.lua`, and confirmed to be dead. `Elemental` looked unused by the
  RarityLevels-key check but *is* consumed via `UnityTrait`'s `CustomRarityColor`
  override; it's not "dead" since it's just a different mechanism than the one
  being checked (see `raritiesNeverUsedByAnyBoon_notes`). The two are included
  in the same list, but for opposite reasons; read the notes before concluding
  anything from just the list itself. Hades I's `Duo` "rarity" doesn't exist as
  a RarityLevels key at all by design (Duo boons use the `Legendary`
  RarityLevels key + a `Frame="Duo"` tag); this is expected, not a gap.
- **Re-verified token-pass findings** against this independently-built
  extraction (see `hades2/validation.json`'s `knownFindingsReverified`):
  `BoonPatchPerfect == BoonPatchDuo`, `ApolloDamage(Light) ==
  AthenaDamage(Light)`, Ares's `Color`/`LightingColor`/`LootColor` all
  identical, Hephaestus/Hermes frame colors identical, Selene's
  placeholder color matches Chaos's; all are independently confirmed, from the
  boon/god extraction instead of the earlier manual grep pass.
- **Hades I asymmetric exclusion pairs**: 86 cases where `RequiredFalseTrait(s)`
  isn't mirrored back; these are read as one-directional soft blocks by default
  design (Hades I doesn't seem to maintain a Hades-II-style symmetric
  mutual-exclusion convention), so don't assume symmetry without checking
  the specific pair.
