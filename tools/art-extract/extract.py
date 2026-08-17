"""Crop every icon the catalog asks for out of the game's atlases.

This runs once. The art it reads does not change between patches in any way this
project has observed, and its output is committed -- so unlike the data
extractor beside it, there is no case for re-running it on a schedule and no
reason for it to stay dependency-free. What keeps the shipped set honest is the
verifier, which needs none of this.

    python3 extract.py --game hades1 --scope gods
"""
import argparse
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

import atlas
import pkg
from resolve import Resolver

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(REPO, "apps", "web", "public", "art", "official")
CATALOG = os.path.join(REPO, "packages", "catalog", "data")

STEAM = "~/Library/Application Support/Steam/steamapps/common"
GAMES = {
    "hades1": {
        "content": STEAM + "/Hades/Game.macOS.app/Contents/Resources/Content",
        "package": "/macOS/Packages/GUI.pkg",
    },
    "hades2": {
        "content": STEAM + "/Hades II/Hades II.app/Contents/Resources/Content",
        "package": "/Packages/1080p/GUI.pkg",
    },
}

# The nine Hexes are the one thing a god-attributed filter misses that belongs in
# the set: they are Selene's and she is not a boon god.
HEXES = {
    "SpellTimeSlowTrait", "SpellPolymorphTrait", "SpellLaserTrait",
    "SpellLeapTrait", "SpellPotionTrait", "SpellSummonTrait",
    "SpellMeteorTrait", "SpellTransformTrait", "SpellMoonBeamTrait",
}

# Hades II only, and asked for by element rather than by an `icon` field: no
# record carries one, because an element symbol marks a boon's affinity from the
# outside instead of being that boon's own picture.
ELEMENTS = ("Aether", "Air", "Earth", "Fire", "Water")

# The glyph each game draws in a slot nobody has filled. Both ship the same five
# names, and which slot each belongs to is the game's own mapping rather than the
# names' -- Hades II files its Magick slot under Wrath, the first game's Call.
# That covers 5 of 5 core slots in Hades I and 5 of 6 in Hades II, the Hex having
# no glyph in either tray.
SLOT_ICONS = ("Attack", "Secondary", "Ranged", "Dash", "Wrath")

# The parts of the games' own interface this product borrows, each named for
# what it is rather than for the sprite it came from, and each laid left to right
# from however many pieces the game ships. The Loadout's tray is the one part
# assembled rather than cropped: Hades II ships it as one sprite, Hades I's own
# menu composites three side by side, and a nine-slice needs both corners and the
# tileable middle in one file. `_NoHeader` because this product draws its own
# heading. The save slot is one sprite in both, taller than it is wide, which is
# the shape the save screen already draws.
CHROME_PARTS = {
    "hades1": {
        "Chrome_Panel": (
            "GUI\\Screens\\TraitTray",
            "GUI\\Screens\\TraitTray_Center",
            "GUI\\Screens\\TraitTray_Right",
        ),
        "Chrome_SaveSlot": ("GUI\\Screens\\SaveProfileSlot",),
    },
    "hades2": {
        "Chrome_Panel": ("GUI\\HUD\\TraitTrayBacking_NoHeader",),
        "Chrome_SaveSlot": ("GUI\\Screens\\SaveProfileSlot",),
    },
}

# Visually indistinguishable from lossless on this art at a third of the size,
# measured over extracted icons rather than assumed.
QUALITY = 90

# Hades II draws a god's symbol as a glow card: the same design Hades I ships,
# small and centred inside a wide radial glow. Measured over the shipped set at
# alpha 190, the glyph is 27-32% of a 509x508 canvas against 76-87% for Hades I's,
# whose alpha profile is flat from 60 up and so carries no such glow at all.
# Emitted as-is the two sets read as two styles wherever they meet, and a symbol
# renders at a third of the size its neighbour does.
SYMBOL_FILL = 0.80  # what Hades I's glyphs occupy of their own box
SYMBOL_CORE = 190   # above this is the glyph and its own tight halo; below is glow
SYMBOL_FADE = 0.72  # where the crop starts fading, as a share of the half-width


