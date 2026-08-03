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
   `validation.json` per game. It **exits non-zero** on anything that means a
   field is holding something that is not data — an unresolved placeholder, a
   god nobody has heard of, a clause nothing classified, a requirement asking
   for more branches than it has, a mutual exclusion the other record does not
   name back, a ladder depth that disagrees with its prerequisites, a block
   whose blocker the run can shed, a declared god that contradicts the loot
   table offering it. Two of its lists are advisory and fail nothing: the named
   records no source file references, and the requirement-shaped clause keys
   nothing reads.

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
| `_clause_report.json` | What the classifier dropped and why, grouped by reason, plus anything that stopped the run. Describes an extraction rather than the game, so it stays here and is not copied into the app's catalog |
| `_skipped_base_archetypes.json` (Hades II only) | Base trait templates (`BaseTrait`, `FireBoon`, `LegendaryTrait`, `SynergyTrait`, `UnityTrait`, ...) are excluded from `boons.json` bc they're not actually offerable boons themselves, and are really just kept here for transparency tbh |

## `boons.json` record schema

```
id                internal Lua table key (verbatim! i.e. never invented/localized)
god               pantheon god name if exactly one god grants the boon; else null.
                  Hades II takes it from the god's own file. Hades I has three
                  signals that can disagree: the trait's `God` field, the god's
                  menu lists, and the `LinkedUpgrades` block of whoever gates it
duoGods           [GodA, GodB] for a boon two gods grant between them. Hades II
                  parses the `-- GodA x GodB` comment on the definition line in
                  TraitData_Duo.lua — FLAGGED: a source comment, not a structured
                  field. Hades I has no Duo id space and no such comment, so the
                  pair is the two loot tables that both offer the boon
name              short display name, resolved from the text bundle, following an
                  entry's own InheritFrom where it has no name of its own (null if
                  neither it nor anything it inherits from is named)
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
tier              how deep this boon sits in its own god's ladder, first rung = 1,
                  or null for anything not on one (duos, element-gated boons,
                  Selene's paired boons, anything with no god). Counts only
                  same-god prerequisites: needing another god's boon puts you off
                  the ladder rather than one rung up it.
exclusiveGroup    sorted array including this id + every id it's mutually exclusive
                  with, or null. Only recorded when both records name each other,
                  in both games. Hades I's are *not* cliques — four of its six
                  pairs form a chain — so this is each record's own neighbourhood
                  and is not always one set shared by every member.
blockedBy         sorted array of ids that make this one unobtainable once held,
                  or null. One-directional, so order matters: taking this boon
                  first leaves both held. Every listed blocker is something the
                  run cannot shed; a keepsake-granted one is dropped instead,
                  because reporting it would be a false "impossible" for a player
                  who can simply swap keepsakes.
elementAffinity   Air | Fire | Earth | Water | Aether (Hades II only; resolved
                  through InheritFrom to the *Boon element-tag base traits).
                  Always null for Hades I (no element/Infusion mechanic exists).
                  A trait inheriting two bases fails the run rather than having
                  one of them dropped quietly; none currently does.
prereq            the gate to be offered this boon, as a requirement tree (below)
prereqSource      "Scripts/<file>.lua:<line>" where the gate is written, which for
                  most of Hades II is the central table rather than the record
activation        the separate, higher gate for an owned boon's effect to be live
                  (Hades II element-gated boons), same shape as prereq, else null
buildFailure      present only when something about this record stopped the run:
                  a clause nobody classified, a second element base, a cycle in
                  the ladder. validate.py collects these and exits non-zero, so a
                  catalog carrying one never ships.
source            "Scripts/<file>.lua:<line>" where this boon is actually defined
```

### `prereq` shape

**One shape, both games**: the requirement tree the engine evaluates, as plain
JSON with a `kind` discriminator. The games write their conditions in two
different places and several different idioms, and all of that is resolved here
rather than being passed along — a consumer of this catalog never sees a
`OneOf`, a `Path` or a `RequiredFalseTrait`.

```
{ "kind": "all",   "of": [ ... ] }              every child
{ "kind": "anyOf", "min": N, "of": [ ... ] }    at least N children
{ "kind": "hasTrait",    "trait": "<id>" }
{ "kind": "hasBoonFrom", "god": "<god>" }       any boon of that god
{ "kind": "hasElement",  "element": "Fire", "count": N }
{ "kind": "hasKeepsake", "keepsake": "<id>" }
{ "kind": "hasTalent",   "talent": "<id>" }     Hades I Mirror selection
```

`null` if the boon has no prerequisite at all (core god boons, most Talents,
most Keepsakes/Aspects — see `boonsWithNoPrereq` in `validation.json`). Note that
"no prerequisite" now genuinely means no *build* prerequisite: a boon gated only
on which weapon you are carrying or on what the current room is offering has
those conditions dropped, because they describe when the game rolls a reward
rather than what a build can reach.

`{ "type": "UNCLASSIFIED_NEGATION" }` where a clause did not classify. The run
fails in that case, so this only ever appears in output nobody ships; it is there
so that half a gate cannot be mistaken for a whole one while you read the file.

**What was dropped, and why**, is in `_clause_report.json` beside the catalog —
grouped by reason, with the ids. Without it there is no way to tell a boon with
no prerequisite from a boon whose prerequisite was discarded, short of going back
to the raw dump. It is not copied into the app's catalog: it describes an
extraction rather than the game.

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

1. Two loot tables offer it → a Duo. `StandardOlympian` when both are pool
   gods, which every real one is
2. `id` matches `^[A-Za-z]+Assist` and has no `God` field/LootData
   membership → `NpcAlly`
3. `God` field (read directly since Hades I sets this natively on most traits,
   unlike Hades II) or the one loot table offering it resolves to a pool god
   (`GodLoot == true`) → `StandardOlympian`
4. God resolves to a non-pool "god" (Hermes) or Chaos → `NonStandard`
5. No god at all (companion buffs, meta/debug traits, etc) → `NonStandard`

The order matters at step 1: two of the twenty-eight Duos also declare a single
`God`, and reading that first files a two-god boon under one of them.

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
  being excluded). It is a real prerequisite even so — a Call is picked up
  during a run and kept — so it expands into "hold any one of the traits in that
  slot", built from the catalog's own slot field rather than from a list
  anybody maintains. All nine carriers name the Call slot.
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
