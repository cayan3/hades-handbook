# art-extract

Pulls boon and god icons out of an installed copy of either game and writes them
into `apps/web/public/art/official/<game>/`.

**This runs once.** Unlike the data extractor next door, it is not meant to be
re-run on a schedule: the artwork has not moved across any patch we have looked
at, and its output is committed. That is also why it is allowed dependencies
where `data-extract` has none — nothing here has to keep working for years, and
what keeps the shipped set honest is the check that reads it, not this.

## Running it

```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python extract.py --game hades1
.venv/bin/python extract.py --game hades2
```

`--dry-run` resolves every icon key and reports what it could not find, without
touching the packages or writing anything. It is the quick way to see whether a
catalog change has left a record without art.

`--scope` takes `all` (the default), `boons`, `gods`, `elements`, `slots` or
`chrome`.

`elements` is Hades II only and pulls the five element symbols, which a node
draws in its top-left corner. They are not named by a record: the key is built
from the element, the way a god's is built from its name.

`slots` pulls the five glyphs a game draws in an equip slot nobody has filled.
Which slot each belongs to is the game's own mapping and not the names' — Hades
II files its Magick slot under `SlotIcon_Wrath`, which is the first game's Call —
so the mapping lives with the resolver rather than here.

`chrome` is the panel behind the boon menu, and the one thing this tool assembles
rather than crops. Hades II ships it as one sprite; Hades I's own menu builds it
out of three laid side by side, and a nine-slice needs both corners and the
tileable middle in one file. Both are then trimmed to their opaque bounds, which
drops a soft bloom above the Hades II tray that would otherwise be smeared along
the whole top edge by a fixed slice.

Both games are expected in the default macOS Steam library. Nothing here reads
an environment variable yet; if your install lives elsewhere, edit `GAMES` at the
top of `extract.py`.

## What it has to do to get an icon

The name in the catalog is not the name of anything in the atlas, so there are
three hops:

1. `boons.json` gives an icon key, e.g. `Boon_Aphrodite_27`.
2. The game's own animation tables (`Content/Game/Animations/*.sjson`) map that
   key to a sprite path, `GUI\Screens\BoonIcons\Aphrodite_27`. Hades I stores the
   key without the size suffix the table uses, so `_Large` is tried too, and a
   god's symbol is not in the table at all — its sprite name is built from the
   god's name.
3. `GUI.pkg_manifest` says which rectangle of which atlas page that sprite is,
   and `GUI.pkg` holds the page.

## The package format

Worth writing down, because nothing documents it and the first two attempts at
it were wrong.

A `.pkg` is a four-byte magic followed by chunks, each one a `0x01`, a
big-endian length, and an LZ4 block. Chunks are independent — a match never
reaches back into the one before — so their outputs simply concatenate. Every
package in both games walks to EOF exactly, which is the only check available
that the walk is right.

An earlier version tried to find chunk boundaries by looking for LZ4 sequences
with a zero match offset, since those are illegal and do turn up at the end of a
chunk. They turn up because a reader that has already run past the boundary is
parsing the next chunk's header as though it were compressed data. Read the
declared length instead and the problem disappears.

Inside, each atlas page is an XNB blob whose header gives a surface format, a
size and the pixel data. The format is `28`, which is the engine's own number
and matches nothing standard; it is BC7. Everything holding boon or god art uses
it — the one texture in either game that does not is the main menu portrait, in
plain RGBA.

## Output

WebP at quality 90, at whatever size the game stores. Not downscaled: Hades II
draws its icons at 88px, which is already smaller than a node needs on a phone,
so there is nothing to give away. Quality 90 measured a third the size of PNG
with nothing visible lost.