def reframe(im, np):
    """Crop a Hades II god symbol to its glyph and fade the rest of the glow out.

    A plain crop leaves a hard square edge partway down a soft gradient, so the
    remainder is faded to nothing at the box edge instead. What survives is the
    glyph and the tight halo drawn into it above `SYMBOL_CORE`; what goes is the
    wide glow, which is what made the symbol read small.
    """
    im = im.astype(np.float32)
    ys, xs = np.where(im[:, :, 3] > SYMBOL_CORE)
    if len(xs) == 0:
        return im.astype(np.uint8)

    side = int(round(max(ys.max() - ys.min() + 1, xs.max() - xs.min() + 1) / SYMBOL_FILL))
    half = side // 2
    y0 = int(round((ys.min() + ys.max()) / 2)) - half
    x0 = int(round((xs.min() + xs.max()) / 2)) - half

    out = np.zeros((side, side, 4), np.float32)
    sy0, sx0 = max(y0, 0), max(x0, 0)
    sy1, sx1 = min(y0 + side, im.shape[0]), min(x0 + side, im.shape[1])
    out[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = im[sy0:sy1, sx0:sx1]

    yy, xx = np.mgrid[0:side, 0:side]
    radius = np.sqrt((yy - half) ** 2 + (xx - half) ** 2) / max(half, 1)
    out[:, :, 3] *= np.clip((1.0 - radius) / (1.0 - SYMBOL_FADE), 0, 1)
    return out.astype(np.uint8)


def tighten(im, np):
    """Crop a boon icon to its own drawn box, kept square.

    Hades II's icons sit inside a transparent margin -- measured, the drawn box
    is 0.955-0.977 of the file against Hades I's 0.980-1.000 -- and a node draws
    them with `object-fit: cover`, so that margin becomes a ring of the page's
    own ground between the artwork and the outline around it. Squared rather than
    cropped tight, or an icon whose art is wider than it is tall would be
    stretched by the same rule that is meant to fill the box.
    """
    ys, xs = np.where(im[:, :, 3] > 200)
    if len(xs) == 0:
        return im
    side = max(ys.max() - ys.min(), xs.max() - xs.min()) + 1
    cy, cx = (ys.min() + ys.max()) // 2, (xs.min() + xs.max()) // 2
    y0, x0 = cy - side // 2, cx - side // 2

    out = np.zeros((side, side, 4), im.dtype)
    sy0, sx0 = max(y0, 0), max(x0, 0)
    sy1, sx1 = min(y0 + side, im.shape[0]), min(x0 + side, im.shape[1])
    out[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = im[sy0:sy1, sx0:sx1]
    return out


def wanted(game, scope):
    """Icon keys to extract, and what asks for each.

    A record's god is what separates a boon from the rest of the trait table --
    hammers, costumes, NPC offerings and weapon traits are attributed to nobody
    and are out of scope, along with Chaos.
    """
    boons = json.load(open(os.path.join(CATALOG, game, "boons.json")))
    gods = json.load(open(os.path.join(CATALOG, game, "gods.json")))
    keys = {}
    if scope in ("all", "boons"):
        for trait_id, record in boons.items():
            god = record.get("god")
            in_scope = trait_id in HEXES or record.get("duoGods") or (god and god != "Chaos")
            if in_scope and record.get("icon"):
                keys.setdefault(record["icon"], []).append(trait_id)
    if scope in ("all", "gods"):
        for name, record in gods.items():
            if record.get("iconKey"):
                keys.setdefault(record["iconKey"], []).append("god:" + name)
    if scope in ("all", "elements") and game == "hades2":
        for element in ELEMENTS:
            keys.setdefault("Element_" + element, []).append("element:" + element)
    if scope in ("all", "keepsakes"):
        keepsakes = json.load(open(os.path.join(CATALOG, game, "keepsakes.json")))
        for keepsake_id, record in keepsakes.items():
            if record.get("iconKey"):
                keys.setdefault(record["iconKey"], []).append("keepsake:" + keepsake_id)
    if scope in ("all", "slots"):
        for name in SLOT_ICONS:
            keys.setdefault("SlotIcon_" + name, []).append("slot:" + name)
    if scope in ("all", "talents"):
        # Hades I only, and asked for by the key the Mirror's own records carry.
        # Twenty-four of them: the twelve rows the game presents, both sides.
        talents = json.load(open(os.path.join(CATALOG, game, "talents.json")))
        for talent_id, record in talents.items():
            if record.get("icon"):
                keys.setdefault(record["icon"], []).append("talent:" + talent_id)
    if scope in ("all", "marker") and game == "hades2":
        # The Forget-Me-Not pin. Hades II's alone -- the first game has no such
        # resource and never will.
        keys.setdefault("Marker_ForgetMeNot", []).append("marker")
    return keys


def cropped(sprite, pages, decoded, np, texture2ddecoder):
    """A sprite's own rectangle, out of the atlas page holding it.

    Pages are decoded once and kept: a page carries dozens of the sprites in
    scope, and BC7 over a 4096-square page is the slow step here.
    """
    page_name = "bin\\Win\\Atlases\\" + sprite["page"].split("\\")[-1]
    page = pages.get(page_name) or pages.get(sprite["page"])
    if page is None:
        print("    page missing from package: %s" % sprite["page"])
        return None
    if page["fmt"] != atlas.BC7:
        print("    %s is format %d, not handled" % (page_name, page["fmt"]))
        return None
    if page_name not in decoded:
        raw = texture2ddecoder.decode_bc7(page["data"], page["w"], page["h"])
        # The decoder hands back BGRA; the channel order is the whole edit.
        decoded[page_name] = np.frombuffer(raw, np.uint8).reshape(
            page["h"], page["w"], 4
        )[:, :, [2, 1, 0, 3]]
    image = decoded[page_name]
    return image[sprite["y"] : sprite["y"] + sprite["h"], sprite["x"] : sprite["x"] + sprite["w"]]


def chrome(game, part, sprites, pages, decoded, np, texture2ddecoder):
    """One chrome part, left to right, from however many pieces the game ships.

    The pieces are the same height by construction -- the game lays them in one
    row -- so a mismatch means the wrong sprite was picked and is worth failing
    on rather than padding around.
    """
    by_name = {s["name"]: s for s in sprites}
    parts = []
    for path in CHROME_PARTS[game][part]:
        sprite = by_name.get(path)
        if sprite is None:
            print("    no sprite named %s" % path)
            return None
        piece = cropped(sprite, pages, decoded, np, texture2ddecoder)
        if piece is None:
            return None
        parts.append(piece)
    heights = {p.shape[0] for p in parts}
    if len(heights) != 1:
        raise ValueError("panel pieces disagree on height: %s" % sorted(heights))
    assembled = np.hstack(parts)

    # Trimmed to the solid part, which drops 62 transparent-to-soft rows above
    # the Hades II tray and nothing at all from Hades I's. That bloom is lighting
    # the game draws over the panel and it is only above part of the top edge, so
    # a nine-slice band containing it would smear it along the whole width.
    ys, xs = np.where(assembled[:, :, 3] > 200)
    return assembled[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", choices=sorted(GAMES), required=True)
    ap.add_argument(
        "--scope",
        choices=(
            "all", "boons", "gods", "keepsakes", "elements", "slots", "chrome",
            "talents", "marker",
        ),
        default="all",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import numpy as np
    import texture2ddecoder
    from PIL import Image

    spec = GAMES[args.game]
    content = os.path.expanduser(spec["content"])
    keys = wanted(args.game, args.scope)
    print("%s: %d icon keys in scope" % (args.game, len(keys)))

    sprites = atlas.sprites(content + spec["package"] + "_manifest")
    resolve = Resolver(content, sprites)
    targets, missing = {}, []
    for key in sorted(keys):
        found = resolve(key)
        if found:
            targets[key] = found
        else:
            missing.append(key)
    print("  resolved %d, unresolved %d" % (len(targets), len(missing)))
    for key in missing:
        print("    no sprite for %s (wanted by %s)" % (key, ", ".join(keys[key])))
    if args.dry_run:
        return 0

    print("  decompressing %s ..." % os.path.basename(spec["package"]))
    pages = {t["name"]: t for t in atlas.textures(pkg.decompress(content + spec["package"]))}

    out_dir = os.path.join(OUT, args.game)
    os.makedirs(out_dir, exist_ok=True)
    decoded, written, total_bytes = {}, 0, 0

    def emit(key, array):
        buf = io.BytesIO()
        Image.fromarray(array, "RGBA").save(buf, "WEBP", quality=QUALITY, method=6)
        open(os.path.join(out_dir, key + ".webp"), "wb").write(buf.getvalue())
        return buf.tell()

    # A boon's own picture, as against a symbol asked for by name. Only these are
    # tightened: an element mark and a slot glyph carry padding the game drew.
    boons = {k for k, w in keys.items() if any(":" not in x for x in w)}

    for key, sprite in sorted(targets.items()):
        crop = cropped(sprite, pages, decoded, np, texture2ddecoder)
        if crop is None:
            continue
        if args.game == "hades2" and key.startswith("BoonSymbol"):
            crop = reframe(crop, np)
        elif args.game == "hades2" and key in boons:
            crop = tighten(crop, np)
        written += 1
        total_bytes += emit(key, crop)

    if args.scope in ("all", "chrome"):
        for part in sorted(CHROME_PARTS[args.game]):
            piece = chrome(args.game, part, sprites, pages, decoded, np, texture2ddecoder)
            if piece is not None:
                written += 1
                total_bytes += emit(part, piece)
                print("  assembled %s at %dx%d" % (part, piece.shape[1], piece.shape[0]))

    print("  wrote %d files, %.2f MB, into %s" % (written, total_bytes / 1e6, out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
